import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, ServerReachabilitySchema } from '@x-threadpick/shared';
import {
  SERVER_REACHABILITY_KEY,
  probeServerOnce,
  readServerReachability,
  subscribeServerReachability,
} from './server-heartbeat';
import { saveSettings } from '../db/settings';

const BASE_URL = 'http://127.0.0.1:60024';
const HEALTH_OK = { ok: true, version: 'v0.1.0', serverTime: '2026-09-14T00:00:00.000Z' };

function stubHealthzOk() {
  // 每次调用新建 Response：body 只能消费一次，复用同一对象会让第二次探测误判为不可达
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(HEALTH_OK), { status: 200 })),
      ),
  );
}

function stubHealthzDown() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('probeServerOnce', () => {
  it('服务器可达：写入 reachable=true 快照', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, activeServerUrl: BASE_URL });
    stubHealthzOk();

    await probeServerOnce();

    const record = await readServerReachability();
    expect(record).not.toBeNull();
    expect(record?.baseUrl).toBe(BASE_URL);
    expect(record?.reachable).toBe(true);
  });

  it('服务器不可达：写入 reachable=false 快照', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, activeServerUrl: BASE_URL });
    stubHealthzDown();

    await probeServerOnce();

    expect((await readServerReachability())?.reachable).toBe(false);
  });

  it('未配置服务器：不写记录、不发请求', async () => {
    stubHealthzOk();

    await probeServerOnce();

    expect(fetch).not.toHaveBeenCalled();
    expect(await readServerReachability()).toBeNull();
  });

  it('已登录：优先探测 session.serverUrl 而非 activeServerUrl', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      activeServerUrl: 'http://127.0.0.1:1',
      session: {
        serverUrl: BASE_URL,
        email: 'a@x.com',
        token: 't1',
        expiresAt: '2026-10-14T00:00:00.000Z',
      },
    });
    stubHealthzOk();

    await probeServerOnce();

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/healthz`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('状态未变：不重复写存储（不触发全局广播）；翻转时才写', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, activeServerUrl: BASE_URL });
    stubHealthzOk();
    const setSpy = vi.spyOn(browser.storage.session, 'set');

    await probeServerOnce();
    await probeServerOnce();
    expect(setSpy).toHaveBeenCalledTimes(1);

    stubHealthzDown(); // 服务器宕机 → 翻转
    await probeServerOnce();
    expect(setSpy).toHaveBeenCalledTimes(2);
    expect((await readServerReachability())?.reachable).toBe(false);
  });
});

describe('subscribeServerReachability', () => {
  it('心跳写入后广播新记录；其它存储区域变化不触发', async () => {
    const records: (string | null)[] = [];
    const unsubscribe = subscribeServerReachability((record) => {
      records.push(record === null ? null : `${record.baseUrl}|${record.reachable}`);
    });

    await browser.storage.local.set({ unrelated: 1 }); // local 区域：不触发
    expect(records).toEqual([]);

    const record = ServerReachabilitySchema.parse({
      baseUrl: BASE_URL,
      reachable: false,
      checkedAt: new Date().toISOString(),
    });
    await browser.storage.session.set({ [SERVER_REACHABILITY_KEY]: record });
    await vi.waitFor(() => {
      expect(records).toEqual([`${BASE_URL}|false`]);
    });

    unsubscribe();
  });
});
