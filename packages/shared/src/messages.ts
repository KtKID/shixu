import { z } from 'zod';

/** 扩展内部消息协议（页面 → background）；出入一律 schema 解析，不手写判断。 */
export const AutoSyncMessageSchema = z.object({
  type: z.literal('local-change'),
});
export type AutoSyncMessage = z.infer<typeof AutoSyncMessageSchema>;
