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
  });

  it('lastSyncAt 不再是全局设置（task-account-libraries T1：同步进度由各库自持）', () => {
    expect('lastSyncAt' in DEFAULT_SETTINGS).toBe(false);
    expect('lastSyncAt' in SettingsSchema.shape).toBe(false);
  });

  it('newtabEnabled 默认关：旧记录缺字段 parse 补 false，浏览器新标签页默认不被干预（feat-newtab）', () => {
    expect(DEFAULT_SETTINGS.newtabEnabled).toBe(false);
    const legacy = SettingsSchema.parse({ activeServerUrl: null, history: [], session: null });
    expect(legacy.newtabEnabled).toBe(false);
  });

  it('存量记录里遗留的 lastSyncAt 被 parse 剔除（升级兼容，不参与协议）', () => {
    const parsed = SettingsSchema.parse({
      ...DEFAULT_SETTINGS,
      lastSyncAt: '2026-09-10T00:00:00.000Z',
    });
    expect('lastSyncAt' in parsed).toBe(false);
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

describe('autoSync 按账号开关（feat11）', () => {
  it('默认为空表（场景4：默认关闭）', () => {
    expect(DEFAULT_SETTINGS.autoSync).toEqual({});
  });

  it('接受 账号key→布尔 的记录并随 Settings 持久化', () => {
    const key = 'http://127.0.0.1:8787#you@example.com';
    const parsed = SettingsSchema.parse({ ...DEFAULT_SETTINGS, autoSync: { [key]: true } });
    expect(parsed.autoSync[key]).toBe(true);
  });
});
