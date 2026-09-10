import { z } from 'zod';
import { DimensionSchema } from './taxonomy';

/**
 * View = 筛选条件 + 排序规则，不是书签副本。
 * 删除视图只删入口，不删书签。
 */

/** any=满足任一（同维度默认 OR）；all=全部满足（Topic 维度的「全部满足」切换）。 */
export const ConditionModeSchema = z.enum(['any', 'all']);
export type ConditionMode = z.infer<typeof ConditionModeSchema>;

export const FilterConditionSchema = z.object({
  dimension: DimensionSchema,
  values: z.array(z.string().min(1)).min(1),
  mode: ConditionModeSchema,
});
export type FilterCondition = z.infer<typeof FilterConditionSchema>;

export const SortBySchema = z.enum(['createdAt', 'updatedAt', 'title']);
export const SortOrderSchema = z.enum(['asc', 'desc']);

export const ViewSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  conditions: z.array(FilterConditionSchema),
  sortBy: SortBySchema,
  sortOrder: SortOrderSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
export type View = z.infer<typeof ViewSchema>;
