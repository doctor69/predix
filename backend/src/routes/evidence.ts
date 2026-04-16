import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { createDb } from '../db';
import { markets, resolutionEvidence } from '../db/schema';
import { requireAuth, requireAdmin } from '../middleware/auth';
import type { Bindings, Variables } from '../index';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const createSchema = z.object({
  marketId:    z.string().min(1),
  outcome:     z.enum(['YES', 'NO']),
  evidenceUrl: z.string().url().optional(),
  notes:       z.string().max(2000).optional(),
});

// GET /api/evidence/:marketId — public audit log
app.get('/:marketId', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const marketRows = await db.select().from(markets).where(eq(markets.id, c.req.param('marketId')));
  if (!marketRows.length) return c.json({ error: 'Market not found' }, 404);

  const rows = await db.select().from(resolutionEvidence)
    .where(eq(resolutionEvidence.marketId, c.req.param('marketId')))
    .orderBy(desc(resolutionEvidence.createdAt));

  return c.json(rows);
});

// POST /api/evidence — admin posts resolution evidence + marks market resolved
app.post('/', requireAuth, requireAdmin, zValidator('json', createSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const marketRows = await db.select().from(markets).where(eq(markets.id, body.marketId));
  if (!marketRows.length) return c.json({ error: 'Market not found' }, 404);

  const [evidence] = await db.insert(resolutionEvidence).values({
    marketId:     body.marketId,
    adminAddress: user.walletAddress,
    outcome:      body.outcome,
    evidenceUrl:  body.evidenceUrl,
    notes:        body.notes,
  }).returning();

  await db.update(markets)
    .set({ status: 'RESOLVED', resolution: body.outcome, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(markets.id, body.marketId));

  return c.json(evidence, 201);
});

export default app;
