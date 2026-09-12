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
import {
  currentLibrary,
  openLibrary,
  readLastSyncAt,
  resetLibraryRuntime,
  writeLastSyncAt,
} from './library';
import { readServerBookmarksTotal } from './sync';
import { getActiveBookmarks } from './bookmarks';
import { getTaxonomy } from './taxonomy';
import { accountKey, loadSettings, recordServerLogin, setAutoSync, clearSession } from './settings';
import { syncNow, syncSession } from './sync';
import { handleAutoSyncTrigger, AUTO_SYNC_DEBOUNCE_MS } from './autosync';

const S1 = 'https://s1.example:8443';
const SERVER_TIME = '2026-09-11T12:00:00.000Z';
const T1 = '2026-09-11T08:00:00.000Z';
const T2 = '2026-09-11T10:00:00.000Z';

function makeSession(serverUrl = S1, email = 'a@x.com'): Session {
  return { email, serverUrl, token: 'tok-1', expiresAt: '2030-01-01T00:00:00.000Z' };
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
              // 与真实服务器同口径：当前账号未删除收藏总数（feat05 场景1）
              bookmarksTotal: [...store.values()].filter((b) => b.deletedAt === null).length,
            }),
          ),
          { status: 200 },
        ),
      );
    }),
  );
  return { store, pushBodies };
}

async function login(email = 'a@x.com'): Promise<Session> {
  const session = makeSession(S1, email);
  await recordServerLogin(S1, session);
  return session;
}

beforeEach(async () => {
  fakeBrowser.reset();
  await resetLibraryRuntime();
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
    expect(await (await currentLibrary()).bookmarks.get(remote.id)).toMatchObject({
      title: remote.title,
    });
  });

  it('sync_apply_update：远端 updatedAt 更新则覆盖本机，计为修改', async () => {
    const id = crypto.randomUUID();
    await login();
    await (await currentLibrary()).bookmarks.add(makeBookmark(id, T1));
    const server = installFakeServer();
    server.store.set(id, { ...makeBookmark(id, T2), title: '远端新标题' });
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok', changes: { added: 0, updated: 1, deleted: 0 } });
    expect(await (await currentLibrary()).bookmarks.get(id)).toMatchObject({ title: '远端新标题' });
  });

  it('sync_keep_local_newer：本机 updatedAt 更新则保留本机，不计数', async () => {
    const id = crypto.randomUUID();
    await login();
    await (await currentLibrary()).bookmarks.add({ ...makeBookmark(id, T2), title: '本机新标题' });
    const server = installFakeServer();
    server.store.set(id, { ...makeBookmark(id, T1), title: '远端旧标题' });
    await login();
    // 本机 T2 先推送覆盖远端 T1；拉回来的就是本机版本，不产生任何本地变更
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok', changes: { added: 0, updated: 0, deleted: 0 } });
    expect(await (await currentLibrary()).bookmarks.get(id)).toMatchObject({ title: '本机新标题' });
  });

  it('sync_apply_delete：远端墓碑比本机新 → 本机软删除，计为删除；活跃列表与条数不再含它（feat02 场景1）', async () => {
    const id = crypto.randomUUID();
    await login();
    await (await currentLibrary()).bookmarks.add(makeBookmark(id, T1));
    const server = installFakeServer();
    server.store.set(id, makeBookmark(id, T2, '2026-09-11T10:00:01.000Z'));
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok', changes: { added: 0, updated: 0, deleted: 1 } });
    const row = await (await currentLibrary()).bookmarks.get(id);
    expect(row?.deletedAt).toBe('2026-09-11T10:00:01.000Z');
    expect(await getActiveBookmarks()).toHaveLength(0); // 从收藏列表与统计中消失
  });

  it('sync_unknown_tombstone：本机没有的删除记录直接忽略，无变化不报错（feat02 场景3）', async () => {
    const ghost = makeBookmark(crypto.randomUUID(), T2, '2026-09-11T10:00:01.000Z');
    const server = installFakeServer();
    server.store.set(ghost.id, ghost);
    await login();
    const result = await syncNow();
    expect(result).toEqual({
      status: 'ok',
      changes: { added: 0, updated: 0, deleted: 0 },
      pushed: 0,
      syncedAt: SERVER_TIME,
    });
    expect(await (await currentLibrary()).bookmarks.get(ghost.id)).toBeUndefined(); // 不落墓碑
    expect(await getActiveBookmarks()).toHaveLength(0);
  });

  it('sync_push_local_changes：lastSyncAt 之后的本机变更进入推送体，lastSyncAt 刷新为 serverTime', async () => {
    const server = installFakeServer();
    await login();
    await writeLastSyncAt(await currentLibrary(), T1);
    const fresh = makeBookmark(crypto.randomUUID(), '2026-09-11T09:00:00.000Z');
    const stale = makeBookmark(crypto.randomUUID(), '2026-09-10T09:00:00.000Z');
    const db = await currentLibrary();
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
    expect(await readLastSyncAt(await currentLibrary())).toBe(SERVER_TIME);
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

  it('sync_unreachable：网络异常 → unreachable，库内数据与 lastSyncAt 不变', async () => {
    await login();
    await (await currentLibrary()).bookmarks.add(makeBookmark(crypto.randomUUID(), T1));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(syncNow()).resolves.toEqual({ status: 'unreachable' });
    expect(await readLastSyncAt(await currentLibrary())).toBeNull();
    expect(await (await currentLibrary()).bookmarks.count()).toBe(1);
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

describe('同步只作用于「当前库 + 当前登录账号」（task-account-libraries T4 / feat01 场景4/场景5）', () => {
  it('lastSyncAt 存各库内 meta：登录 A 同步后 A 库有、default 库无、settings 无该字段', async () => {
    installFakeServer();
    const session = await login('a@x.com');
    const result = await syncNow();
    expect(result.status).toBe('ok');
    const libA = await openLibrary(accountKey(session));
    expect(await readLastSyncAt(libA)).toBe(SERVER_TIME);

    await clearSession();
    expect(await readLastSyncAt(await currentLibrary())).toBeNull(); // default 库不受影响
    const settings = await loadSettings();
    expect('lastSyncAt' in settings).toBe(false); // 不再是全局设置
  });

  it('default 库的书签不进推送：未登录期间的收藏不随账号同步（feat01 场景9）', async () => {
    const server = installFakeServer();
    // 未登录时收藏进 default 库
    await (
      await currentLibrary()
    ).bookmarks.add(makeBookmark(crypto.randomUUID(), '2026-09-11T09:00:00.000Z'));
    await login('b@x.com');
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok', pushed: 0 }); // B 库为空，default 的不推
    const pushedIds = server.pushBodies.flatMap((b) =>
      SyncPushRequestSchema.parse(b).bookmarks.map((x) => x.id),
    );
    expect(pushedIds).toHaveLength(0);
  });

  it('切回原账号完整恢复：A→B→A 后 lastSyncAt 与未推改动都还在（feat01 场景5）', async () => {
    // A 登录使用并同步
    const sessionA = await login('a@x.com');
    const libA = await openLibrary(accountKey(sessionA));
    await libA.bookmarks.add(makeBookmark(crypto.randomUUID(), T1));
    installFakeServer();
    expect((await syncNow()).status).toBe('ok');
    expect(await readLastSyncAt(libA)).toBe(SERVER_TIME);

    // A 期间又有 2 条未推送的改动（feat01 场景4：切换不丢）
    await libA.bookmarks.bulkAdd([
      makeBookmark(crypto.randomUUID(), '2026-09-11T12:30:00.000Z'),
      makeBookmark(crypto.randomUUID(), '2026-09-11T12:31:00.000Z'),
    ]);

    // 切到 B（另一账号库），A 的库原样保留
    await recordServerLogin(S1, makeSession(S1, 'b@x.com'));
    expect(await (await currentLibrary()).bookmarks.count()).toBe(0); // B 库是空的

    // 切回 A 并同步：云端新增 + 本地未推的 2 条都齐
    await recordServerLogin(S1, sessionA);
    expect(await (await currentLibrary()).bookmarks.count()).toBe(3); // A 的库完整回来
    const result = await syncNow();
    expect(result).toMatchObject({ status: 'ok', pushed: 2 }); // 未推改动补推
    expect(await readLastSyncAt(await openLibrary(accountKey(sessionA)))).toBe(SERVER_TIME);
  });

  it('syncSession 直接作用于目标账号库：切换前的首拉不依赖当前登录态', async () => {
    const server = installFakeServer();
    const remote = makeBookmark(crypto.randomUUID(), T2);
    server.store.set(remote.id, remote);
    const sessionB = makeSession(S1, 'b@x.com');
    // 当前未登录，直接对 B 的会话同步 → 数据进 B 的库
    const result = await syncSession(sessionB);
    expect(result.status).toBe('ok');
    const libB = await openLibrary(accountKey(sessionB));
    expect(await libB.bookmarks.get(remote.id)).toMatchObject({ title: remote.title });
    expect(await readLastSyncAt(libB)).toBe(SERVER_TIME);
    expect(await (await currentLibrary()).bookmarks.count()).toBe(0); // default 不受影响
  });
});

describe('服务器概览总数落库（sync-archive feat05）', () => {
  it('feat05 场景1：pull 成功后服务器未删除收藏总数存入当前库 meta（墓碑不计）', async () => {
    const server = installFakeServer();
    const r1 = crypto.randomUUID();
    const r2 = crypto.randomUUID();
    const goneId = crypto.randomUUID();
    server.store.set(r1, makeBookmark(r1, T1));
    server.store.set(r2, makeBookmark(r2, T2));
    server.store.set(goneId, makeBookmark(goneId, T2, '2026-09-11T10:30:00.000Z'));
    await login();
    expect((await syncNow()).status).toBe('ok');
    expect(await readServerBookmarksTotal(await currentLibrary())).toBe(2);
  });

  it('feat05 场景3：同步失败（unreachable）保留最近一次成功值，不清空', async () => {
    const server = installFakeServer();
    const r1 = crypto.randomUUID();
    server.store.set(r1, makeBookmark(r1, T1));
    await login();
    expect((await syncNow()).status).toBe('ok');
    expect(await readServerBookmarksTotal(await currentLibrary())).toBe(1);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect((await syncNow()).status).toBe('unreachable');
    expect(await readServerBookmarksTotal(await currentLibrary())).toBe(1);
  });

  it('feat05 场景2：从未同步 → meta 无值', async () => {
    await login();
    expect(await readServerBookmarksTotal(await currentLibrary())).toBeNull();
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
