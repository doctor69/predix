import { MarketStatus, Resolution } from '@prisma/client';
import prisma from '../lib/prisma';

export interface CreateMarketInput {
  id: string;
  question: string;
  categoryId: string;
  imageUrl?: string;
  resolutionSource: string;
  closingTime: Date;
  resolutionTime: Date;
  createdBy: string;
  txHash?: string;
}

export interface MarketFilters {
  status?: MarketStatus;
  categorySlug?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function createMarket(input: CreateMarketInput) {
  return prisma.market.create({
    data: input,
    include: { category: true },
  });
}

export async function listMarkets(filters: MarketFilters = {}) {
  const { page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.categorySlug) where.category = { slug: filters.categorySlug };
  if (filters.search) {
    where.question = { contains: filters.search, mode: 'insensitive' };
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

  return { markets, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function resolveMarket(
  marketId: string,
  outcome: Resolution,
  adminAddress: string,
  txHash?: string,
  evidenceUrl?: string,
  notes?: string
) {
  const [market] = await Promise.all([
    prisma.market.update({
      where: { id: marketId },
      data: {
        status: MarketStatus.RESOLVED,
        resolution: outcome,
        resolvedAt: new Date(),
        resolveTxHash: txHash,
      },
    }),
    prisma.resolutionEvidence.create({
      data: { marketId, adminAddress, outcome, evidenceUrl, notes },
    }),
  ]);

  return market;
}

export async function syncMarketPools(
  marketId: string,
  yesPool: string,
  noPool: string,
  totalVolume: string
) {
  return prisma.market.update({
    where: { id: marketId },
    data: { yesPool, noPool, totalVolume },
  });
}
