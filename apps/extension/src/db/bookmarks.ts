import {
  BookmarkSchema,
  createBookmark,
  normalizeUrl,
  type Bookmark,
  type Classification,
} from '@x-threadpick/shared';
import { currentLibrary, type LibraryDB } from './library';
import { notifyLocalChange } from './autosync';

/**
 * 本地 IndexedDB 是主库（offline-first）；读取时经 shared schema 校验（边界）。
 * 多库架构（task-account-libraries T4）：读写一律经当前库句柄（未登录 default / 登录账号库），
 * 登录、登出、切换只换库，数据互不混入。
 */

export interface ImportOutcome {
  imported: number;
  skipped: number;
  invalid: number;
}

/** 行解析：损坏记录警告后跳过（null）。日志带记录标识与具体 issue，便于定位是哪条数据坏在哪。 */
export function parseStoredBookmark(row: Bookmark): Bookmark | null {
  const result = BookmarkSchema.safeParse(row);
  if (!result.success) {
    console.warn(
      '[x-threadpick] 本地记录校验失败，已忽略',
      JSON.stringify({ id: row.id, url: row.url, issues: result.error.issues }),
    );
    return null;
  }
  return result.data;
}

/** 导入：URL 规范化（shared 唯一真源）→ 按 urlNormalized 判重 → 入库默认 Inbox。 */
export async function importBookmarks(
  items: ReadonlyArray<{ url: string; title: string }>,
): Promise<ImportOutcome> {
  const db = await currentLibrary();
  const outcome: ImportOutcome = { imported: 0, skipped: 0, invalid: 0 };
  for (const item of items) {
    let bookmark: Bookmark;
    try {
      bookmark = createBookmark(crypto.randomUUID(), item);
    } catch {
      outcome.invalid++;
      continue;
    }
    const existing = await db.bookmarks.get({ urlNormalized: bookmark.urlNormalized });
    if (existing !== undefined) {
      outcome.skipped++;
      continue;
    }
    await db.bookmarks.add(bookmark);
    outcome.imported++;
  }
  if (outcome.imported > 0) notifyLocalChange();
  return outcome;
}

/** 活跃收藏（墓碑不计，sync-archive feat02 场景1）：主页/弹窗列表与条数统计的统一口径。 */
export async function getActiveBookmarks(db?: LibraryDB): Promise<Bookmark[]> {
  const handle = db ?? (await currentLibrary());
  const rows = await handle.bookmarks.toArray();
  const parsed: Bookmark[] = [];
  for (const row of rows) {
    const bookmark = parseStoredBookmark(row);
    if (bookmark !== null && bookmark.deletedAt === null) parsed.push(bookmark);
  }
  return parsed.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** 按规范化地址预读（判重）：同一页面忽略追踪参数差异后只存一份。 */
export async function getBookmarkByUrl(url: string, db?: LibraryDB): Promise<Bookmark | null> {
  const handle = db ?? (await currentLibrary());
  const row = await handle.bookmarks.get({ urlNormalized: normalizeUrl(url) });
  if (row === undefined) return null;
  return parseStoredBookmark(row);
}

export interface CaptureBookmarkInput {
  url: string;
  title: string;
  /** 面板理由原文；空串视为未填写（落库为 null）。 */
  note: string;
  /** 面板四维点选结果（零点选 = 三维空 + Inbox）。 */
  classification: Classification;
}

export type CaptureBookmarkOutcome =
  { status: 'created'; bookmark: Bookmark } | { status: 'updated'; bookmark: Bookmark };

/**
 * 收藏 upsert（feat05/feat06）：
 * - 未命中 → 新建一条（四维按面板内容，软删除标记为空）；
 * - 命中 → 同一条更新：标题刷新、updatedAt 前移、理由与四维按面板内容覆盖（清空理由即置空）；
 * - 命中且已软删除 → 复活同一条：deletedAt 清空、收藏时间重置为本次
 *   （sync-archive feat02 场景2：删除后重新收藏不保留原收藏时间）。
 */
export async function captureBookmark(
  input: CaptureBookmarkInput,
  now = new Date(),
): Promise<CaptureBookmarkOutcome> {
  const db = await currentLibrary();
  const note = input.note.trim() === '' ? null : input.note;
  const existing = await getBookmarkByUrl(input.url, db);
  if (existing === null) {
    const bookmark = BookmarkSchema.parse({
      ...createBookmark(crypto.randomUUID(), { url: input.url, title: input.title }, now),
      note,
      classification: input.classification,
    });
    await db.bookmarks.add(bookmark);
    notifyLocalChange();
    return { status: 'created', bookmark };
  }
  const updated = BookmarkSchema.parse({
    ...existing,
    title: input.title,
    note,
    classification: input.classification,
    createdAt: existing.deletedAt !== null ? now.toISOString() : existing.createdAt,
    updatedAt: now.toISOString(),
    deletedAt: null,
  });
  await db.bookmarks.put(updated);
  notifyLocalChange();
  return { status: 'updated', bookmark: updated };
}
