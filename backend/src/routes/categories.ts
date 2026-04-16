import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const router = Router();

const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  icon: z.string().optional(),
  description: z.string().max(200).optional(),
});

// GET /api/categories
router.get('/', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { markets: { where: { status: 'OPEN' } } } },
      },
    });

    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// GET /api/categories/:slug
router.get('/:slug', async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: { slug: req.params.slug },
      include: {
        _count: { select: { markets: true } },
      },
    });

    if (!category) throw new AppError(404, 'Category not found');

    res.json(category);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories — admin only
router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate(createCategorySchema),
  async (req, res, next) => {
    try {
      const category = await prisma.category.create({ data: req.body });
      res.status(201).json(category);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
