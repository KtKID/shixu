import Dexie, { type EntityTable } from 'dexie';
import {
  BookmarkSchema,
  createBookmark,
  normalizeUrl,
  type Bookmark,
  type Classification,
} from '@x-threadpick/shared';
import type { TaxonomyRow } from './taxonomy';
import { notifyLocalChange } from './autosync';

/** 本地 IndexedDB 是主库（offline-first）；读取时经 shared schema 校验（边界）。 */

export interface ImportOutcome {
  imported: number;
  skipped: number;
  invalid: number;
}

class ThreadpickDB extends Dexie {
  bookmarks!: EntityTable<Bookmark, 'id'>;
  taxonomies!: EntityTable<TaxonomyRow, 'id'>;

  constructor() {
    super('threadpick');
    this.version(1).stores({
      bookmarks: 'id, urlNormalized, updatedAt',
    });
    this.version(2).stores({
      bookmarks: 'id, urlNormalized, updatedAt',
      taxonomies: 'id',
    });
  }
}

export const db = new ThreadpickDB();

/** 导入：URL 规范化（shared 唯一真源）→ 按 urlNormalized 判重 → 入库默认 Inbox。 */
export async function importBookmarks(
  items: ReadonlyArray<{ url: string; title: string }>,
): Promise<ImportOutcome> {
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

export async function getActiveBookmarks(): Promise<Bookmark[]> {
  const rows = await db.bookmarks.toArray();
  const parsed: Bookmark[] = [];
  for (const row of rows) {
    const result = BookmarkSchema.safeParse(row);
    if (result.success) {
      parsed.push(result.data);
    } else {
      console.warn('[x-threadpick] 本地记录校验失败，已忽略', result.error.issues);
    }
  }
  return parsed.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** 按规范化地址预读（判重）：同一页面忽略追踪参数差异后只存一份。 */
export async function getBookmarkByUrl(url: string): Promise<Bookmark | null> {
  const row = await db.bookmarks.get({ urlNormalized: normalizeUrl(url) });
  if (row === undefined) return null;
  const result = BookmarkSchema.safeParse(row);
  if (!result.success) {
    console.warn('[x-threadpick] 本地记录校验失败，已忽略', result.error.issues);
    return null;
  }
  return result.data;
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
 * - 命中且已软删除 → 复活同一条：deletedAt 清空、createdAt 保留最初值。
 */
export async function captureBookmark(
  input: CaptureBookmarkInput,
  now = new Date(),
): Promise<CaptureBookmarkOutcome> {
  const note = input.note.trim() === '' ? null : input.note;
  const existing = await getBookmarkByUrl(input.url);
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
    updatedAt: now.toISOString(),
    deletedAt: null,
  });
  await db.bookmarks.put(updated);
  notifyLocalChange();
  return { status: 'updated', bookmark: updated };
}
