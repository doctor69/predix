import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import marketsRoute from './routes/markets';
import categoriesRoute from './routes/categories';
import usersRoute from './routes/users';
import evidenceRoute from './routes/evidence';
import agentRoute from './routes/agent';

export type Bindings = {
  DATABASE_URL: string;
  PRIVY_APP_ID: string;
  ADMIN_ADDRESSES: string;
  FRONTEND_URL: string;
  ANTHROPIC_API_KEY: string;
};

export type Variables = {
  user?: { walletAddress: string; privyUserId: string };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', logger());
app.use('*', prettyJSON());

app.use('*', async (c, next) => {
  return cors({
    origin: c.env.FRONTEND_URL,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })(c, next);
});

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.route('/api/markets', marketsRoute);
app.route('/api/categories', categoriesRoute);
app.route('/api/users', usersRoute);
app.route('/api/evidence', evidenceRoute);
app.route('/api/agent', agentRoute);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
