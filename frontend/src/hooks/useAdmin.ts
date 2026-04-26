import { useState, useCallback } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useAccount } from 'wagmi';
import { PREDICTION_MARKET_ABI } from '@/lib/abi';
import { CONTRACT_ADDRESS, CONTRACT_DEPLOYED } from '@/lib/config';

/** Fetch the contract's admin address and check if the current wallet is admin */
export function useIsAdmin() {
  const { address } = useAccount();

  const { data: adminAddress } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'admin',
    query: { enabled: CONTRACT_DEPLOYED },
  });

  const { data: ownerAddress } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'owner',
    query: { enabled: CONTRACT_DEPLOYED },
  });

  // Fallback: check against NEXT_PUBLIC_ADMIN_ADDRESSES when contract isn't deployed yet
  const envAdmins = (process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin =
    !!address &&
    (address.toLowerCase() === (adminAddress as string)?.toLowerCase() ||
      address.toLowerCase() === (ownerAddress as string)?.toLowerCase() ||
      envAdmins.includes(address.toLowerCase()));

  return {
    isAdmin,
    adminAddress: adminAddress as `0x${string}` | undefined,
    ownerAddress: ownerAddress as `0x${string}` | undefined,
  };
}

interface CreateMarketParams {
  question: string;
  category: string;
  imageUrl: string;
  resolutionSource: string;
  closingTime: number;   // unix timestamp
  resolutionTime: number; // unix timestamp
}

/** Hook for creating a new market */
export function useCreateMarket() {
  const { writeContractAsync, data: tx, isPending } = useWriteContract();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { isSuccess: confirmed } = useWaitForTransactionReceipt({
    hash: tx,
    query: { enabled: !!tx },
  });

  const createMarket = useCallback(
    async (params: CreateMarketParams) => {
      setError(null);
      setSuccess(false);
      try {
        await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'createMarket',
          args: [
            params.question,
            params.category,
            params.imageUrl,
            params.resolutionSource,
            BigInt(params.closingTime),
            BigInt(params.resolutionTime),
          ],
        });
        setSuccess(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Create market failed');
      }
    },
    [writeContractAsync],
  );

  return { createMarket, isPending, success: success || confirmed, error, tx };
}

/** Hook for resolving a market */
export function useResolveMarket() {
  const { writeContractAsync, isPending } = useWriteContract();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resolveMarket = useCallback(
    async (marketId: number, isYes: boolean) => {
      setError(null);
      setSuccess(false);
      try {
        await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'resolveMarket',
          args: [BigInt(marketId), isYes],
        });
        setSuccess(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Resolve market failed');
      }
    },
    [writeContractAsync],
  );

  return { resolveMarket, isPending, success, error };
}

/** Hook for cancelling a market */
export function useCancelMarket() {
  const { writeContractAsync, isPending } = useWriteContract();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const cancelMarket = useCallback(
    async (marketId: number) => {
      setError(null);
      setSuccess(false);
      try {
        await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'cancelMarket',
          args: [BigInt(marketId)],
        });
        setSuccess(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Cancel market failed');
      }
    },
    [writeContractAsync],
  );

  return { cancelMarket, isPending, success, error };
}
