import { z } from 'zod';
import { BookmarkStatusSchema, DEFAULT_STATUS } from './taxonomy';
import { normalizeUrl } from './url';

/** Classification：四维分类属性。收藏时允许全空（默认 Inbox，后补）。形态（Type）为多选（capture spec feat04）。 */
export const ClassificationSchema = z.object({
  topics: z.array(z.string().min(1)).max(20),
  types: z.array(z.string().min(1)).max(10),
  purposes: z.array(z.string().min(1)).max(10),
  status: BookmarkStatusSchema,
});
export type Classification = z.infer<typeof ClassificationSchema>;

/**
 * Bookmark 三层结构：
 * Source（url/title/summary）+ Classification（四维）+ Context（note：为什么收藏）。
 * 同一 URL 只存一份，urlNormalized 是判重键。
 * iconUrl（task-card-brand-icon）：站点图标地址（只存 URL 文本，不存图片）；
 * null = 尚未取到/未尝试，收藏后由规则链异步回填。default(null) 兼容升级前的旧记录。
 */
export const BookmarkSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  urlNormalized: z.url(),
  title: z.string(),
  summary: z.string().nullable(),
  note: z.string().nullable(),
  iconUrl: z.url().nullable().default(null),
  classification: ClassificationSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

export interface NewBookmarkInput {
  url: string;
  title: string;
  note?: string | null;
}

/** 从导入/Capture 创建一条默认 Inbox 的新书签。id 由调用方生成。 */
export function createBookmark(id: string, input: NewBookmarkInput, now = new Date()): Bookmark {
  const ts = now.toISOString();
  return BookmarkSchema.parse({
    id,
    url: input.url,
    urlNormalized: normalizeUrl(input.url),
    title: input.title,
    summary: null,
    note: input.note ?? null,
    iconUrl: null,
    classification: { topics: [], types: [], purposes: [], status: DEFAULT_STATUS },
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  });
}
