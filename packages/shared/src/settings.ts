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
  /** 自动同步开关，按账号记忆：key = `${serverUrl}#${email}`（feat11 场景3/4）。缺省补 {}（兼容旧记录）。 */
  autoSync: z.record(z.string(), z.boolean()).default({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  activeServerUrl: null,
  history: [],
  session: null,
  autoSync: {},
};

/**
 * 兼容读取：旧版全局 lastSyncAt（新版 SettingsSchema 已剔除）。
 * 仅用于存量升级迁移（task-account-libraries T3）把旧同步进度带入对应账号库。
 */
export const LegacyLastSyncAtSchema = z.object({
  lastSyncAt: z.iso.datetime().nullable(),
});
