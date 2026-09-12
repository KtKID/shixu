import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import {
  SnapshotCreateRequestSchema,
  SnapshotCreateResponseSchema,
  SnapshotDeleteResponseSchema,
  SnapshotDetailResponseSchema,
  SnapshotListResponseSchema,
} from '@x-threadpick/shared';
import { db } from '../db';
import { snapshots } from '../db/schema';
import { rowToSnapshotArchive, rowToSnapshotMeta, snapshotArchiveToRow } from '../db/mappers';
import { requireAuth, type AuthEnv } from '../middleware/auth';

/**
 * 快照存档路由（sync-archive feat07/feat08）：严格按账号隔离（userId 过滤一切查询）。
 * better-sqlite3 驱动是同步 API，查询不加 await。
 */

/** 每账号快照上限（feat08 场景4）：创建超出上限时最旧的自动淘汰。 */
export const SNAPSHOT_LIMIT = 10;

/** 展示口径：活跃收藏数（墓碑不计），feat07 场景4「空库也允许存档，记录显示 0 条」。 */
function countActive(archive: { bookmarks: { deletedAt: string | null }[] }): number {
  return archive.bookmarks.filter((b) => b.deletedAt === null).length;
}

export const snapshotRoutes = new Hono<AuthEnv>();

snapshotRoutes.use('*', requireAuth);

snapshotRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const raw: unknown = await c.req.json();
  const archive = SnapshotCreateRequestSchema.parse(raw);
  const id = randomUUID();
  const itemCount = countActive(archive);

  db.transaction((tx) => {
    tx.insert(snapshots)
      .values(snapshotArchiveToRow(archive, userId, id, itemCount))
      .run();
    // feat08 场景4：保持每账号 ≤ 上限，新到旧保留，最旧的淘汰
    const rows = tx
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(eq(snapshots.userId, userId))
      .orderBy(desc(snapshots.savedAt))
      .all();
    for (const stale of rows.slice(SNAPSHOT_LIMIT)) {
      tx.delete(snapshots).where(eq(snapshots.id, stale.id)).run();
    }
  });

  return c.json(
    SnapshotCreateResponseSchema.parse({ snapshot: { id, savedAt: archive.savedAt, itemCount } }),
    201,
  );
});

snapshotRoutes.get('/', (c) => {
  const userId = c.get('userId');
  const rows = db
    .select()
    .from(snapshots)
    .where(eq(snapshots.userId, userId))
    .orderBy(desc(snapshots.savedAt))
    .all();
  return c.json(SnapshotListResponseSchema.parse({ snapshots: rows.map(rowToSnapshotMeta) }));
});

snapshotRoutes.get('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const row = db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.userId, userId), eq(snapshots.id, id)))
    .get();
  if (row === undefined) return c.json({ error: 'NOT_FOUND' }, 404);
  return c.json(
    SnapshotDetailResponseSchema.parse({
      id: row.id,
      itemCount: row.itemCount,
      ...rowToSnapshotArchive(row.payload),
    }),
  );
});

snapshotRoutes.delete('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  db.delete(snapshots)
    .where(and(eq(snapshots.userId, userId), eq(snapshots.id, id)))
    .run();
  return c.json(SnapshotDeleteResponseSchema.parse({ ok: true }));
});
