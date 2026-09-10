import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { ZodError } from 'zod';
import { HealthResponseSchema } from '@x-threadpick/shared';
import { authRoutes } from './routes/auth';
import { syncRoutes } from './routes/sync';
import { taxonomyRoutes } from './routes/taxonomy';
import { SERVER_VERSION } from './version';

const app = new Hono();

app.get('/healthz', (c) =>
  c.json(
    HealthResponseSchema.parse({
      ok: true,
      version: SERVER_VERSION,
      serverTime: new Date().toISOString(),
    }),
  ),
);
app.route('/auth', authRoutes);
app.route('/sync', syncRoutes);
app.route('/taxonomy', taxonomyRoutes);

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: 'BAD_REQUEST' }, 400);
  }
  console.error(err);
  return c.json({ error: 'INTERNAL' }, 500);
});

const port = Number(process.env['PORT'] ?? 60024);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[x-threadpick server] http://127.0.0.1:${info.port}`);
});
