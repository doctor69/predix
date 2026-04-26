import { useState, useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { PREDICTION_MARKET_ABI, ERC20_ABI } from '@/lib/abi';
import { CONTRACT_ADDRESS, USDC_ADDRESS } from '@/lib/config';
import { parseUSDC } from '@/lib/format';

type TradeStep = 'idle' | 'approving' | 'approved' | 'betting' | 'success' | 'error';

interface UsePlaceBetReturn {
  step: TradeStep;
  error: string | null;
  approveTx: `0x${string}` | undefined;
  betTx: `0x${string}` | undefined;
  approve: (amountUsdc: string) => Promise<void>;
  placeBet: (marketId: number, isYes: boolean, amountUsdc: string) => Promise<void>;
  reset: () => void;
}

/** Hook for the two-step approve → placeBet flow */
export function usePlaceBet(): UsePlaceBetReturn {
  const [step, setStep] = useState<TradeStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync: writeApprove, data: approveTx } = useWriteContract();
  const { writeContractAsync: writeBet, data: betTx } = useWriteContract();

  // Wait for approval confirmation
  const { isSuccess: approvalConfirmed } = useWaitForTransactionReceipt({
    hash: approveTx,
    query: { enabled: !!approveTx },
  });

  // Wait for bet confirmation
  const { isSuccess: betConfirmed } = useWaitForTransactionReceipt({
    hash: betTx,
    query: { enabled: !!betTx },
  });

  const approve = useCallback(
    async (amountUsdc: string) => {
      setError(null);
      setStep('approving');
      try {
        const amount = parseUSDC(amountUsdc);
        // Approve max uint256 to avoid re-approving on every trade
        const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        await writeApprove({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACT_ADDRESS, maxApproval],
        });
        setStep('approved');
        void amount; // suppress unused warning
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Approval failed');
        setStep('error');
      }
    },
    [writeApprove],
  );

  const placeBet = useCallback(
    async (marketId: number, isYes: boolean, amountUsdc: string) => {
      setError(null);
      setStep('betting');
      try {
        const amount = parseUSDC(amountUsdc);
        await writeBet({
          address: CONTRACT_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'placeBet',
          args: [BigInt(marketId), isYes, amount],
        });
        setStep('success');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Transaction failed');
        setStep('error');
      }
    },
    [writeBet],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
  }, []);

  return {
    step,
    error,
    approveTx,
    betTx,
    approve,
    placeBet,
    reset,
  };
}

/** Hook for claiming winnings */
export function useClaimWinnings() {
  const { writeContractAsync, data: claimTx, isPending } = useWriteContract();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { isSuccess: confirmed } = useWaitForTransactionReceipt({
    hash: claimTx,
    query: { enabled: !!claimTx },
  });

  const claim = useCallback(
    async (marketId: number) => {
      setError(null);
      setSuccess(false);
      try {
        await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'claimWinnings',
          args: [BigInt(marketId)],
        });
        setSuccess(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Claim failed');
      }
    },
    [writeContractAsync],
  );

  return { claim, isPending, success: success || confirmed, error, claimTx };
}

/** Hook for disputing a resolution */
export function useDisputeResolution() {
  const { writeContractAsync, isPending } = useWriteContract();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dispute = useCallback(
    async (marketId: number) => {
      setError(null);
      setSuccess(false);
      try {
        await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'disputeResolution',
          args: [BigInt(marketId)],
        });
        setSuccess(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Dispute failed');
      }
    },
    [writeContractAsync],
  );

  return { dispute, isPending, success, error };
}
