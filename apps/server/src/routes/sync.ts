import { Hono } from 'hono';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import {
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  TAXONOMY_EPOCH,
  createDefaultTaxonomy,
} from '@x-threadpick/shared';
import { db } from '../db';
import { bookmarks, taxonomies, views } from '../db/schema';
import {
  bookmarkToRow,
  rowToBookmark,
  rowToTaxonomy,
  rowToView,
  taxonomyToRow,
  viewToRow,
} from '../db/mappers';
import { requireAuth, type AuthEnv } from '../middleware/auth';

/** better-sqlite3 驱动是同步 API，查询不加 await。 */

const SinceParamSchema = z.iso.datetime();

export const syncRoutes = new Hono<AuthEnv>();

syncRoutes.use('*', requireAuth);

syncRoutes.get('/', (c) => {
  const userId = c.get('userId');
  const since = c.req.query('since');
  if (since !== undefined && !SinceParamSchema.safeParse(since).success) {
    return c.json({ error: 'BAD_SINCE' }, 400);
  }

  const bookmarkRows =
    since === undefined
      ? db.select().from(bookmarks).where(eq(bookmarks.userId, userId)).all()
      : db
          .select()
          .from(bookmarks)
          .where(and(eq(bookmarks.userId, userId), gt(bookmarks.updatedAt, since)))
          .all();
  const viewRows =
    since === undefined
      ? db.select().from(views).where(eq(views.userId, userId)).all()
      : db
          .select()
          .from(views)
          .where(and(eq(views.userId, userId), gt(views.updatedAt, since)))
          .all();
  const taxonomyRow = db.select().from(taxonomies).where(eq(taxonomies.userId, userId)).get();

  return c.json(
    SyncPullResponseSchema.parse({
      serverTime: new Date().toISOString(),
      bookmarks: bookmarkRows.map(rowToBookmark),
      views: viewRows.map(rowToView),
      taxonomy: taxonomyRow === undefined ? createDefaultTaxonomy() : rowToTaxonomy(taxonomyRow),
    }),
  );
});

syncRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const raw: unknown = await c.req.json();
  const body = SyncPushRequestSchema.parse(raw);

  let appliedBookmarks = 0;
  let appliedViews = 0;

  db.transaction((tx) => {
    for (const bookmark of body.bookmarks) {
      const existing = tx
        .select({ updatedAt: bookmarks.updatedAt })
        .from(bookmarks)
        .where(and(eq(bookmarks.id, bookmark.id), eq(bookmarks.userId, userId)))
        .get();
      // last-write-wins：仅当推送方更新时间更新时落库
      if (existing !== undefined && existing.updatedAt >= bookmark.updatedAt) continue;
      tx.insert(bookmarks)
        .values(bookmarkToRow(bookmark, userId))
        .onConflictDoUpdate({ target: bookmarks.id, set: bookmarkToRow(bookmark, userId) })
        .run();
      appliedBookmarks++;
    }

    for (const view of body.views) {
      const existing = tx
        .select({ updatedAt: views.updatedAt })
        .from(views)
        .where(and(eq(views.id, view.id), eq(views.userId, userId)))
        .get();
      if (existing !== undefined && existing.updatedAt >= view.updatedAt) continue;
      tx.insert(views)
        .values(viewToRow(view, userId))
        .onConflictDoUpdate({ target: views.id, set: viewToRow(view, userId) })
        .run();
      appliedViews++;
    }

    // taxonomy 整体 LWW：仅当提交方 updatedAt 更新才落库（同 PUT /taxonomy）
    if (body.taxonomy !== undefined) {
      const existing = tx
        .select({ updatedAt: taxonomies.updatedAt })
        .from(taxonomies)
        .where(eq(taxonomies.userId, userId))
        .get();
      const storedUpdatedAt = existing?.updatedAt ?? TAXONOMY_EPOCH;
      if (body.taxonomy.updatedAt > storedUpdatedAt) {
        tx.insert(taxonomies)
          .values(taxonomyToRow(body.taxonomy, userId))
          .onConflictDoUpdate({
            target: taxonomies.userId,
            set: taxonomyToRow(body.taxonomy, userId),
          })
          .run();
      }
    }
  });

  return c.json(
    SyncPushResponseSchema.parse({
      serverTime: new Date().toISOString(),
      applied: { bookmarks: appliedBookmarks, views: appliedViews },
    }),
  );
});
