import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { FilterCondition } from '@x-threadpick/shared';

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

export type UserRow = typeof users.$inferSelect;
export type BookmarkRow = typeof bookmarks.$inferSelect;
export type ViewRow = typeof views.$inferSelect;
export type TaxonomyRow = typeof taxonomies.$inferSelect;
