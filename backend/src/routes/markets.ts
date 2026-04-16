import { Router, Response } from 'express';
import { z } from 'zod';
import { MarketStatus, Resolution } from '@prisma/client';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const router = Router();

const createMarketSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(10).max(500),
  categoryId: z.string().min(1),
  imageUrl: z.string().url().optional(),
  resolutionSource: z.string().min(1).max(500),
  closingTime: z.string().datetime(),
  resolutionTime: z.string().datetime(),
  txHash: z.string().optional(),
  yesPool: z.string().optional(),
  noPool: z.string().optional(),
  totalVolume: z.string().optional(),
});

const updateMarketSchema = z.object({
  yesPool: z.string().optional(),
  noPool: z.string().optional(),
  totalVolume: z.string().optional(),
  status: z.nativeEnum(MarketStatus).optional(),
  resolution: z.nativeEnum(Resolution).optional(),
  resolvedAt: z.string().datetime().optional(),
  resolveTxHash: z.string().optional(),
});

// GET /api/markets
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (req.query.status) {
      where.status = req.query.status as MarketStatus;
    }
    if (req.query.category) {
      where.category = { slug: req.query.category };
    }
    if (req.query.search) {
      where.question = { contains: req.query.search as string, mode: 'insensitive' };
    }

    const [markets, total] = await Promise.all([
      prisma.market.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { category: true },
      }),
      prisma.market.count({ where }),
    ]);

    res.json({
      markets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/markets/:id
router.get('/:id', async (req, res, next) => {
  try {
    const market = await prisma.market.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        evidence: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!market) {
      throw new AppError(404, 'Market not found');
    }

    res.json(market);
  } catch (err) {
    next(err);
  }
});

// POST /api/markets — admin only
router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate(createMarketSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const market = await prisma.market.create({
        data: {
          ...req.body,
          createdBy: req.user!.walletAddress,
          closingTime: new Date(req.body.closingTime),
          resolutionTime: new Date(req.body.resolutionTime),
        },
        include: { category: true },
      });

      res.status(201).json(market);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/markets/:id — admin only
router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(updateMarketSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const existing = await prisma.market.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new AppError(404, 'Market not found');

      const data: Record<string, unknown> = { ...req.body };
      if (req.body.resolvedAt) data.resolvedAt = new Date(req.body.resolvedAt);

      const market = await prisma.market.update({
        where: { id: req.params.id },
        data,
        include: { category: true },
      });

      res.json(market);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/markets/trending — top markets by volume
router.get('/meta/trending', async (_req, res, next) => {
  try {
    const markets = await prisma.market.findMany({
      where: { status: 'OPEN' },
      orderBy: { totalVolume: 'desc' },
      take: 10,
      include: { category: true },
    });

    res.json(markets);
  } catch (err) {
    next(err);
  }
});

export default router;
