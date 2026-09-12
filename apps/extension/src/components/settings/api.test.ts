import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildBaseUrl,
  login,
  register,
  splitBaseUrl,
  syncPull,
  syncPush,
  testConnection,
} from './api';

describe('buildBaseUrl', () => {
  it('公网域名缺省 https', () => {
    expect(buildBaseUrl('sync.example.com', '8443')).toBe('https://sync.example.com:8443');
  });

  it('显式协议优先', () => {
    expect(buildBaseUrl('http://192.168.1.8', '9000')).toBe('http://192.168.1.8:9000');
    expect(buildBaseUrl('https://sync.example.com', '8443')).toBe('https://sync.example.com:8443');
  });

  it('本地/内网地址缺省 http（开发服务）', () => {
    expect(buildBaseUrl('localhost', '8787')).toBe('http://localhost:8787');
    expect(buildBaseUrl('127.0.0.1', '8787')).toBe('http://127.0.0.1:8787');
    expect(buildBaseUrl('192.168.1.8', '9000')).toBe('http://192.168.1.8:9000');
  });

  it('host 栏粘贴 host:port 且端口栏为空时拆出', () => {
    expect(buildBaseUrl('localhost:8787', '')).toBe('http://localhost:8787');
    expect(buildBaseUrl('sync.example.com:8443', '')).toBe('https://sync.example.com:8443');
  });

  it('括号 IPv6 支持', () => {
    expect(buildBaseUrl('[::1]', '8787')).toBe('http://[::1]:8787');
    expect(buildBaseUrl('[::1]:8787', '')).toBe('http://[::1]:8787');
  });

  it('地址或端口缺失/非法返回 null（feat01 场景2 判定）', () => {
    expect(buildBaseUrl('', '8443')).toBeNull();
    expect(buildBaseUrl('sync.example.com', '')).toBeNull();
    expect(buildBaseUrl('sync.example.com', 'abc')).toBeNull();
    expect(buildBaseUrl('sync.example.com', '99999')).toBeNull();
    expect(buildBaseUrl('sync.example.com/x', '8443')).toBeNull();
    expect(buildBaseUrl(' ', ' ')).toBeNull();
  });
});

describe('splitBaseUrl', () => {
  it('还原 host 与显式端口', () => {
    expect(splitBaseUrl('https://sync.example.com:8443/')).toEqual({
      host: 'sync.example.com',
      port: '8443',
    });
  });

  it('无显式端口按协议补默认端口', () => {
    expect(splitBaseUrl('https://sync.example.com/')).toEqual({
      host: 'sync.example.com',
      port: '443',
    });
    expect(splitBaseUrl('http://192.168.1.8/')).toEqual({ host: '192.168.1.8', port: '80' });
  });
});

describe('testConnection（feat01 场景1/3 协议面）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('healthz 成功：解析版本并返回非负延迟', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ok: true, version: 'v0.1.0', serverTime: '2026-09-10T00:00:00.000Z' }),
            { status: 200 },
          ),
        ),
    );
    const result = await testConnection('https://sync.example.com:8443');
    expect(result.version).toBe('v0.1.0');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('healthz 非 2xx 或协议不符：抛错（UI 显示连接失败）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502 })));
    await expect(testConnection('https://sync.example.com:8443')).rejects.toThrow();
  });

  it('网络不可达：抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(testConnection('https://ghost.example:1')).rejects.toThrow();
  });
});

describe('login', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('登录成功：解析 token 与过期时间', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: 't1', expiresAt: '2026-10-10T00:00:00.000Z' }), {
          status: 200,
        }),
      ),
    );
    await expect(
      login('https://s:1', { email: 'a@x.com', password: 'password1' }),
    ).resolves.toEqual({
      status: 'ok',
      token: 't1',
      expiresAt: '2026-10-10T00:00:00.000Z',
    });
  });

  it('401 → invalid_credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'INVALID_CREDENTIALS' }), { status: 401 }),
        ),
    );
    await expect(
      login('https://s:1', { email: 'a@x.com', password: 'password1' }),
    ).resolves.toEqual({
      status: 'invalid_credentials',
    });
  });

  it('网络异常 → unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(
      login('https://s:1', { email: 'a@x.com', password: 'password1' }),
    ).resolves.toEqual({
      status: 'unreachable',
    });
  });

  it('响应协议不符 → server_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: 1 }), { status: 200 })),
    );
    await expect(
      login('https://s:1', { email: 'a@x.com', password: 'password1' }),
    ).resolves.toEqual({
      status: 'server_error',
    });
  });
});

describe('register（feat09）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('register_ok：创建成功返回 token 与过期时间', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: 't1', expiresAt: '2026-10-10T00:00:00.000Z' }), {
          status: 201,
        }),
      ),
    );
    await expect(
      register('https://s:1', { email: 'a@x.com', password: 'abc123' }),
    ).resolves.toEqual({
      status: 'ok',
      token: 't1',
      expiresAt: '2026-10-10T00:00:00.000Z',
    });
  });

  it('register_taken：409 → email_taken', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: 'EMAIL_TAKEN' }), { status: 409 })),
    );
    await expect(
      register('https://s:1', { email: 'a@x.com', password: 'abc123' }),
    ).resolves.toEqual({ status: 'email_taken' });
  });

  it('register_unreachable：网络异常 → unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(
      register('https://s:1', { email: 'a@x.com', password: 'abc123' }),
    ).resolves.toEqual({ status: 'unreachable' });
  });

  it('register_protocol：响应协议不符 → server_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: 1 }), { status: 201 })),
    );
    await expect(
      register('https://s:1', { email: 'a@x.com', password: 'abc123' }),
    ).resolves.toEqual({ status: 'server_error' });
  });
});

describe('syncPull / syncPush（feat10 协议面）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const taxonomy = {
    topic: ['AI'],
    type: ['博客文章'],
    purpose: ['学习原理'],
    status: ['inbox'],
    updatedAt: '1970-01-01T00:00:00.000Z',
  };

  it('sync_pull_ok：解析增量拉取响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            serverTime: '2026-09-11T12:00:00.000Z',
            bookmarks: [],
            views: [],
            taxonomy,
            bookmarksTotal: 0, // sync-archive feat05：服务器概览总数随 pull 返回
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await syncPull('https://s:1', 'tok', '2026-09-11T08:00:00.000Z');
    expect(result).toMatchObject({ status: 'ok' });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'https://s:1/sync?since=2026-09-11T08%3A00%3A00.000Z',
    );
  });

  it('sync_push_ok：推送体经 schema 序列化，解析响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            serverTime: '2026-09-11T12:00:00.000Z',
            applied: { bookmarks: 1, views: 0 },
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await syncPush('https://s:1', 'tok', { bookmarks: [], views: [], taxonomy });
    expect(result).toMatchObject({ status: 'ok' });
  });

  it('sync_401：401 → unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 }),
        ),
    );
    await expect(syncPull('https://s:1', 'tok', null)).resolves.toEqual({
      status: 'unauthorized',
    });
    await expect(syncPush('https://s:1', 'tok', { bookmarks: [], views: [] })).resolves.toEqual({
      status: 'unauthorized',
    });
  });

  it('sync_unreachable：网络异常 → unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(syncPull('https://s:1', 'tok', null)).resolves.toEqual({
      status: 'unreachable',
    });
  });
});
