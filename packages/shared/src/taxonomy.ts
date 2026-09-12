import { z } from 'zod';

/**
 * 四个类型化维度（MVP 固定，取值用户可自定义）。
 * 存储层统一为 dimension → values[] 的 typed attributes 模型。
 */
export const DIMENSIONS = ['topic', 'type', 'purpose', 'status'] as const;
export const DimensionSchema = z.enum(DIMENSIONS);
export type Dimension = z.infer<typeof DimensionSchema>;

/** 取值长度上限（spec feat06 场景4：超长提示并不保存）。 */
export const TAXONOMY_VALUE_MAX = 30;

/** Status：单选维度，取值用户自定义、互不关联（2026-09 修订：无流转语义）。 */
export const BookmarkStatusSchema = z.string().min(1).max(TAXONOMY_VALUE_MAX);
export type BookmarkStatus = z.infer<typeof BookmarkStatusSchema>;

/** 系统默认状态：不可删除，新收藏永远默认落在这里（spec feat07 场景3/4）。 */
export const DEFAULT_STATUS: BookmarkStatus = 'inbox';
export const PROTECTED_STATUS_VALUES: readonly BookmarkStatus[] = [DEFAULT_STATUS];

const DimensionValuesSchema = z
  .array(z.string().min(1).max(TAXONOMY_VALUE_MAX))
  .max(100)
  .refine((values) => new Set(values).size === values.length, {
    message: '同一维度内取值不可重复',
  });

/**
 * Taxonomy：四个维度的取值集合（每用户一份，整体 last-write-wins 同步）。
 * status 必须始终包含系统默认值 inbox（feat07 场景3：默认状态不可删除）。
 */
export const TaxonomySchema = z.object({
  topic: DimensionValuesSchema,
  type: DimensionValuesSchema,
  purpose: DimensionValuesSchema,
  status: DimensionValuesSchema.refine((values) => values.includes(DEFAULT_STATUS), {
    message: `status 必须包含系统默认值「${DEFAULT_STATUS}」`,
  }),
  updatedAt: z.iso.datetime(),
});
export type Taxonomy = z.infer<typeof TaxonomySchema>;

/** 首次使用的默认取值集合（spec feat05 场景1）。 */
export const DEFAULT_TAXONOMY_VALUES = {
  topic: ['项目管理', '会议纪要', '行业报告', '办公技巧'],
  type: ['网页文章', '在线文档', '数据表格', '演示文稿'],
  purpose: ['工作参考', '汇报材料', '模板备用'],
  status: ['inbox', '进行中', '已完成'],
} as const;

/**
 * epoch 初始 updatedAt：保证未登录期间的本地修改（updatedAt=当前时间）
 * 在 last-write-wins 比较中必然胜过初始 seed（spec feat08 场景2）。
 */
export const TAXONOMY_EPOCH = '1970-01-01T00:00:00.000Z';

export function createDefaultTaxonomy(): Taxonomy {
  return TaxonomySchema.parse({
    topic: [...DEFAULT_TAXONOMY_VALUES.topic],
    type: [...DEFAULT_TAXONOMY_VALUES.type],
    purpose: [...DEFAULT_TAXONOMY_VALUES.purpose],
    status: [...DEFAULT_TAXONOMY_VALUES.status],
    updatedAt: TAXONOMY_EPOCH,
  });
}

// ---- taxonomy 端点协议 ----

export const TaxonomyGetResponseSchema = z.object({
  taxonomy: TaxonomySchema,
});

/** PUT 请求体即完整 Taxonomy；服务端按 updatedAt 做 last-write-wins。 */
export const TaxonomyPutRequestSchema = TaxonomySchema;

/** 返回胜出版本（可能是库内既有版本，供客户端对齐）。 */
export const TaxonomyPutResponseSchema = z.object({
  taxonomy: TaxonomySchema,
  serverTime: z.iso.datetime(),
});
