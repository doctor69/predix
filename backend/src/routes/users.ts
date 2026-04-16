import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const router = Router();

const updateUserSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().optional(),
});

// GET /api/users/:address
router.get('/:address', async (req, res, next) => {
  try {
    const address = req.params.address.toLowerCase();
    const user = await prisma.user.findUnique({ where: { walletAddress: address } });

    if (!user) throw new AppError(404, 'User not found');

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/users/me — upsert profile on first login
router.post('/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const user = await prisma.user.upsert({
      where: { walletAddress: req.user!.walletAddress },
      update: { updatedAt: new Date() },
      create: { walletAddress: req.user!.walletAddress },
    });

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me — update own profile
router.patch(
  '/me',
  requireAuth,
  validate(updateUserSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const user = await prisma.user.update({
        where: { walletAddress: req.user!.walletAddress },
        data: req.body,
      });

      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
