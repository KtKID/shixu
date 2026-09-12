import { z } from 'zod';
import { BookmarkSchema } from './bookmark';
import { TaxonomySchema } from './taxonomy';

/**
 * 快照存档协议（sync-archive feat07/feat08/feat09）：
 * 把整库（全部收藏记录，含墓碑，+ 分类取值清单）一键存成带时间的快照，按账号存服务器。
 * - 列表只回 meta（id / savedAt / itemCount），详情才回全量载荷；
 * - itemCount 是展示口径的收藏条数（活跃收藏数），由客户端计算、服务端只存不校验语义；
 * - 载荷含墓碑：恢复后已删条目不复活（feat09 场景1 的替换语义保持一致）。
 */

/** 快照列表项（meta）：新到旧排列由服务端负责，schema 不约束顺序。 */
export const SnapshotMetaSchema = z.object({
  id: z.uuid(),
  savedAt: z.iso.datetime(),
  itemCount: z.number().int().nonnegative(),
});
export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>;

/** 存档载荷：书签全量（含墓碑）+ 取值清单 + 存档时间。POST /snapshots 请求体同形。 */
export const SnapshotArchiveSchema = z.object({
  savedAt: z.iso.datetime(),
  bookmarks: z.array(BookmarkSchema),
  taxonomy: TaxonomySchema,
});
export type SnapshotArchive = z.infer<typeof SnapshotArchiveSchema>;

export const SnapshotCreateRequestSchema = SnapshotArchiveSchema;
export type SnapshotCreateRequest = SnapshotArchive;

export const SnapshotCreateResponseSchema = z.object({
  snapshot: SnapshotMetaSchema,
});
export type SnapshotCreateResponse = z.infer<typeof SnapshotCreateResponseSchema>;

export const SnapshotListResponseSchema = z.object({
  snapshots: z.array(SnapshotMetaSchema),
});
export type SnapshotListResponse = z.infer<typeof SnapshotListResponseSchema>;

/** 快照详情：meta + 全量载荷（恢复用）。 */
export const SnapshotDetailResponseSchema = SnapshotArchiveSchema.extend({
  id: z.uuid(),
  itemCount: z.number().int().nonnegative(),
});
export type SnapshotDetailResponse = z.infer<typeof SnapshotDetailResponseSchema>;

export const SnapshotDeleteResponseSchema = z.object({
  ok: z.literal(true),
});
export type SnapshotDeleteResponse = z.infer<typeof SnapshotDeleteResponseSchema>;
