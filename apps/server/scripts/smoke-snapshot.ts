import { randomUUID } from 'node:crypto';
import {
  createBookmark,
  createDefaultTaxonomy,
  LoginResponseSchema,
  SnapshotCreateResponseSchema,
  SnapshotDeleteResponseSchema,
  SnapshotDetailResponseSchema,
  SnapshotListResponseSchema,
} from '@x-threadpick/shared';

/**
 * 快照链路冒烟（sync-archive feat07/feat08，task-snapshot-archive T6）：
 * 创建（含 0 条空档）→ 列表（新到旧、仅 meta）→ 详情（全量载荷）→ 删除 → 上限淘汰 → 账号隔离。
 * 全程真实 HTTP + shared schema 校验，零 mock。
 * 前置：server 已启动（SMOKE_BASE_URL，默认 127.0.0.1:60024）；账号用 /auth/register 现场创建，无需 CLI。
 */

const baseUrl = process.env['SMOKE_BASE_URL'] ?? 'http://127.0.0.1:60024';

const LIMIT = 10; // 与服务端 SNAPSHOT_LIMIT 一致（feat08 场景4）

async function register(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'smoke-password-1' }),
  });
  if (!res.ok) throw new Error(`注册失败: ${res.status}`);
  const { token } = LoginResponseSchema.parse(await res.json());
  return token;
}

interface CreateArgs {
  token: string;
  savedAt: string;
  bookmarks?: ReturnType<typeof createBookmark>[];
  taxonomyUpdatedAt?: string;
}

async function createSnapshot(args: CreateArgs): Promise<{ id: string; itemCount: number }> {
  const res = await fetch(`${baseUrl}/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${args.token}` },
    body: JSON.stringify({
      savedAt: args.savedAt,
      bookmarks: args.bookmarks ?? [],
      taxonomy: {
        ...createDefaultTaxonomy(),
        updatedAt: args.taxonomyUpdatedAt ?? args.savedAt,
      },
    }),
  });
  if (!res.ok) throw new Error(`创建快照失败: ${res.status}`);
  const parsed = SnapshotCreateResponseSchema.parse(await res.json());
  return parsed.snapshot;
}

async function listSnapshots(token: string): Promise<{ raw: unknown; ids: string[] }> {
  const res = await fetch(`${baseUrl}/snapshots`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`列表失败: ${res.status}`);
  const raw: unknown = await res.json();
  const parsed = SnapshotListResponseSchema.parse(raw);
  // 新到旧 + 仅 meta（响应原文不得含载荷字段）
  const ids = parsed.snapshots.map((s) => s.id);
  return { raw, ids };
}

async function main(): Promise<void> {
  // healthz
  const healthRes = await fetch(`${baseUrl}/healthz`);
  if (!healthRes.ok) throw new Error(`healthz 失败: ${healthRes.status}`);

  const runId = Date.now();
  const tokenA = await register(`smoke-snap-a-${runId}@example.com`);
  const tokenB = await register(`smoke-snap-b-${runId}@example.com`);

  // feat07 场景4：空库（0 条）也允许存档
  const empty = await createSnapshot({ token: tokenA, savedAt: '2026-09-01T00:00:00.000Z' });
  if (empty.itemCount !== 0) throw new Error('空档 itemCount 应为 0');

  // feat07 场景1：正常存档（2 条记录，1 活跃 1 墓碑 → 展示口径 1 条）
  const bmA = createBookmark(randomUUID(), { url: `${baseUrl}/snap-a`, title: '快照书签 A' });
  const bmGone = {
    ...createBookmark(randomUUID(), { url: `${baseUrl}/snap-gone`, title: '已删书签' }),
    deletedAt: '2026-09-02T00:00:00.000Z',
  };
  const second = await createSnapshot({
    token: tokenA,
    savedAt: '2026-09-03T00:00:00.000Z',
    bookmarks: [bmA, bmGone],
  });
  if (second.itemCount !== 1)
    throw new Error(`itemCount 应为 1（墓碑不计），实际 ${second.itemCount}`);

  // feat08 场景1：列表新到旧 + 仅 meta
  const list1 = await listSnapshots(tokenA);
  if (JSON.stringify(list1.raw).includes('bookmarks')) {
    throw new Error('列表响应不应包含载荷字段（仅 meta）');
  }
  if (list1.ids[0] !== second.id || list1.ids[1] !== empty.id) {
    throw new Error('列表应按存档时间从新到旧');
  }

  // 详情：全量载荷与上传一致
  const detailRes = await fetch(`${baseUrl}/snapshots/${second.id}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  if (!detailRes.ok) throw new Error(`详情失败: ${detailRes.status}`);
  const detail = SnapshotDetailResponseSchema.parse(await detailRes.json());
  if (detail.itemCount !== 1 || detail.bookmarks.length !== 2) {
    throw new Error('详情载荷与条数不符');
  }
  if (!detail.bookmarks.some((b) => b.id === bmA.id && b.deletedAt === null)) {
    throw new Error('详情缺活跃书签');
  }

  // feat08 场景3：删除一份 → 列表消失、详情 404
  const delRes = await fetch(`${baseUrl}/snapshots/${empty.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  if (!delRes.ok || !SnapshotDeleteResponseSchema.parse(await delRes.json()).ok) {
    throw new Error('删除失败');
  }
  const goneRes = await fetch(`${baseUrl}/snapshots/${empty.id}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  if (goneRes.status !== 404) throw new Error(`删除后详情应 404，实际 ${goneRes.status}`);
  const list2 = await listSnapshots(tokenA);
  if (list2.ids.includes(empty.id)) throw new Error('删除后仍在列表');

  // feat08 场景4：上限淘汰——共 11 份时最旧被淘汰，保持 10 份
  for (let i = 0; i < LIMIT; i++) {
    await createSnapshot({
      token: tokenA,
      savedAt: new Date(Date.parse('2026-09-04T00:00:00.000Z') + i * 1000).toISOString(),
    });
  }
  const list3 = SnapshotListResponseSchema.parse(
    await (
      await fetch(`${baseUrl}/snapshots`, { headers: { authorization: `Bearer ${tokenA}` } })
    ).json(),
  );
  if (list3.snapshots.length !== LIMIT) {
    throw new Error(`应保持 ${LIMIT} 份，实际 ${list3.snapshots.length}`);
  }
  if (list3.snapshots.some((s) => s.id === second.id)) {
    throw new Error('最旧的一份未被淘汰');
  }

  // feat08 场景2：快照严格按账号隔离
  const onlyB = await createSnapshot({ token: tokenB, savedAt: '2026-09-20T00:00:00.000Z' });
  const listB = await listSnapshots(tokenB);
  if (listB.ids.length !== 1 || listB.ids[0] !== onlyB.id) {
    throw new Error('B 应只看到自己的快照');
  }
  const listA = await listSnapshots(tokenA);
  if (listA.ids.includes(onlyB.id)) throw new Error('A 的列表混入了 B 的快照');

  console.log(
    'SNAPSHOT SMOKE OK: 空档 → 存档/条数 → 列表(新到旧仅meta) → 详情 → 删除/404 → 上限淘汰 → 账号隔离',
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
