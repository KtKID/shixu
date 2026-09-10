import type { MiddlewareHandler } from 'hono';
import { verifyToken } from '../auth';

export type AuthEnv = { Variables: { userId: string } };

/** Bearer JWT 鉴权：通过后 c.get('userId') 可用。 */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (header === undefined || !header.startsWith('Bearer ')) {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }
  const userId = await verifyToken(header.slice('Bearer '.length));
  if (userId === null) {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }
  c.set('userId', userId);
  return next();
};
