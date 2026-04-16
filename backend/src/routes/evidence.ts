import { Router, Response } from 'express';
import { z } from 'zod';
import { Resolution } from '@prisma/client';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const router = Router();

const createEvidenceSchema = z.object({
  marketId: z.string().min(1),
  outcome: z.nativeEnum(Resolution),
  evidenceUrl: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
});

// GET /api/evidence/:marketId — public audit log for a market
router.get('/:marketId', async (req, res, next) => {
  try {
    const market = await prisma.market.findUnique({ where: { id: req.params.marketId } });
    if (!market) throw new AppError(404, 'Market not found');

    const evidence = await prisma.resolutionEvidence.findMany({
      where: { marketId: req.params.marketId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(evidence);
  } catch (err) {
    next(err);
  }
});

// POST /api/evidence — admin posts resolution evidence
router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate(createEvidenceSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const market = await prisma.market.findUnique({ where: { id: req.body.marketId } });
      if (!market) throw new AppError(404, 'Market not found');

      const evidence = await prisma.resolutionEvidence.create({
        data: {
          marketId: req.body.marketId,
          adminAddress: req.user!.walletAddress,
          outcome: req.body.outcome,
          evidenceUrl: req.body.evidenceUrl,
          notes: req.body.notes,
        },
      });

      // Also update market status to RESOLVED with the outcome
      await prisma.market.update({
        where: { id: req.body.marketId },
        data: {
          status: 'RESOLVED',
          resolution: req.body.outcome,
          resolvedAt: new Date(),
        },
      });

      res.status(201).json(evidence);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
