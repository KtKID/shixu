import { randomUUID } from 'node:crypto';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  createBookmark,
} from '@x-threadpick/shared';

/** 端到端冒烟：登录 → 推送 1 条书签 → 增量拉取验证。前置：已用 CLI 建号并启动 server。 */

const baseUrl = process.env['SMOKE_BASE_URL'] ?? 'http://127.0.0.1:8787';
const email = process.env['SMOKE_EMAIL'] ?? 'smoke@example.com';
const password = process.env['SMOKE_PASSWORD'] ?? 'smoke-password-1';

async function main(): Promise<void> {
  const creds = LoginRequestSchema.parse({ email, password });

  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  });
  if (!loginRes.ok) throw new Error(`登录失败: ${loginRes.status}`);
  const loginRaw: unknown = await loginRes.json();
  const { token } = LoginResponseSchema.parse(loginRaw);

  const bookmark = createBookmark(randomUUID(), {
    url: `${baseUrl}/smoke/${Date.now()}`,
    title: 'smoke 书签',
  });
  const pushBody = SyncPushRequestSchema.parse({ bookmarks: [bookmark], views: [] });
  const pushRes = await fetch(`${baseUrl}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(pushBody),
  });
  if (!pushRes.ok) throw new Error(`推送失败: ${pushRes.status} ${await pushRes.text()}`);
  const pushRaw: unknown = await pushRes.json();
  const pushed = SyncPushResponseSchema.parse(pushRaw);
  if (pushed.applied.bookmarks !== 1) {
    throw new Error(`期望应用 1 条，实际 ${pushed.applied.bookmarks}`);
  }

  const pullRes = await fetch(`${baseUrl}/sync?since=1970-01-01T00:00:00.000Z`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!pullRes.ok) throw new Error(`拉取失败: ${pullRes.status}`);
  const pullRaw: unknown = await pullRes.json();
  const pulled = SyncPullResponseSchema.parse(pullRaw);
  if (!pulled.bookmarks.some((b) => b.id === bookmark.id)) {
    throw new Error('推送的书签未出现在拉取结果中');
  }

  console.log('SMOKE OK: 登录 → 推送 1 条 → 拉取验证通过');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
