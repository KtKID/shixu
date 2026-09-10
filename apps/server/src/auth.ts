import { hash, verify } from '@node-rs/argon2';
import { sign, verify as verifyJwt } from 'hono/jwt';

/** v1：access token 30 天，不做 refresh 轮换。 */
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (secret === undefined || secret.length < 16) {
    throw new Error('JWT_SECRET 未设置或过短（至少 16 字符）');
  }
  return secret;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password);
  } catch {
    return false;
  }
}

export async function issueToken(userId: string): Promise<{ token: string; expiresAt: string }> {
  const expiresAtMs = Date.now() + TOKEN_TTL_SECONDS * 1000;
  const token = await sign({ sub: userId, exp: Math.floor(expiresAtMs / 1000) }, getJwtSecret());
  return { token, expiresAt: new Date(expiresAtMs).toISOString() };
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const payload = await verifyJwt(token, getJwtSecret(), 'HS256');
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
