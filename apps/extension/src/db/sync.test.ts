import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  TaxonomySchema,
  createBookmark,
  createDefaultTaxonomy,
  type Bookmark,
  type Session,
  type Taxonomy,
} from '@x-threadpick/shared';
import { db } from './bookmarks';
import { getTaxonomy } from './taxonomy';
import { loadSettings, recordServerLogin, saveSettings, setAutoSync, accountKey } from './settings';
import { syncNow } from './sync';
import { handleAutoSyncTrigger, AUTO_SYNC_DEBOUNCE_MS } from './autosync';

const S1 = 'https://s1.example:8443';
const SERVER_TIME = '2026-09-11T12:00:00.000Z';
const T1 = '2026-09-11T08:00:00.000Z';
const T2 = '2026-09-11T10:00:00.000Z';

function makeSession(serverUrl = S1): Session {
  return { email: 'a@x.com', serverUrl, token: 'tok-1', expiresAt: '2030-01-01T00:00:00.000Z' };
}

function makeBookmark(id: string, updatedAt: string, deletedAt: string | null = null): Bookmark {
  return {
    ...createBookmark(id, { url: `https://example.com/${id}`, title: `标题 ${id}` }),
    updatedAt,
    deletedAt,
  };
}

/** 内存假服务器：照搬 /sync 的 LWW 语义，返回真实协议响应。 */
function installFakeServer(initial?: { taxonomy: Taxonomy }) {
  const store = new Map<string, Bookmark>();
  let taxonomy: Taxonomy | null = initial?.taxonomy ?? null;
  const pushBodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(`${S1}/sync`)) return Promise.reject(new Error(`unexpected ${url}`));
      if (init?.method === 'POST') {
        const bodyText = typeof init.body === 'string' ? init.body : '';
        const body = SyncPushRequestSchema.parse(JSON.parse(bodyText));
        pushBodies.push(body);
        for (const b of body.bookmarks) {
          const existing = store.get(b.id);
          if (existing !== undefined && existing.updatedAt >= b.updatedAt) continue;
          store.set(b.id, b);
        }
        if (
          body.taxonomy !== undefined &&
          (taxonomy === null || body.taxonomy.updatedAt > taxonomy.updatedAt)
        ) {
          taxonomy = body.taxonomy;
        }
        return Promise.resolve(
          new Response(
            JSON.stringify(
              SyncPushResponseSchema.parse({
                serverTime: SERVER_TIME,
                applied: { bookmarks: body.bookmarks.length, views: 0 },
              }),
            ),
            { status: 200 },
          ),
        );
      }
      const since = new URL(url).searchParams.get('since');
      const list = [...store.values()].filter((b) => since === null || b.updatedAt > since);
      return Promise.resolve(
        new Response(
          JSON.stringify(
            SyncPullResponseSchema.parse({
              serverTime: SERVER_TIME,
              bookmarks: list,
              views: [],
              taxonomy: taxonomy ?? createDefaultTaxonomy(),
            }),
          ),
          { status: 200 },
        ),
      );
    }),
  );
  return { store, pushBodies };
}

async function login(): Promise<Session> {
  const session = makeSession();
  await recordServerLogin(S1, session);
  return session;
}

beforeEach(async () => {
  fakeBrowser.reset();
  await db.bookmarks.clear();
  await db.taxonomies.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('syncNow（feat10）', () => {
  it('sync_not_logged_in：无会话直接返回，不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncNow()).resolves.toEqual({ status: 'not_logged_in' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sync_apply_add：远端有而本机没有的书签拉入本机，计为新增', async () => {
    const server = installFakeServer();
    const remote = makeBookmark(crypto.randomUUID(), T2);
    server.store.set(remote.id, remote);
    await login();
    const result = await syncNow();
    expect(result).toEqual({
      status: 'ok',
      changes: { added: 1, updated: 0, deleted: 0 },
      pushed: 0,
      syncedAt: SERVER_TIME,
    });
    expect(await db.bookmarks.get(remote.id)).toMatchObject({ title: remote.title });
  });

  it('sync_apply_update：远端 updatedAt 更新则覆盖本机，计为修改', async () => {
    const id = crypto.randomUUID();
    await db.bookmarks.add(makeBookmark(id, T1));
    const server = installFakeServer();
    server.store.set(id, { ...makeBookmark(id, T2), title: '远端新标题' });
    await login();
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok', changes: { added: 0, updated: 1, deleted: 0 } });
    expect(await db.bookmarks.get(id)).toMatchObject({ title: '远端新标题' });
  });

  it('sync_keep_local_newer：本机 updatedAt 更新则保留本机，不计数', async () => {
    const id = crypto.randomUUID();
    await db.bookmarks.add({ ...makeBookmark(id, T2), title: '本机新标题' });
    const server = installFakeServer();
    server.store.set(id, { ...makeBookmark(id, T1), title: '远端旧标题' });
    await login();
    // 本机 T2 先推送覆盖远端 T1；拉回来的就是本机版本，不产生任何本地变更
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok', changes: { added: 0, updated: 0, deleted: 0 } });
    expect(await db.bookmarks.get(id)).toMatchObject({ title: '本机新标题' });
  });

  it('sync_apply_delete：远端墓碑比本机新 → 本机软删除，计为删除', async () => {
    const id = crypto.randomUUID();
    await db.bookmarks.add(makeBookmark(id, T1));
    const server = installFakeServer();
    server.store.set(id, makeBookmark(id, T2, '2026-09-11T10:00:01.000Z'));
    await login();
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok', changes: { added: 0, updated: 0, deleted: 1 } });
    const row = await db.bookmarks.get(id);
    expect(row?.deletedAt).toBe('2026-09-11T10:00:01.000Z');
  });

  it('sync_push_local_changes：lastSyncAt 之后的本机变更进入推送体，lastSyncAt 刷新为 serverTime', async () => {
    const server = installFakeServer();
    await login();
    await saveSettings({ ...(await loadSettings()), lastSyncAt: T1 });
    const fresh = makeBookmark(crypto.randomUUID(), '2026-09-11T09:00:00.000Z');
    const stale = makeBookmark(crypto.randomUUID(), '2026-09-10T09:00:00.000Z');
    await db.bookmarks.add(fresh);
    await db.bookmarks.add(stale);
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok', pushed: 1 });
    const pushed = server.pushBodies.flatMap((b) =>
      SyncPushRequestSchema.parse(b).bookmarks.map((x) => x.id),
    );
    expect(pushed).toContain(fresh.id);
    expect(pushed).not.toContain(stale.id);
    // taxonomy 随推送一起上传
    expect(SyncPushRequestSchema.parse(server.pushBodies[0]).taxonomy).toBeDefined();
    expect((await loadSettings()).lastSyncAt).toBe(SERVER_TIME);
  });

  it('sync_taxonomy_lww：远端 taxonomy 更新则覆盖本机', async () => {
    const remote = TaxonomySchema.parse({
      ...createDefaultTaxonomy(),
      topic: [...createDefaultTaxonomy().topic, '远端新主题'],
      updatedAt: T2,
    });
    installFakeServer({ taxonomy: remote });
    await login();
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok' });
    expect((await getTaxonomy()).topic).toContain('远端新主题');
  });

  it('sync_unreachable：网络异常 → unreachable，lastSyncAt 与本机数据不变', async () => {
    await db.bookmarks.add(makeBookmark(crypto.randomUUID(), T1));
    await login();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(syncNow()).resolves.toEqual({ status: 'unreachable' });
    expect((await loadSettings()).lastSyncAt).toBeNull();
    expect(await db.bookmarks.count()).toBe(1);
  });

  it('sync_unauthorized：服务器 401 → unauthorized', async () => {
    await login();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 }),
        ),
    );
    await expect(syncNow()).resolves.toEqual({ status: 'unauthorized' });
  });
});

describe('自动同步触发（feat11，后台进程执行）', () => {
  it('autosync_bg_debounce：开启的账号收到两次变更通知，防抖后只同步一次', async () => {
    installFakeServer();
    const session = await login();
    await setAutoSync(accountKey(session), true);
    vi.useFakeTimers();
    handleAutoSyncTrigger({ type: 'local-change' });
    handleAutoSyncTrigger({ type: 'local-change' }); // 连续变更合并为一次
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DEBOUNCE_MS + 100);
    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = fetchMock.mock.calls[0]?.[0];
    expect(typeof calledUrl === 'string' ? calledUrl : '').toContain('/sync');
    const syncCalls = fetchMock.mock.calls.filter((c) =>
      String(typeof c[0] === 'string' ? c[0] : '').includes('/sync'),
    );
    const pushCalls = syncCalls.filter((c) => (c[1]?.method ?? 'GET') === 'POST');
    expect(pushCalls).toHaveLength(1); // 防抖合并：只同步一次
  });

  it('autosync_bg_off：未开启的账号收到通知后不发起同步', async () => {
    installFakeServer();
    await login();
    vi.useFakeTimers();
    handleAutoSyncTrigger({ type: 'local-change' });
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DEBOUNCE_MS + 100);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('autosync_bg_bad_message：非协议消息被忽略，不抛错不计时', async () => {
    installFakeServer();
    const session = await login();
    await setAutoSync(accountKey(session), true);
    vi.useFakeTimers();
    expect(() => handleAutoSyncTrigger({ type: 'something-else' })).not.toThrow();
    expect(() => handleAutoSyncTrigger('garbage')).not.toThrow();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DEBOUNCE_MS + 100);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
