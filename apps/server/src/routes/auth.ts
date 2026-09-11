import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  RegisterRequestSchema,
} from '@x-threadpick/shared';
import { db } from '../db';
import { users } from '../db/schema';
import { hashPassword, issueToken, verifyPassword } from '../auth';

export const authRoutes = new Hono()
  .post('/login', async (c) => {
    const raw: unknown = await c.req.json();
    const body = LoginRequestSchema.parse(raw);

    const user = db.select().from(users).where(eq(users.email, body.email)).get();
    if (user === undefined || !(await verifyPassword(user.passwordHash, body.password))) {
      return c.json({ error: 'INVALID_CREDENTIALS' }, 401);
    }

    return c.json(LoginResponseSchema.parse(await issueToken(user.id)));
  })
  .post('/register', async (c) => {
    const raw: unknown = await c.req.json();
    const body = RegisterRequestSchema.parse(raw);

    const existing = db.select().from(users).where(eq(users.email, body.email)).get();
    if (existing !== undefined) {
      return c.json({ error: 'EMAIL_TAKEN' }, 409);
    }

    const user = {
      id: randomUUID(),
      email: body.email,
      passwordHash: await hashPassword(body.password),
      createdAt: new Date().toISOString(),
    };
    db.insert(users).values(user).run();

    return c.json(LoginResponseSchema.parse(await issueToken(user.id)), 201);
  });
