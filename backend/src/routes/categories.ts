import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createDb } from '../db';
import { categories } from '../db/schema';
import { requireAuth, requireAdmin } from '../middleware/auth';
import type { Bindings, Variables } from '../index';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const createSchema = z.object({
  name:        z.string().min(1).max(50),
  slug:        z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  icon:        z.string().optional(),
  description: z.string().max(200).optional(),
});

// GET /api/categories
app.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const rows = await db.select().from(categories).orderBy(categories.name);
  return c.json(rows);
});

// GET /api/categories/:slug
app.get('/:slug', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const rows = await db.select().from(categories).where(eq(categories.slug, c.req.param('slug')));
  if (!rows.length) return c.json({ error: 'Category not found' }, 404);
  return c.json(rows[0]);
});

// POST /api/categories — admin only
app.post('/', requireAuth, requireAdmin, zValidator('json', createSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const [cat] = await db.insert(categories).values(c.req.valid('json')).returning();
  return c.json(cat, 201);
});

export default app;
