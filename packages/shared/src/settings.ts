import { z } from 'zod';

/**
 * 本地设置（browser.storage.local 单 key 存储，扩展端唯一读写入口，出入过 schema 校验）。
 * 服务器地址统一存完整 baseUrl（含协议）；host/端口拆分输入由前端负责拼装。
 */

export const ServerRecordSchema = z.object({
  baseUrl: z.url(),
  lastLoginAt: z.iso.datetime(),
});
export type ServerRecord = z.infer<typeof ServerRecordSchema>;

/** 登录会话；session 为 null 即未登录（feat03 场景4 保持登录 / feat04 场景1 退出清除）。 */
export const SessionSchema = z.object({
  email: z.email(),
  serverUrl: z.url(),
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SettingsSchema = z.object({
  activeServerUrl: z.url().nullable(),
  history: z.array(ServerRecordSchema).max(20),
  session: SessionSchema.nullable(),
  lastSyncAt: z.iso.datetime().nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  activeServerUrl: null,
  history: [],
  session: null,
  lastSyncAt: null,
};
