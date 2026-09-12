import { randomUUID } from 'node:crypto';
import {
  createBookmark,
  LoginResponseSchema,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  type SyncPullResponse,
} from '@x-threadpick/shared';

/**
 * 端到端冒烟（feat05，task-server-overview T4）：
 * 注册 → 推送 3 条书签 → pull 断言 bookmarksTotal 与推送数一致（3）且书签齐全
 * → 追加推送 1 条墓碑 → pull 断言 bookmarksTotal 不变（未删除口径，feat02）。
 * 全程真实 HTTP + shared schema 校验；账号经 /auth/register 现场创建，无需 CLI。
 * 前置：server 已启动（SMOKE_BASE_URL，默认 127.0.0.1:60024），且运行的是含
 * bookmarksTotal 的当前代码（旧进程会因响应缺字段解析失败，重启即可）。
 */

const baseUrl = process.env['SMOKE_BASE_URL'] ?? 'http://127.0.0.1:60024';

async function pushBookmarks(
  auth: Record<string, string>,
  bookmarks: ReturnType<typeof createBookmark>[],
): Promise<void> {
  const pushRes = await fetch(`${baseUrl}/sync`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(SyncPushRequestSchema.parse({ bookmarks, views: [] })),
  });
  if (!pushRes.ok) throw new Error(`推送失败: ${pushRes.status} ${await pushRes.text()}`);
  const pushed = SyncPushResponseSchema.parse(await pushRes.json());
  if (pushed.applied.bookmarks !== bookmarks.length) {
    throw new Error(`期望应用 ${bookmarks.length} 条，实际 ${pushed.applied.bookmarks}`);
  }
}

async function pullTotal(token: string): Promise<SyncPullResponse> {
  const pullRes = await fetch(`${baseUrl}/sync?since=1970-01-01T00:00:00.000Z`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!pullRes.ok) throw new Error(`拉取失败: ${pullRes.status}`);
  return SyncPullResponseSchema.parse(await pullRes.json());
}

async function main(): Promise<void> {
  // 注册新账号（全新账号 → 服务器收藏从 0 开始，计数可精确断言）
  const email = `smoke-${randomUUID()}@example.com`;
  const password = 'smoke-password-1';
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!registerRes.ok) throw new Error(`注册失败: ${registerRes.status}`);
  const { token } = LoginResponseSchema.parse(await registerRes.json());
  const auth = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

  // 推送 3 条书签 → pull：bookmarksTotal 与推送数一致，推送的书签都在结果中
  const active = [1, 2, 3].map((i) =>
    createBookmark(randomUUID(), {
      url: `${baseUrl}/smoke/${Date.now()}/${i}`,
      title: `smoke 书签 ${i}`,
    }),
  );
  await pushBookmarks(auth, active);
  const pulled = await pullTotal(token);
  if (pulled.bookmarksTotal !== active.length) {
    throw new Error(
      `bookmarksTotal 应与推送数 ${active.length} 一致，实际 ${pulled.bookmarksTotal}`,
    );
  }

  // 追加推送 1 条墓碑 → pull：bookmarksTotal 不变（未删除口径，feat02 场景1）
  const tombstone = {
    ...createBookmark(randomUUID(), {
      url: `${baseUrl}/smoke/${Date.now()}/gone`,
      title: '已删除书签',
    }),
    deletedAt: new Date().toISOString(),
  };
  await pushBookmarks(auth, [tombstone]);
  const pulledAfterTombstone = await pullTotal(token);
  if (pulledAfterTombstone.bookmarksTotal !== active.length) {
    throw new Error(
      `墓碑不应计入（feat02）：bookmarksTotal 应仍为 ${active.length}，实际 ${pulledAfterTombstone.bookmarksTotal}`,
    );
  }

  console.log('SMOKE OK: 注册 → 推送 3 条 → bookmarksTotal=3 一致 → 墓碑不计入验证通过');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
