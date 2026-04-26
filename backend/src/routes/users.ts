import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createDb } from '../db';
import { users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../index';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const updateSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl:   z.string().url().optional(),
});

// GET /api/users/:address
app.get('/:address', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const address = c.req.param('address').toLowerCase();
  const rows = await db.select().from(users).where(eq(users.walletAddress, address));
  if (!rows.length) return c.json({ error: 'User not found' }, 404);
  return c.json(rows[0]);
});

// POST /api/users/me — upsert on first login
app.post('/me', requireAuth, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const address = c.get('user')!.walletAddress;

  const existing = await db.select().from(users).where(eq(users.walletAddress, address));
  if (existing.length) return c.json(existing[0]);

  const [user] = await db.insert(users).values({ walletAddress: address }).returning();
  return c.json(user, 201);
});

// PATCH /api/users/me
app.patch('/me', requireAuth, zValidator('json', updateSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const address = c.get('user')!.walletAddress;

  const [user] = await db.update(users)
    .set({ ...c.req.valid('json'), updatedAt: new Date() })
    .where(eq(users.walletAddress, address))
    .returning();

  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json(user);
});

export default app;
