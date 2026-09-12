import { type Bookmark, type Session } from '@x-threadpick/shared';
import { parseStoredBookmark } from './bookmarks';
import { getTaxonomy, saveTaxonomy } from './taxonomy';
import {
  currentLibraryKey,
  openLibrary,
  readLastSyncAt,
  writeLastSyncAt,
  type LibraryDB,
} from './library';
import { accountKey, loadSettings } from './settings';
import { syncPull, syncPush } from '../components/settings/api';

/**
 * 同步客户端（feat10；task-account-libraries T4 起按库作用）：
 * 同步只作用于「当前登录账号 + 该账号的本地库」——库键由会话唯一决定，
 * 推送该库 lastSyncAt 之后的本机变更（含 taxonomy 整包）→ 增量拉取 →
 * LWW 应用到本机 → lastSyncAt 刷新为 serverTime（存各库内 meta 表，随库互不影响）。
 * 计数口径：本次同步使本机实际发生的变更（新增/修改/删除）。
 * 服务器概览（feat05）：pull 成功后把服务器未删除收藏总数一并落库内 meta，
 * 供账号卡「服务器上共 N 条收藏」显示；只在成功时覆写 → 服务器连不上时保留最近一次成功值。
 */

export interface SyncChangeSummary {
  added: number;
  updated: number;
  deleted: number;
}

export type SyncResult =
  | { status: 'ok'; changes: SyncChangeSummary; pushed: number; syncedAt: string }
  | { status: 'not_logged_in' }
  | { status: 'unauthorized' }
  | { status: 'unreachable' }
  | { status: 'server_error' };

/** 服务器收藏总数存各库 meta 表（feat05），与 LAST_SYNC_AT_META_KEY 同表不同键。 */
export const SERVER_BOOKMARKS_TOTAL_META_KEY = 'serverBookmarksTotal';

const PUSH_CHUNK_SIZE = 500;

/** 读指定库的服务器收藏总数（feat05）：从未同步或值损坏时为 null。 */
export async function readServerBookmarksTotal(db: LibraryDB): Promise<number | null> {
  const row = await db.meta.get(SERVER_BOOKMARKS_TOTAL_META_KEY);
  if (row === undefined) return null;
  const n = Number(row.value); // 本模块自写（String(total)），读回仍按非负整数校验
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** 读当前库的服务器收藏总数（账号卡 feat05 场景1/2/3 显示依据）。 */
export async function readCurrentLibraryServerBookmarksTotal(): Promise<number | null> {
  return readServerBookmarksTotal(await openLibrary(await currentLibraryKey()));
}

export async function syncNow(): Promise<SyncResult> {
  const settings = await loadSettings();
  const session = settings.session;
  if (session === null) return { status: 'not_logged_in' };
  return syncSession(session);
}

/** 同步指定会话对应的账号库（登录切换前的首拉也走这里；不依赖当前 UI 状态）。 */
export async function syncSession(session: Session): Promise<SyncResult> {
  if (session.expiresAt <= new Date().toISOString()) return { status: 'unauthorized' };
  const baseUrl = session.serverUrl;
  const db = await openLibrary(accountKey(session));
  const since = await readLastSyncAt(db);

  // 推送：本机变更（含软删除墓碑），taxonomy 整包随首批上传（服务端 LWW 决定去留）
  const rows = await db.bookmarks.toArray();
  const localAll = rows.map(parseStoredBookmark).filter((b): b is Bookmark => b !== null);
  const changed = since === null ? localAll : localAll.filter((b) => b.updatedAt > since);
  const chunks: Bookmark[][] = [];
  for (let i = 0; i < changed.length; i += PUSH_CHUNK_SIZE) {
    chunks.push(changed.slice(i, i + PUSH_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push([]);
  for (const [index, chunk] of chunks.entries()) {
    const outcome =
      index === 0
        ? await syncPush(baseUrl, session.token, {
            bookmarks: chunk,
            views: [],
            taxonomy: await getTaxonomy(db),
          })
        : await syncPush(baseUrl, session.token, { bookmarks: chunk, views: [] });
    if (outcome.status !== 'ok') return { status: outcome.status };
  }

  // 拉取：同一 since 起点，服务端 LWW 已吸收方才推送
  const pull = await syncPull(baseUrl, session.token, since);
  if (pull.status !== 'ok') return { status: pull.status };

  // 应用：远端更新者覆盖本机；计数只反映本机实际变化
  const changes: SyncChangeSummary = { added: 0, updated: 0, deleted: 0 };
  for (const remote of pull.data.bookmarks) {
    const localRow = await db.bookmarks.get(remote.id);
    if (localRow === undefined) {
      if (remote.deletedAt !== null) continue; // 未知 id 的墓碑：本机无变化
      await db.bookmarks.put(remote);
      changes.added++;
      continue;
    }
    const local = parseStoredBookmark(localRow);
    if (local !== null && remote.updatedAt <= local.updatedAt) continue; // 本机更新或持平：保留
    if (remote.deletedAt !== null) {
      await db.bookmarks.put(remote);
      changes.deleted++;
    } else if (local !== null && local.deletedAt !== null) {
      await db.bookmarks.put(remote); // 远端复活本机墓碑：对本机视为新增
      changes.added++;
    } else {
      await db.bookmarks.put(remote);
      changes.updated++;
    }
  }

  // taxonomy 整体 LWW（feat08 场景2/3）
  const localTaxonomy = await getTaxonomy(db);
  if (pull.data.taxonomy.updatedAt > localTaxonomy.updatedAt) {
    await saveTaxonomy(pull.data.taxonomy, db);
  }

  // 服务器概览（feat05）：仅在 pull 成功时覆写 → 场景3 连不上时保留最近一次成功值
  await db.meta.put({
    key: SERVER_BOOKMARKS_TOTAL_META_KEY,
    value: String(pull.data.bookmarksTotal),
  });

  await writeLastSyncAt(db, pull.data.serverTime);
  return { status: 'ok', changes, pushed: changed.length, syncedAt: pull.data.serverTime };
}
