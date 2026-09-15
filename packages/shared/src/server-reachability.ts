import { z } from 'zod';

/**
 * 服务器可达性快照（扩展内部边界）：background 心跳（lib/server-heartbeat，5s 一次）
 * 探测后写入 browser.storage.session，设置页账号卡订阅该记录渲染「服务器已连接 / 不在线」。
 * 用 storage.session 而非 local：可达性是运行时状态，浏览器重启后天然失效重探，不留陈旧值。
 */
export const ServerReachabilitySchema = z.object({
  /** 本次探测的目标服务器（完整 baseUrl）；订阅方据此判断记录是否对应当前会话服务器 */
  baseUrl: z.url(),
  reachable: z.boolean(),
  checkedAt: z.iso.datetime(),
});
export type ServerReachability = z.infer<typeof ServerReachabilitySchema>;
