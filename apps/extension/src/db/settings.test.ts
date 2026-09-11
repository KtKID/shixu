import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, type Session } from '@x-threadpick/shared';
import {
  clearSession,
  loadSettings,
  recordServerLogin,
  removeServerRecord,
  setActiveServer,
  setAutoSync,
  accountKey,
  updateServerRecord,
} from './settings';

const S1 = 'https://s1.example:8443';
const S2 = 'https://s2.example:9000';

function makeSession(serverUrl: string): Session {
  return {
    email: 'a@x.com',
    serverUrl,
    token: 'tok-1',
    expiresAt: '2030-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loadSettings', () => {
  it('无记录时返回默认值（feat02 场景5 的空态来源）', async () => {
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('记录损坏时回退默认值，不抛出', async () => {
    await browser.storage.local.set({ settings: { activeServerUrl: 42, history: 'x' } });
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});

describe('recordServerLogin', () => {
  it('登录成功后记录历史、置顶并设为当前（feat02 场景1）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T10:00:00Z'));
    const next = await recordServerLogin(S1, makeSession(S1));
    expect(next.history).toHaveLength(1);
    expect(next.history[0]?.baseUrl).toBe(S1);
    expect(next.history[0]?.lastLoginAt).toBe('2026-09-10T10:00:00.000Z');
    expect(next.activeServerUrl).toBe(S1);
    expect(next.session).toEqual(makeSession(S1));
  });

  it('同一服务器再次登录：去重置顶并刷新 lastLoginAt（feat02 场景1）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T10:00:00Z'));
    await recordServerLogin(S1, makeSession(S1));
    vi.setSystemTime(new Date('2026-09-10T11:00:00Z'));
    await recordServerLogin(S2, makeSession(S2));
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    const next = await recordServerLogin(S1, makeSession(S1));
    expect(next.history.map((s) => s.baseUrl)).toEqual([S1, S2]);
    expect(next.history[0]?.lastLoginAt).toBe('2026-09-10T12:00:00.000Z');
    expect(next.activeServerUrl).toBe(S1);
  });

  it('历史上限 20 条（旧记录被挤出）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T10:00:00Z'));
    for (let i = 0; i < 25; i++) {
      const url = `https://s${i}.example:8443`;
      await recordServerLogin(url, makeSession(url));
      vi.advanceTimersByTime(1000);
    }
    const next = await loadSettings();
    expect(next.history).toHaveLength(20);
    expect(next.history[0]?.baseUrl).toBe('https://s24.example:8443');
    expect(next.history.some((s) => s.baseUrl === 'https://s0.example:8443')).toBe(false);
  });
});

describe('setActiveServer', () => {
  it('只切换当前指针，不动历史与会话（feat02 场景2）', async () => {
    await recordServerLogin(S1, makeSession(S1));
    await recordServerLogin(S2, makeSession(S2));
    const next = await setActiveServer(S1);
    expect(next.activeServerUrl).toBe(S1);
    expect(next.history.map((s) => s.baseUrl)).toEqual([S2, S1]);
    expect(next.session?.serverUrl).toBe(S2);
  });
});

describe('updateServerRecord', () => {
  it('改写记录地址；改当前服务器时 activeServerUrl 跟随（feat02 场景3）', async () => {
    await recordServerLogin(S1, makeSession(S1));
    const next = await updateServerRecord(S1, 'https://new.example:9000');
    expect(next.history).toHaveLength(1);
    expect(next.history[0]?.baseUrl).toBe('https://new.example:9000');
    expect(next.activeServerUrl).toBe('https://new.example:9000');
  });

  it('改非当前服务器不影响 activeServerUrl（feat02 场景3）', async () => {
    await recordServerLogin(S1, makeSession(S1));
    await recordServerLogin(S2, makeSession(S2));
    const next = await updateServerRecord(S1, 'https://new.example:9000');
    expect(next.activeServerUrl).toBe(S2);
    expect(next.history.map((s) => s.baseUrl)).toEqual([S2, 'https://new.example:9000']);
  });

  it('改后的地址与其它历史记录撞车时合并，保留被编辑条', async () => {
    await recordServerLogin(S1, makeSession(S1));
    await recordServerLogin(S2, makeSession(S2));
    const next = await updateServerRecord(S1, S2);
    expect(next.history.map((s) => s.baseUrl)).toEqual([S2]);
  });

  it('记录不存在时原样返回', async () => {
    await recordServerLogin(S1, makeSession(S1));
    const next = await updateServerRecord('https://ghost.example:1', S2);
    expect(next.history.map((s) => s.baseUrl)).toEqual([S1]);
  });
});

describe('removeServerRecord', () => {
  it('删除非当前记录（feat02 场景4）', async () => {
    await recordServerLogin(S1, makeSession(S1));
    await recordServerLogin(S2, makeSession(S2));
    const next = await removeServerRecord(S1);
    expect(next.history.map((s) => s.baseUrl)).toEqual([S2]);
    expect(next.activeServerUrl).toBe(S2);
  });

  it('删除当前记录后 activeServerUrl 保留（地址栏内容不变，feat02 场景4）', async () => {
    await recordServerLogin(S1, makeSession(S1));
    const next = await removeServerRecord(S1);
    expect(next.history).toHaveLength(0);
    expect(next.activeServerUrl).toBe(S1);
  });
});

describe('clearSession', () => {
  it('退出仅清 session，历史与当前指针不动（feat04 场景1）', async () => {
    await recordServerLogin(S1, makeSession(S1));
    const next = await clearSession();
    expect(next.session).toBeNull();
    expect(next.activeServerUrl).toBe(S1);
    expect(next.history).toHaveLength(1);
  });
});

describe('自动同步开关按账号记忆（feat11）', () => {
  it('accountKey 由 服务器地址#邮箱 组成', () => {
    expect(accountKey(makeSession(S1))).toBe(`${S1}#a@x.com`);
  });

  it('场景3/4：A 账号开启不影响 B 账号；未设置默认 false', async () => {
    const s1 = await recordServerLogin(S1, makeSession(S1));
    await setAutoSync(accountKey(s1.session ?? makeSession(S1)), true);
    const stored = await loadSettings();
    expect(stored.autoSync[`${S1}#a@x.com`]).toBe(true);
    expect(stored.autoSync[`${S2}#a@x.com`]).toBeUndefined();
    expect(stored.autoSync[`${S1}#b@x.com`]).toBeUndefined();
  });

  it('取消勾选写回 false', async () => {
    const session = makeSession(S1);
    await recordServerLogin(S1, session);
    await setAutoSync(accountKey(session), true);
    const next = await setAutoSync(accountKey(session), false);
    expect(next.autoSync[accountKey(session)]).toBe(false);
  });
});
