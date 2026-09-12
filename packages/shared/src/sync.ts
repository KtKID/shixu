import { z } from 'zod';
import { BookmarkSchema } from './bookmark';
import { TaxonomySchema } from './taxonomy';
import { ViewSchema } from './view';

/**
 * 同步协议：客户端增量拉取（?since= updatedAt）+ 推送本地变更批次。
 * 冲突 last-write-wins（按 updatedAt 比较），软删除走 tombstone（deletedAt）。
 * taxonomy（分类取值集合）随 sync 一起同步：pull 必含，push 可选（旧客户端兼容）。
 */

export const SyncPullResponseSchema = z.object({
  serverTime: z.iso.datetime(),
  bookmarks: z.array(BookmarkSchema),
  views: z.array(ViewSchema),
  taxonomy: TaxonomySchema,
  /** 当前账号在服务器上的未删除收藏总数（sync-archive feat05：账号卡服务器概览行）。 */
  bookmarksTotal: z.number().int().nonnegative(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

export const SyncPushRequestSchema = z.object({
  bookmarks: z.array(BookmarkSchema).max(500),
  views: z.array(ViewSchema).max(200),
  taxonomy: TaxonomySchema.optional(),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export const SyncPushResponseSchema = z.object({
  serverTime: z.iso.datetime(),
  applied: z.object({
    bookmarks: z.number().int().nonnegative(),
    views: z.number().int().nonnegative(),
  }),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
