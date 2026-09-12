import {
  BookmarkSchema,
  SnapshotArchiveSchema,
  TaxonomySchema,
  ViewSchema,
  type Bookmark,
  type BookmarkStatus,
  type FilterCondition,
  type SnapshotArchive,
  type SnapshotMeta,
  type Taxonomy,
  type View,
} from '@x-threadpick/shared';
import type { BookmarkRow, SnapshotRow, TaxonomyRow, ViewRow } from './schema';

/** 出入库映射全部经过 shared schema 解析：表结构漂移会在边界被拦下。 */

export function rowToBookmark(row: BookmarkRow): Bookmark {
  return BookmarkSchema.parse({
    id: row.id,
    url: row.url,
    urlNormalized: row.urlNormalized,
    title: row.title,
    summary: row.summary,
    note: row.note,
    classification: {
      topics: row.topics,
      types: row.types,
      purposes: row.purposes,
      status: row.status,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export function bookmarkToRow(bookmark: Bookmark, userId: string): BookmarkRow {
  const parsed = BookmarkSchema.parse(bookmark);
  return {
    id: parsed.id,
    userId,
    url: parsed.url,
    urlNormalized: parsed.urlNormalized,
    title: parsed.title,
    summary: parsed.summary,
    note: parsed.note,
    topics: parsed.classification.topics,
    types: parsed.classification.types,
    purposes: parsed.classification.purposes,
    status: parsed.classification.status,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    deletedAt: parsed.deletedAt,
  };
}

export function rowToView(row: ViewRow): View {
  return ViewSchema.parse({
    id: row.id,
    name: row.name,
    conditions: row.conditions,
    sortBy: row.sortBy,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export function viewToRow(view: View, userId: string): ViewRow {
  const parsed = ViewSchema.parse(view);
  return {
    id: parsed.id,
    userId,
    name: parsed.name,
    conditions: parsed.conditions satisfies FilterCondition[],
    sortBy: parsed.sortBy,
    sortOrder: parsed.sortOrder,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    deletedAt: parsed.deletedAt,
  };
}

export function rowToTaxonomy(row: TaxonomyRow): Taxonomy {
  return TaxonomySchema.parse({
    topic: row.topics,
    type: row.types,
    purpose: row.purposes,
    status: row.statuses,
    updatedAt: row.updatedAt,
  });
}

export function taxonomyToRow(taxonomy: Taxonomy, userId: string): TaxonomyRow {
  const parsed = TaxonomySchema.parse(taxonomy);
  return {
    userId,
    topics: parsed.topic,
    types: parsed.type,
    purposes: parsed.purpose,
    statuses: parsed.status,
    updatedAt: parsed.updatedAt,
  };
}

/** 快照 meta（列表项）：存档时间 + 展示口径条数。 */
export function rowToSnapshotMeta(row: SnapshotRow): SnapshotMeta {
  return { id: row.id, savedAt: row.savedAt, itemCount: row.itemCount };
}

/** 快照载荷出入过 shared schema：payload JSON 与表结构漂移在边界被拦下。 */
export function rowToSnapshotArchive(payload: unknown): SnapshotArchive {
  return SnapshotArchiveSchema.parse(payload);
}

export function snapshotArchiveToRow(
  archive: SnapshotArchive,
  userId: string,
  id: string,
  itemCount: number,
): SnapshotRow {
  const parsed = SnapshotArchiveSchema.parse(archive);
  return {
    id,
    userId,
    savedAt: parsed.savedAt,
    itemCount,
    payload: parsed,
  };
}

export type { BookmarkStatus };
