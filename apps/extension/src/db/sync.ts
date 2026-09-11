import { BookmarkSchema, type Bookmark } from '@x-threadpick/shared';
import { db, getActiveBookmarks } from './bookmarks';
import { getTaxonomy, saveTaxonomy } from './taxonomy';
import { loadSettings, saveSettings } from './settings';
import { syncPull, syncPush } from '../components/settings/api';

/**
 * 同步客户端（feat10）：推送 lastSyncAt 之后的本机变更（含 taxonomy 整包）→
 * 增量拉取 → LWW 应用到本机 → lastSyncAt 刷新为 serverTime。
 * 计数口径：本次同步使本机实际发生的变更（新增/修改/删除）。
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

const PUSH_CHUNK_SIZE = 500;

export async function syncNow(): Promise<SyncResult> {
  const settings = await loadSettings();
  const session = settings.session;
  if (session === null) return { status: 'not_logged_in' };
  if (session.expiresAt <= new Date().toISOString()) return { status: 'unauthorized' };
  const baseUrl = session.serverUrl;
  const since = settings.lastSyncAt;

  // 推送：本机变更（含软删除墓碑），taxonomy 整包随首批上传（服务端 LWW 决定去留）
  const localAll = await getActiveBookmarks();
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
            taxonomy: await getTaxonomy(),
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
    const local = BookmarkSchema.safeParse(localRow);
    if (local.success && remote.updatedAt <= local.data.updatedAt) continue; // 本机更新或持平：保留
    if (remote.deletedAt !== null) {
      await db.bookmarks.put(remote);
      changes.deleted++;
    } else if (local.success && local.data.deletedAt !== null) {
      await db.bookmarks.put(remote); // 远端复活本机墓碑：对本机视为新增
      changes.added++;
    } else {
      await db.bookmarks.put(remote);
      changes.updated++;
    }
  }

  // taxonomy 整体 LWW（feat08 场景2/3）
  const localTaxonomy = await getTaxonomy();
  if (pull.data.taxonomy.updatedAt > localTaxonomy.updatedAt) {
    await saveTaxonomy(pull.data.taxonomy);
  }

  await saveSettings({ ...settings, lastSyncAt: pull.data.serverTime });
  return { status: 'ok', changes, pushed: changed.length, syncedAt: pull.data.serverTime };
}
