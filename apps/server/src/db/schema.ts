import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { FilterCondition, SnapshotArchive } from '@x-threadpick/shared';

/**
 * 表结构对齐 packages/shared 的 zod schema（对外协议以 shared 为准）。
 * bookmark 判重由客户端按 urlNormalized 负责（本地库唯一），
 * 服务端按 id upsert + last-write-wins，不设 url 唯一约束。
 */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    url: text('url').notNull(),
    urlNormalized: text('url_normalized').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    note: text('note'),
    iconUrl: text('icon_url'),
    topics: text('topics', { mode: 'json' }).$type<string[]>().notNull(),
    types: text('types', { mode: 'json' }).$type<string[]>().notNull(),
    purposes: text('purposes', { mode: 'json' }).$type<string[]>().notNull(),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('bookmarks_user_updated_idx').on(t.userId, t.updatedAt),
    index('bookmarks_user_url_idx').on(t.userId, t.urlNormalized),
  ],
);

export const views = sqliteTable(
  'views',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    conditions: text('conditions', { mode: 'json' }).$type<FilterCondition[]>().notNull(),
    sortBy: text('sort_by').notNull(),
    sortOrder: text('sort_order').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('views_user_updated_idx').on(t.userId, t.updatedAt)],
);

/** 每用户一行：四个维度的取值集合 + 整体 updatedAt（LWW）。 */
export const taxonomies = sqliteTable('taxonomies', {
  userId: text('user_id').primaryKey(),
  topics: text('topics', { mode: 'json' }).$type<string[]>().notNull(),
  types: text('types', { mode: 'json' }).$type<string[]>().notNull(),
  purposes: text('purposes', { mode: 'json' }).$type<string[]>().notNull(),
  statuses: text('statuses', { mode: 'json' }).$type<string[]>().notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * 快照存档（sync-archive feat07）：按账号存整库快照，v1 结构化文本入 SQLite（不涉对象存储）。
 * payload 整体存 JSON（书签全量含墓碑 + taxonomy + savedAt）；itemCount 为展示口径（活跃收藏数）。
 */
export const snapshots = sqliteTable(
  'snapshots',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    savedAt: text('saved_at').notNull(),
    itemCount: integer('item_count').notNull(),
    payload: text('payload', { mode: 'json' }).$type<SnapshotArchive>().notNull(),
  },
  (t) => [index('snapshots_user_saved_idx').on(t.userId, t.savedAt)],
);

export type UserRow = typeof users.$inferSelect;
export type BookmarkRow = typeof bookmarks.$inferSelect;
export type ViewRow = typeof views.$inferSelect;
export type TaxonomyRow = typeof taxonomies.$inferSelect;
export type SnapshotRow = typeof snapshots.$inferSelect;
