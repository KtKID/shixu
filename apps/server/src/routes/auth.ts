import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { LoginRequestSchema, LoginResponseSchema } from '@x-threadpick/shared';
import { db } from '../db';
import { users } from '../db/schema';
import { issueToken, verifyPassword } from '../auth';

export const authRoutes = new Hono().post('/login', async (c) => {
  const raw: unknown = await c.req.json();
  const body = LoginRequestSchema.parse(raw);

  const user = db.select().from(users).where(eq(users.email, body.email)).get();
  if (user === undefined || !(await verifyPassword(user.passwordHash, body.password))) {
    return c.json({ error: 'INVALID_CREDENTIALS' }, 401);
  }

  return c.json(LoginResponseSchema.parse(await issueToken(user.id)));
});
