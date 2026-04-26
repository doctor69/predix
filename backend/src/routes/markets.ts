import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, ilike, desc } from 'drizzle-orm';
import { createDb } from '../db';
import { markets, categories } from '../db/schema';
import { requireAuth, requireAdmin } from '../middleware/auth';
import type { Bindings, Variables } from '../index';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const createSchema = z.object({
  id:               z.string().min(1),
  question:         z.string().min(10).max(500),
  categoryId:       z.string().min(1),
  imageUrl:         z.string().url().optional(),
  resolutionSource: z.string().min(1).max(500),
  closingTime:      z.string().datetime(),
  resolutionTime:   z.string().datetime(),
  txHash:           z.string().optional(),
  yesPool:          z.string().optional(),
  noPool:           z.string().optional(),
  totalVolume:      z.string().optional(),
});

const updateSchema = z.object({
  yesPool:       z.string().optional(),
  noPool:        z.string().optional(),
  totalVolume:   z.string().optional(),
  status:        z.enum(['OPEN', 'CLOSED', 'RESOLVED', 'CANCELLED', 'DISPUTED']).optional(),
  resolution:    z.enum(['YES', 'NO']).optional(),
  resolvedAt:    z.string().datetime().optional(),
  resolveTxHash: z.string().optional(),
});

// GET /api/markets
app.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const page  = Math.max(1, Number(c.req.query('page') || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 20)));
  const offset = (page - 1) * limit;

  const query = db.select().from(markets)
    .innerJoin(categories, eq(markets.categoryId, categories.id))
    .orderBy(desc(markets.createdAt))
    .limit(limit)
    .offset(offset);

  if (c.req.query('status')) {
    query.where(eq(markets.status, c.req.query('status') as 'OPEN'));
  }
  if (c.req.query('search')) {
    query.where(ilike(markets.question, `%${c.req.query('search')}%`));
  }

  const rows = await query;
  return c.json({ markets: rows, pagination: { page, limit, offset } });
});

// GET /api/markets/trending
app.get('/trending', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const rows = await db.select().from(markets)
    .innerJoin(categories, eq(markets.categoryId, categories.id))
    .where(eq(markets.status, 'OPEN'))
    .orderBy(desc(markets.totalVolume))
    .limit(10);
  return c.json(rows);
});

// GET /api/markets/:id
app.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const rows = await db.select().from(markets)
    .innerJoin(categories, eq(markets.categoryId, categories.id))
    .where(eq(markets.id, c.req.param('id')));

  if (!rows.length) return c.json({ error: 'Market not found' }, 404);
  return c.json(rows[0]);
});

// POST /api/markets — admin only
app.post('/', requireAuth, requireAdmin, zValidator('json', createSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const [market] = await db.insert(markets).values({
    ...body,
    createdBy:      user.walletAddress,
    closingTime:    new Date(body.closingTime),
    resolutionTime: new Date(body.resolutionTime),
    yesPool:        body.yesPool    ?? '0',
    noPool:         body.noPool     ?? '0',
    totalVolume:    body.totalVolume ?? '0',
  }).returning();

  return c.json(market, 201);
});

// PATCH /api/markets/:id — admin only
app.patch('/:id', requireAuth, requireAdmin, zValidator('json', updateSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const body = c.req.valid('json');

  const existing = await db.select().from(markets).where(eq(markets.id, c.req.param('id')));
  if (!existing.length) return c.json({ error: 'Market not found' }, 404);

  const [updated] = await db.update(markets)
    .set({
      ...body,
      resolvedAt: body.resolvedAt ? new Date(body.resolvedAt) : undefined,
      updatedAt:  new Date(),
    })
    .where(eq(markets.id, c.req.param('id')))
    .returning();

  return c.json(updated);
});

export default app;
