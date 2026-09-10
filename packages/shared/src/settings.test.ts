import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ServerRecordSchema, SessionSchema, SettingsSchema } from './settings';

const session = {
  email: 'you@example.com',
  serverUrl: 'http://127.0.0.1:8787',
  token: 't',
  expiresAt: '2026-10-10T00:00:00.000Z',
};

describe('SettingsSchema（本地设置存储）', () => {
  it('默认设置为合法空态（feat02 场景5：无历史记录）', () => {
    expect(SettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.history).toHaveLength(0);
    expect(DEFAULT_SETTINGS.activeServerUrl).toBeNull();
    expect(DEFAULT_SETTINGS.session).toBeNull();
    expect(DEFAULT_SETTINGS.lastSyncAt).toBeNull();
  });

  it('历史服务器记录：URL 必须合法、带 lastLoginAt（feat02 场景1：登录成功自动记录）', () => {
    expect(
      ServerRecordSchema.safeParse({
        baseUrl: 'https://sync.example.com',
        lastLoginAt: '2026-09-10T00:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      ServerRecordSchema.safeParse({
        baseUrl: 'not-a-url',
        lastLoginAt: '2026-09-10T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('历史服务器最多 20 条', () => {
    const history = Array.from({ length: 21 }, (_, i) => ({
      baseUrl: `https://s${i}.example.com`,
      lastLoginAt: '2026-09-10T00:00:00.000Z',
    }));
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, history }).success).toBe(false);
  });

  it('会话：邮箱非法被拒；session 非空即已登录（feat03 场景4 / feat04 场景1）', () => {
    expect(SessionSchema.safeParse({ ...session, email: 'bad' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, session }).success).toBe(true);
  });
});
