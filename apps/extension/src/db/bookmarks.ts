import Dexie, { type EntityTable } from 'dexie';
import { BookmarkSchema, createBookmark, type Bookmark } from '@x-threadpick/shared';
import type { TaxonomyRow } from './taxonomy';

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
