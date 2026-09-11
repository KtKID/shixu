import { randomUUID } from 'node:crypto';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  RegisterRequestSchema,
} from '@x-threadpick/shared';

/** 注册链路冒烟：注册 → 登录 → 重复注册 409 → 不合规密码 400。前置：server 已启动。 */

const baseUrl = process.env['SMOKE_BASE_URL'] ?? 'http://127.0.0.1:60024';

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function main(): Promise<void> {
  const email = `smoke-${randomUUID()}@example.com`;
  const password = 'smoke-pass-1';

  const registerRes = await post(
    '/auth/register',
    RegisterRequestSchema.parse({ email, password }),
  );
  if (registerRes.status !== 201) {
    throw new Error(`注册失败: ${registerRes.status} ${await registerRes.text()}`);
  }
  LoginResponseSchema.parse(await registerRes.json());

  const loginRes = await post('/auth/login', LoginRequestSchema.parse({ email, password }));
  if (!loginRes.ok) throw new Error(`注册后登录失败: ${loginRes.status}`);
  LoginResponseSchema.parse(await loginRes.json());

  const dupRes = await post('/auth/register', { email, password });
  if (dupRes.status !== 409) throw new Error(`重复注册应 409，实际 ${dupRes.status}`);

  const weakRes = await post('/auth/register', {
    email: `smoke-${randomUUID()}@example.com`,
    password: 'abcdef',
  });
  if (weakRes.status !== 400) throw new Error(`不合规密码应 400，实际 ${weakRes.status}`);

  console.log('SMOKE OK: 注册 → 登录 → 重复注册 409 → 弱密码 400');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
