import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  TAXONOMY_EPOCH,
  TaxonomyGetResponseSchema,
  TaxonomyPutRequestSchema,
  TaxonomyPutResponseSchema,
  createDefaultTaxonomy,
  type Taxonomy,
} from '@x-threadpick/shared';
import { db } from '../db';
import { taxonomies } from '../db/schema';
import { rowToTaxonomy, taxonomyToRow } from '../db/mappers';
import { requireAuth, type AuthEnv } from '../middleware/auth';

/**
 * 分类取值集合：每用户一份，整体 last-write-wins。
 * GET 无记录返回 epoch seed（不落库）——未登录期间的本地修改必然胜过 seed。
 */

export const taxonomyRoutes = new Hono<AuthEnv>();

taxonomyRoutes.use('*', requireAuth);

function getStoredTaxonomy(userId: string): Taxonomy | null {
  const row = db.select().from(taxonomies).where(eq(taxonomies.userId, userId)).get();
  return row === undefined ? null : rowToTaxonomy(row);
}

function upsertTaxonomy(taxonomy: Taxonomy, userId: string): void {
  db.insert(taxonomies)
    .values(taxonomyToRow(taxonomy, userId))
    .onConflictDoUpdate({ target: taxonomies.userId, set: taxonomyToRow(taxonomy, userId) })
    .run();
}

taxonomyRoutes.get('/', (c) => {
  const userId = c.get('userId');
  const taxonomy = getStoredTaxonomy(userId) ?? createDefaultTaxonomy();
  return c.json(TaxonomyGetResponseSchema.parse({ taxonomy }));
});

taxonomyRoutes.put('/', async (c) => {
  const userId = c.get('userId');
  const raw: unknown = await c.req.json();
  const incoming = TaxonomyPutRequestSchema.parse(raw);

  const stored = getStoredTaxonomy(userId);
  const storedUpdatedAt = stored?.updatedAt ?? TAXONOMY_EPOCH;

  let winner: Taxonomy;
  if (incoming.updatedAt > storedUpdatedAt) {
    upsertTaxonomy(incoming, userId);
    winner = incoming;
  } else {
    winner = stored ?? createDefaultTaxonomy();
  }

  return c.json(
    TaxonomyPutResponseSchema.parse({
      taxonomy: winner,
      serverTime: new Date().toISOString(),
    }),
  );
});
