import { useReadContract, useReadContracts } from 'wagmi';
import { useAccount } from 'wagmi';
import { PREDICTION_MARKET_ABI, ERC20_ABI } from '@/lib/abi';
import { CONTRACT_ADDRESS, CONTRACT_DEPLOYED, USDC_ADDRESS } from '@/lib/config';

export interface UserPosition {
  marketId: number;
  yesAmount: bigint;
  noAmount: bigint;
  claimed: boolean;
}

/** Fetch user's positions in a single market */
export function useUserPosition(marketId: number) {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getUserPositions',
    args: [BigInt(marketId), address as `0x${string}`],
    query: {
      enabled: CONTRACT_DEPLOYED && !!address && marketId >= 0,
      refetchInterval: 15_000,
    },
  });

  if (!data) return { yesAmount: 0n, noAmount: 0n, claimed: false, isLoading, refetch };
  const [yesAmount, noAmount, claimed] = data as [bigint, bigint, boolean];
  return { yesAmount, noAmount, claimed, isLoading, refetch };
}

/** Fetch user positions across multiple markets */
export function useUserPositions(marketIds: number[]) {
  const { address } = useAccount();

  const { data, isLoading } = useReadContracts({
    contracts: marketIds.map((id) => ({
      address: CONTRACT_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'getUserPositions' as const,
      args: [BigInt(id), address as `0x${string}`] as const,
    })),
    query: {
      enabled: CONTRACT_DEPLOYED && !!address && marketIds.length > 0,
    },
  });

  const positions: UserPosition[] = (data ?? [])
    .map((result, i) => {
      if (result.status !== 'success' || !result.result) return null;
      const [yesAmount, noAmount, claimed] = result.result as [bigint, bigint, boolean];
      if (yesAmount === 0n && noAmount === 0n) return null; // no position
      return { marketId: marketIds[i], yesAmount, noAmount, claimed };
    })
    .filter((p): p is UserPosition => p !== null);

  return { positions, isLoading };
}

/** Fetch user's USDC balance and contract allowance */
export function useUSDCBalance() {
  const { address } = useAccount();

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address as `0x${string}`, CONTRACT_ADDRESS],
    query: { enabled: !!address && CONTRACT_DEPLOYED },
  });

  return {
    balance: (balance as bigint | undefined) ?? 0n,
    allowance: (allowance as bigint | undefined) ?? 0n,
    refetch: () => {
      refetchBalance();
      refetchAllowance();
    },
  };
}

/** Fetch potential payout for a user in a market */
export function usePotentialPayout(marketId: number) {
  const { address } = useAccount();

  const { data } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getPayout',
    args: [BigInt(marketId), address as `0x${string}`],
    query: {
      enabled: CONTRACT_DEPLOYED && !!address && marketId >= 0,
    },
  });

  return (data as bigint | undefined) ?? 0n;
}
