import { z } from 'zod';

/**
 * 唤起收藏面板时暂存的目标标签信息。
 * background 写入 browser.storage.session，popup 读取时经本 schema 校验（扩展内部边界）。
 */
export const CaptureTargetSchema = z.object({
  tabId: z.number().int(),
  url: z.string(),
  title: z.string(),
  pinned: z.boolean(),
});

export type CaptureTarget = z.infer<typeof CaptureTargetSchema>;
