import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  createBookmark,
  createDefaultTaxonomy,
  LoginResponseSchema,
  SyncPullResponseSchema,
  type Bookmark,
  type Session,
  type SnapshotDetailResponse,
  type SnapshotMeta,
  type Taxonomy,
} from '@x-threadpick/shared';
import { recordServerLogin, saveSettings, loadSettings } from './settings';
import { currentLibrary, resetLibraryRuntime } from './library';
import { getTaxonomy, saveTaxonomy } from './taxonomy';
import {
  createSnapshot as createSnapshotApi,
  deleteSnapshot as deleteSnapshotApi,
  listSnapshots as listSnapshotsApi,
} from '../components/settings/api';
import { restoreFromSnapshot } from './restore';

/**
 * 恢复流程（sync-archive feat09；T5 高风险行）：
 * - unit 面：真 Dexie（fake-indexeddb）+ 真 api.ts，只在 fetch 传输层 stub——
 *   成功替换（覆盖/恢复/差集墓碑/时间戳前移）、断网失败停在原状态（fetch reject 即标准断网模拟）；
 * - live 面（真实链路）：拉起独立 server 实例（空闲端口 + apps/server/data 内独立 SQLite，结束清理），
 *   零 mock 走完 存档 → 本机继续改 → 恢复 → 同步传播到服务器 → 杀进程后真断网恢复失败且本机不动。
 */

const S1 = 'https://s1.example:8443';
const EMAIL = 'a@x.com';

const UUID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const UUID_B = '3f2504e0-4f89-11d3-9a0c-0305e82c3302';
const UUID_C = '3f2504e0-4f89-11d3-9a0c-0305e82c3303';
const UUID_D = '3f2504e0-4f89-11d3-9a0c-0305e82c3304';
const UUID_E = '3f2504e0-4f89-11d3-9a0c-0305e82c3305';

const T0 = '2026-09-01T00:00:00.000Z';
const T_SNAP = '2026-09-10T09:00:00.000Z';

const META: SnapshotMeta = { id: UUID_C, savedAt: T_SNAP, itemCount: 3 };

function sessionOf(serverUrl = S1, token = 't1'): Session {
  return { email: EMAIL, serverUrl, token, expiresAt: '2030-01-01T00:00:00.000Z' };
}

function bookmarkOf(id: string, url: string, title: string, updatedAt: string): Bookmark {
  return { ...createBookmark(id, { url, title }), updatedAt };
}

const SNAP_BOOKMARKS: Bookmark[] = [
  bookmarkOf(UUID_A, 'https://example.com/a', 'A（快照版）', T_SNAP),
  bookmarkOf(UUID_B, 'https://example.com/b', 'B（快照版）', T_SNAP),
  bookmarkOf(UUID_C, 'https://example.com/c', 'C（快照恢复）', T_SNAP),
];

const SNAP_TAXONOMY: Taxonomy = {
  ...createDefaultTaxonomy(),
  topic: ['快照主题'],
  updatedAt: T_SNAP,
};

const DETAIL: SnapshotDetailResponse = {
  id: META.id,
  itemCount: 3,
  savedAt: T_SNAP,
  bookmarks: SNAP_BOOKMARKS,
  taxonomy: SNAP_TAXONOMY,
};

type FetchHandler = (url: string, init: RequestInit) => Promise<Response>;

function stubFetch(handler: FetchHandler): void {
  vi.stubGlobal('fetch', vi.fn(handler));
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 恢复前本机状态：A/B 本机旧版 + D 快照后新增 + E 本机墓碑；A/B 不在快照版本上（title 不同）。 */
async function seedLocalLibrary(): Promise<void> {
  const lib = await currentLibrary();
  await lib.bookmarks.bulkPut([
    bookmarkOf(UUID_A, 'https://example.com/a', 'A（本地旧版）', T0),
    bookmarkOf(UUID_B, 'https://example.com/b', 'B（本地旧版）', T0),
    bookmarkOf(UUID_D, 'https://example.com/d', 'D（快照后新增）', T0),
    {
      ...bookmarkOf(UUID_E, 'https://example.com/e', 'E（本机墓碑）', T0),
      deletedAt: T0,
    },
  ]);
  await saveTaxonomy({ ...createDefaultTaxonomy(), topic: ['本地主题'], updatedAt: T0 });
}

async function rowsSorted(): Promise<Bookmark[]> {
  const lib = await currentLibrary();
  return (await lib.bookmarks.toArray()).sort((x, y) => (x.id < y.id ? -1 : 1));
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.unstubAllGlobals();
  await resetLibraryRuntime();
  await recordServerLogin(S1, sessionOf());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('恢复成功：整库替换为快照内容（feat09 场景1）', () => {
  it('覆盖同名项、恢复快照项、差集打墓碑、taxonomy 整体替换、updatedAt 前移保证 LWW 胜出', async () => {
    await seedLocalLibrary();
    stubFetch((url) => {
      if (url.includes(`/snapshots/${META.id}`)) return Promise.resolve(jsonResponse(DETAIL));
      return Promise.reject(new TypeError('fetch failed')); // 其余（恢复后的同步）在本用例中断网
    });

    const result = await restoreFromSnapshot(META);

    if (result.status !== 'ok') throw new Error(`恢复应成功，实际 ${result.status}`);
    const restoredAt = result.restoredAt;
    const rows = await rowsSorted();
    // 5 条记录：快照 3 条活跃 + 差集墓碑 2 条（D、E）
    expect(rows.map((r) => r.id).sort()).toEqual([UUID_A, UUID_B, UUID_C, UUID_D, UUID_E].sort());
    const byId = new Map(rows.map((r) => [r.id, r]));
    // 快照内容覆盖本机（A 变回快照版标题）
    expect(byId.get(UUID_A)?.title).toBe('A（快照版）');
    expect(byId.get(UUID_B)?.title).toBe('B（快照版）');
    // 快照项恢复，updatedAt 前移到恢复时刻
    expect(byId.get(UUID_C)?.deletedAt).toBeNull();
    // 差集（快照后新增/本机墓碑之外的多余项）打墓碑：活跃条数回到快照口径
    expect(rows.filter((r) => r.deletedAt === null).map((r) => r.id)).toEqual([
      UUID_A,
      UUID_B,
      UUID_C,
    ]);
    for (const id of [UUID_D, UUID_E]) {
      expect(byId.get(id)?.deletedAt).toBe(restoredAt);
      expect(byId.get(id)?.updatedAt).toBe(restoredAt);
    }
    // 全部恢复项 updatedAt 前移到恢复时刻（晚于本机旧版与服务器既有版本 → LWW 必胜）
    for (const id of [UUID_A, UUID_B, UUID_C]) {
      expect(byId.get(id)?.updatedAt).toBe(restoredAt);
    }
    // 取值清单整体替换为快照版，updatedAt 同步前移
    const taxonomy = await getTaxonomy(await currentLibrary());
    expect(taxonomy.topic).toEqual(['快照主题']);
    expect(taxonomy.updatedAt).toBe(restoredAt);
    // 恢复后触发同步（本用例同步阶段断网：synced=false 但恢复本身成功）
    expect(result).toMatchObject({ status: 'ok', synced: false });
  });
});

describe('恢复失败：本机保持恢复前状态（feat09 场景3）', () => {
  it('断网（读取快照失败）→ unreachable，本机书签与取值清单逐条不变', async () => {
    await seedLocalLibrary();
    const before = await rowsSorted();
    const taxonomyBefore = await getTaxonomy(await currentLibrary());
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    const result = await restoreFromSnapshot(META);

    expect(result.status).toBe('unreachable');
    expect(await rowsSorted()).toEqual(before);
    expect(await getTaxonomy(await currentLibrary())).toEqual(taxonomyBefore);
  });

  it('服务器错误（非 2xx）→ server_error，本机同样不动', async () => {
    await seedLocalLibrary();
    const before = await rowsSorted();
    stubFetch(() => Promise.resolve(new Response('boom', { status: 500 })));

    const result = await restoreFromSnapshot(META);

    expect(result.status).toBe('server_error');
    expect(await rowsSorted()).toEqual(before);
  });

  it('协议不符（响应不是合法快照详情）→ server_error，本机不动', async () => {
    await seedLocalLibrary();
    const before = await rowsSorted();
    stubFetch(() => Promise.resolve(jsonResponse({ hello: 'world' })));

    const result = await restoreFromSnapshot(META);

    expect(result.status).toBe('server_error');
    expect(await rowsSorted()).toEqual(before);
  });
});

describe('未登录与边界', () => {
  it('无会话 → not_logged_in，不发起请求', async () => {
    await saveSettings({ ...(await loadSettings()), session: null });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await restoreFromSnapshot(META);

    expect(result.status).toBe('not_logged_in');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---- 真实链路（T5 高风险：独立 server 实例 + 真 HTTP 零 mock，跑完清理） ----

const SERVER_DIR = join(process.cwd(), '../server');
const LIVE_DB = join(SERVER_DIR, `data/restore-live-${process.pid}-${Date.now()}.db`);
const LIVE_EMAIL = `restore-live-${Date.now()}@example.com`;
const LIVE_PASSWORD = 'restore-live-1';

let liveServer: ChildProcess | null = null;
let liveBaseUrl = '';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      const port = addr !== null && typeof addr === 'object' ? addr.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}

function stopLiveServer(): void {
  const proc = liveServer;
  liveServer = null;
  if (proc?.pid === undefined) return;
  try {
    process.kill(-proc.pid, 'SIGTERM'); // detached 组长：整组终止
  } catch {
    // 进程已退出
  }
}

async function startLiveServer(): Promise<string> {
  // 先按当前 schema 建表（含 snapshots），再起服务；与 `pnpm db:push` 同一入口
  const push = spawn('pnpm', ['db:push'], {
    cwd: SERVER_DIR,
    env: { ...process.env, DB_PATH: LIVE_DB },
    stdio: 'ignore',
  });
  const pushCode = await new Promise<number | null>((resolve) => push.on('close', resolve));
  if (pushCode !== 0) throw new Error(`db:push 失败（exit ${pushCode ?? 'null'}）`);

  const port = await freePort();
  const proc = spawn('pnpm', ['exec', 'tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: LIVE_DB,
      JWT_SECRET: 'restore-live-secret',
    },
    stdio: 'ignore',
    detached: true,
  });
  liveServer = proc;
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return url;
    } catch {
      // 尚未就绪
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  stopLiveServer();
  throw new Error('live server 启动超时');
}

async function registerLive(): Promise<string> {
  const res = await fetch(`${liveBaseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LIVE_EMAIL, password: LIVE_PASSWORD }),
  });
  if (!res.ok) throw new Error(`注册失败: ${res.status}`);
  const { token } = LoginResponseSchema.parse(await res.json());
  return token;
}

describe('恢复真实链路（独立 server 实例，feat09 场景1/场景2/场景3）', () => {
  it(
    '存档→本机继续改→恢复（本地替换+同步传播）→服务器断连后恢复失败且本机不动',
    { timeout: 90_000 },
    async () => {
      liveBaseUrl = await startLiveServer();
      const token = await registerLive();
      const liveSession = sessionOf(liveBaseUrl, token);
      await recordServerLogin(liveBaseUrl, liveSession);

      // 1) 构造「此前存过的快照」：走真 createSnapshot 上传 3 条 + taxonomy（T3 客户端真链路）
      const snapBookmarks = [
        bookmarkOf(UUID_A, `${liveBaseUrl}/a`, 'A（快照版）', T_SNAP),
        bookmarkOf(UUID_B, `${liveBaseUrl}/b`, 'B（快照版）', T_SNAP),
        bookmarkOf(UUID_C, `${liveBaseUrl}/c`, 'C（快照恢复）', T_SNAP),
      ];
      const created = await createSnapshotApi(liveBaseUrl, token, {
        savedAt: T_SNAP,
        bookmarks: snapBookmarks,
        taxonomy: SNAP_TAXONOMY,
      });
      expect(created.status).toBe('ok');
      if (created.status !== 'ok') throw new Error('存档应成功');
      const liveMeta: SnapshotMeta = {
        id: created.data.snapshot.id,
        savedAt: T_SNAP,
        itemCount: 3,
      };
      expect(created.data.snapshot.itemCount).toBe(3);

      // 2) 本机继续改：A 改标题、D/E 快照后新增（快照里没有）
      const lib = await currentLibrary();
      await lib.bookmarks.bulkPut([
        bookmarkOf(UUID_A, `${liveBaseUrl}/a`, 'A（本机后来改过）', '2026-09-11T00:00:00.000Z'),
        bookmarkOf(UUID_D, `${liveBaseUrl}/d`, 'D（快照后新增）', '2026-09-11T00:00:00.000Z'),
        bookmarkOf(UUID_E, `${liveBaseUrl}/e`, 'E（快照后新增）', '2026-09-11T00:00:00.000Z'),
      ]);
      await saveTaxonomy({
        ...createDefaultTaxonomy(),
        topic: ['本地后来加的'],
        updatedAt: '2026-09-11T00:00:00.000Z',
      });

      // 3) 恢复（零 mock：真 getSnapshot + 真事务替换 + 真 syncNow）
      const result = await restoreFromSnapshot(liveMeta);
      expect(result.status).toBe('ok');
      expect(result).toMatchObject({ status: 'ok', synced: true });

      // 4) 本机 = 快照内容：A 回快照版，D/E 墓碑，活跃 3 条，taxonomy 快照版
      const rows = await rowsSorted();
      const byId = new Map(rows.map((r) => [r.id, r]));
      expect(byId.get(UUID_A)?.title).toBe('A（快照版）');
      expect(rows.filter((r) => r.deletedAt === null).map((r) => r.id)).toEqual([
        UUID_A,
        UUID_B,
        UUID_C,
      ]);
      expect(byId.get(UUID_D)?.deletedAt).not.toBeNull();
      expect(byId.get(UUID_E)?.deletedAt).not.toBeNull();
      expect((await getTaxonomy(lib)).topic).toEqual(['快照主题']);

      // 5) 变化照常同步到服务器：拉取侧可见恢复项与墓碑（feat09 场景1 承诺）
      const pullRes = await fetch(
        `${liveBaseUrl}/sync?since=${encodeURIComponent('1970-01-01T00:00:00.000Z')}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(pullRes.ok).toBe(true);
      const pulled = SyncPullResponseSchema.parse(await pullRes.json());
      const serverById = new Map(pulled.bookmarks.map((b) => [b.id, b]));
      expect(serverById.get(UUID_A)?.title).toBe('A（快照版）'); // 快照内容覆盖服务器较新版本
      expect(serverById.get(UUID_D)?.deletedAt).not.toBeNull(); // 墓碑传播
      expect(serverById.get(UUID_E)?.deletedAt).not.toBeNull();

      // 6) 快照列表与删除客户端（T3）真链路：列表含该份 → 删除 → 列表不再含
      const listed = await listSnapshotsApi(liveBaseUrl, token);
      expect(listed.status).toBe('ok');
      if (listed.status !== 'ok') throw new Error('列表应成功');
      expect(listed.data.snapshots.some((s) => s.id === liveMeta.id)).toBe(true);
      const removed = await deleteSnapshotApi(liveBaseUrl, token, liveMeta.id);
      expect(removed.status).toBe('ok');
      const listedAgain = await listSnapshotsApi(liveBaseUrl, token);
      if (listedAgain.status !== 'ok') throw new Error('列表应成功');
      expect(listedAgain.data.snapshots.some((s) => s.id === liveMeta.id)).toBe(false);

      // 7) 真断网：杀掉 server 后恢复 → 失败且本机保持恢复后状态（feat09 场景3）
      stopLiveServer();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const beforeOffline = await rowsSorted();
      const offline = await restoreFromSnapshot(liveMeta);
      expect(offline.status).toBe('unreachable');
      expect(await rowsSorted()).toEqual(beforeOffline);
    },
  );

  afterAll(async () => {
    stopLiveServer();
    await resetLibraryRuntime();
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${LIVE_DB}${suffix}`, { force: true });
    }
  });
});
