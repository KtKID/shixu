import { randomUUID } from 'node:crypto';
import {
  HealthResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  TAXONOMY_EPOCH,
  TaxonomyGetResponseSchema,
  TaxonomyPutResponseSchema,
  createBookmark,
  createDefaultTaxonomy,
} from '@x-threadpick/shared';

/**
 * 设置链路冒烟：healthz 版本 → taxonomy seed → PUT 新版 → 旧版被拒（LWW）
 * → sync pull/push 含 taxonomy → 不带 taxonomy 的旧式 push 兼容 + 书签回归。
 * 前置：已用 CLI 建号并启动 server。
 */

const baseUrl = process.env['SMOKE_BASE_URL'] ?? 'http://127.0.0.1:60024';
const email = process.env['SMOKE_EMAIL'] ?? 'smoke@example.com';
const password = process.env['SMOKE_PASSWORD'] ?? 'smoke-password-1';

async function getJson(res: Response): Promise<unknown> {
  const raw: unknown = await res.json();
  return raw;
}

async function main(): Promise<void> {
  // feat01 场景1：healthz 返回版本
  const healthRes = await fetch(`${baseUrl}/healthz`);
  if (!healthRes.ok) throw new Error(`healthz 失败: ${healthRes.status}`);
  const health = HealthResponseSchema.parse(await getJson(healthRes));
  if (health.version === '') throw new Error('version 为空');

  const creds = LoginRequestSchema.parse({ email, password });
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  });
  if (!loginRes.ok) throw new Error(`登录失败: ${loginRes.status}`);
  const { token } = LoginResponseSchema.parse(await getJson(loginRes));
  const auth = { authorization: `Bearer ${token}` };

  // feat08 场景2：GET 无记录返回 epoch seed，status 含 inbox
  const getRes = await fetch(`${baseUrl}/taxonomy`, { headers: auth });
  if (!getRes.ok) throw new Error(`GET /taxonomy 失败: ${getRes.status}`);
  const got = TaxonomyGetResponseSchema.parse(await getJson(getRes));
  if (got.taxonomy.updatedAt !== TAXONOMY_EPOCH) {
    throw new Error(`初始应为 epoch seed，实际 ${got.taxonomy.updatedAt}`);
  }
  if (!got.taxonomy.status.includes('inbox')) throw new Error('seed status 缺少 inbox');

  // feat08 场景1：PUT 新版生效
  const updated = {
    ...got.taxonomy,
    topic: [...got.taxonomy.topic, '冒烟主题'],
    updatedAt: new Date().toISOString(),
  };
  const putRes = await fetch(`${baseUrl}/taxonomy`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify(updated),
  });
  if (!putRes.ok) throw new Error(`PUT /taxonomy 失败: ${putRes.status}`);
  const put = TaxonomyPutResponseSchema.parse(await getJson(putRes));
  if (!put.taxonomy.topic.includes('冒烟主题')) throw new Error('新版未生效');

  // feat08 场景3：PUT 旧版本（epoch）被拒，胜出者仍是新版
  const stalePutRes = await fetch(`${baseUrl}/taxonomy`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify(got.taxonomy),
  });
  const stalePut = TaxonomyPutResponseSchema.parse(await getJson(stalePutRes));
  if (!stalePut.taxonomy.topic.includes('冒烟主题')) {
    throw new Error('旧版本不应覆盖新版本（LWW 失效）');
  }

  // feat08 场景1：sync pull 含 taxonomy
  const pullRes = await fetch(`${baseUrl}/sync?since=1970-01-01T00:00:00.000Z`, { headers: auth });
  if (!pullRes.ok) throw new Error(`sync pull 失败: ${pullRes.status}`);
  const pulled = SyncPullResponseSchema.parse(await getJson(pullRes));
  if (!pulled.taxonomy.topic.includes('冒烟主题')) throw new Error('sync pull 未包含最新 taxonomy');

  // feat08 场景1：sync push 携带 taxonomy 生效
  const pushTax = {
    ...pulled.taxonomy,
    purpose: [...pulled.taxonomy.purpose, '冒烟用途'],
    updatedAt: new Date().toISOString(),
  };
  const pushTaxRes = await fetch(`${baseUrl}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify(
      SyncPushRequestSchema.parse({ bookmarks: [], views: [], taxonomy: pushTax }),
    ),
  });
  if (!pushTaxRes.ok) throw new Error(`sync push taxonomy 失败: ${pushTaxRes.status}`);
  const pull2Res = await fetch(`${baseUrl}/taxonomy`, { headers: auth });
  const pull2 = TaxonomyGetResponseSchema.parse(await getJson(pull2Res));
  if (!pull2.taxonomy.purpose.includes('冒烟用途')) throw new Error('sync push 的 taxonomy 未生效');

  // 旧式 push（不带 taxonomy）兼容 + 既有书签链路回归
  const bookmark = createBookmark(randomUUID(), {
    url: `${baseUrl}/settings-smoke/${Date.now()}`,
    title: 'settings smoke 书签',
  });
  const legacyPushRes = await fetch(`${baseUrl}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify(SyncPushRequestSchema.parse({ bookmarks: [bookmark], views: [] })),
  });
  if (!legacyPushRes.ok) throw new Error(`旧式 push 失败: ${legacyPushRes.status}`);
  const legacyPush = SyncPushResponseSchema.parse(await getJson(legacyPushRes));
  if (legacyPush.applied.bookmarks !== 1) throw new Error('旧式 push 书签未应用');

  const finalPull = SyncPullResponseSchema.parse(
    await getJson(await fetch(`${baseUrl}/sync?since=1970-01-01T00:00:00.000Z`, { headers: auth })),
  );
  if (!finalPull.bookmarks.some((b) => b.id === bookmark.id)) throw new Error('书签回归失败');
  if (!finalPull.taxonomy.purpose.includes('冒烟用途')) throw new Error('taxonomy 回归失败');

  console.log('SETTINGS SMOKE OK: healthz 版本 → taxonomy seed/LWW → sync 并入 → 旧式 push 兼容');
  console.log(`默认集合自检: topic=${createDefaultTaxonomy().topic.length} 项`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
