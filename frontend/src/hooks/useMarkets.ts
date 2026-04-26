import { useReadContract, useReadContracts } from 'wagmi';
import { PREDICTION_MARKET_ABI } from '@/lib/abi';
import { CONTRACT_ADDRESS, CONTRACT_DEPLOYED, Outcome } from '@/lib/config';

export interface Market {
  id: number;
  question: string;
  category: string;
  imageUrl: string;
  resolutionSource: string;
  createdAt: bigint;
  closingTime: bigint;
  resolutionTime: bigint;
  resolvedAt: bigint;
  finalizedAt: bigint;
  yesPool: bigint;
  noPool: bigint;
  feesCollected: bigint;
  outcome: Outcome;
  disputed: boolean;
}

/** Fetch the total number of markets */
export function useMarketCount() {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'marketCount',
    query: { enabled: CONTRACT_DEPLOYED },
  });
}

/** Fetch all markets via multicall */
export function useMarkets() {
  const { data: marketCount, isLoading: countLoading } = useMarketCount();

  const count = Number(marketCount ?? 0);

  const { data: rawMarkets, isLoading: marketsLoading } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: CONTRACT_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'getMarket' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: CONTRACT_DEPLOYED && count > 0 },
  });

  const markets: Market[] = (rawMarkets ?? [])
    .map((result, i) => {
      if (result.status !== 'success' || !result.result) return null;
      const m = result.result as unknown as Omit<Market, 'id'>;
      return { id: i, ...m } as Market;
    })
    .filter((m): m is Market => m !== null);

  return {
    markets,
    marketCount: count,
    isLoading: countLoading || marketsLoading,
  };
}

/** Fetch a single market by ID */
export function useMarket(marketId: number) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarket',
    args: [BigInt(marketId)],
    query: {
      enabled: CONTRACT_DEPLOYED && marketId >= 0,
      refetchInterval: 15_000,
    },
  });

  const market: Market | null = data
    ? ({ id: marketId, ...(data as unknown as Omit<Market, 'id'>) } as Market)
    : null;

  return { market, isLoading, error, refetch };
}

/** Fetch market odds */
export function useMarketOdds(marketId: number) {
  const { data } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketOdds',
    args: [BigInt(marketId)],
    query: {
      enabled: CONTRACT_DEPLOYED && marketId >= 0,
      refetchInterval: 15_000,
    },
  });

  if (!data) return { yesPercent: 50, noPercent: 50 };
  const [yes, no] = data as [bigint, bigint];
  return { yesPercent: Number(yes), noPercent: Number(no) };
}

/** Whether a market is currently open for betting */
export function isMarketOpen(market: Market): boolean {
  return (
    market.outcome === Outcome.UNRESOLVED &&
    Date.now() < Number(market.closingTime) * 1000
  );
}

/** Whether the dispute window is still open */
export function isInDisputeWindow(market: Market): boolean {
  return (
    market.outcome !== Outcome.UNRESOLVED &&
    market.outcome !== Outcome.CANCELLED &&
    Date.now() < Number(market.finalizedAt) * 1000
  );
}

/** Whether payouts are available */
export function isFinalized(market: Market): boolean {
  return (
    (market.outcome === Outcome.YES || market.outcome === Outcome.NO) &&
    Date.now() >= Number(market.finalizedAt) * 1000
  );
}
