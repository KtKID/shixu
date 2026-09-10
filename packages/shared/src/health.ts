import { z } from 'zod';

/** GET /healthz：测试连接时展示往返延迟与服务版本（spec feat01 场景1）。 */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string().min(1),
  serverTime: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
