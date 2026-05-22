import { useState } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/context/auth';
import { type Market, isMarketOpen } from '@/hooks/useMarkets';
import { useUSDCBalance } from '@/hooks/useUserPositions';
import { usePlaceBet } from '@/hooks/useTrade';
import { calcOdds, formatUSDC, parseUSDC, estimatePayout } from '@/lib/format';
import { MIN_BET_USDC, MAX_BET_USDC } from '@/lib/config';

interface TradePanelProps {
  market: Market;
  onSuccess?: () => void;
}

export function TradePanel({ market, onSuccess }: TradePanelProps) {
  const { authenticated, login } = useAuth();
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [amountStr, setAmountStr] = useState('');

  const { balance, allowance, refetch: refetchBalance } = useUSDCBalance();
  const { step, error, approve, placeBet, reset } = usePlaceBet();

  const open = isMarketOpen(market);
  const { yesPercent, noPercent } = calcOdds(market.yesPool, market.noPool);

  const amount = parseUSDC(amountStr || '0');
  const needsApproval = allowance < amount && amount > 0n;

  const userPool = side === 'yes' ? market.yesPool : market.noPool;
  const opponentPool = side === 'yes' ? market.noPool : market.yesPool;
  const payout = estimatePayout(amount, userPool, opponentPool, 2);
  const potentialReturn = amount > 0n ? formatUSDC(BigInt(Math.floor(Number(amount) * payout))) : null;

  const isLoading = step === 'approving' || step === 'betting';
  const isSuccess = step === 'success';

  async function handleSubmit() {
    if (!authenticated) {
      login();
      return;
    }
    if (!amountStr || parseFloat(amountStr) < MIN_BET_USDC) return;

    if (needsApproval) {
      await approve(amountStr);
    } else {
      await placeBet(market.id, side === 'yes', amountStr);
      onSuccess?.();
    }
  }

  if (isSuccess) {
    return (
      <div className="rounded-xl border border-yes/30 bg-yes-muted p-6 text-center">
        <div className="mb-2 text-2xl">🎉</div>
        <p className="font-semibold text-yes">Bet placed!</p>
        <p className="mt-1 text-sm text-text-secondary">
          You bet ${amountStr} on {side.toUpperCase()}
        </p>
        <button
          onClick={() => { reset(); setAmountStr(''); }}
          className="mt-4 text-sm text-accent hover:underline"
        >
          Place another bet
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card p-6 text-center">
        <p className="text-text-secondary">This market is closed for betting.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <h3 className="mb-4 font-semibold text-text-primary">Place a Bet</h3>

      {/* YES / NO selector */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide('yes')}
          className={clsx(
            'rounded-lg border py-2.5 text-sm font-semibold transition-all',
            side === 'yes'
              ? 'border-yes bg-yes-muted text-yes'
              : 'border-bg-border text-text-secondary hover:border-yes/50 hover:text-yes',
          )}
        >
          YES · {yesPercent}%
        </button>
        <button
          onClick={() => setSide('no')}
          className={clsx(
            'rounded-lg border py-2.5 text-sm font-semibold transition-all',
            side === 'no'
              ? 'border-no bg-no-muted text-no'
              : 'border-bg-border text-text-secondary hover:border-no/50 hover:text-no',
          )}
        >
          NO · {noPercent}%
        </button>
      </div>

      {/* Amount input */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs text-text-secondary">
          Amount (USDC)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">$</span>
          <input
            type="number"
            placeholder="0.00"
            min={MIN_BET_USDC}
            max={MAX_BET_USDC}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full rounded-lg border border-bg-border bg-bg-primary py-2.5 pl-7 pr-3 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent"
          />
        </div>
        {/* Quick-fill buttons */}
        <div className="mt-1.5 flex gap-1">
          {[10, 50, 100, 500].map((v) => (
            <button
              key={v}
              onClick={() => setAmountStr(String(v))}
              className="rounded bg-bg-border px-2 py-0.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              ${v}
            </button>
          ))}
          <button
            onClick={() => {
              const bal = Number(balance) / 1e6;
              if (bal > 0) setAmountStr(Math.min(bal, MAX_BET_USDC).toFixed(2));
            }}
            className="ml-auto rounded bg-bg-border px-2 py-0.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            Max
          </button>
        </div>
      </div>

      {/* Payout estimate */}
      {potentialReturn && (
        <div className="mb-3 rounded-lg bg-bg-primary px-3 py-2 text-xs">
          <div className="flex justify-between text-text-secondary">
            <span>Potential return</span>
            <span
              className={clsx(
                'font-semibold',
                side === 'yes' ? 'text-yes' : 'text-no',
              )}
            >
              ~{potentialReturn}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-text-secondary">
            <span>Balance</span>
            <span className="font-mono">{formatUSDC(balance)}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mb-3 rounded-lg bg-no-muted px-3 py-2 text-xs text-no">
          {error.includes('user rejected') ? 'Transaction cancelled.' : error}
        </p>
      )}

      {/* CTA */}
      <button
        onClick={handleSubmit}
        disabled={isLoading || (authenticated && (!amountStr || parseFloat(amountStr) < MIN_BET_USDC))}
        className={clsx(
          'w-full rounded-lg py-3 text-sm font-bold transition-all disabled:opacity-40',
          !authenticated
            ? 'bg-accent text-white hover:opacity-90'
            : side === 'yes'
            ? 'bg-yes text-black hover:bg-yes-dark'
            : 'bg-no text-white hover:bg-no-dark',
        )}
      >
        {!authenticated
          ? 'Connect to trade'
          : isLoading
          ? step === 'approving'
            ? 'Approving USDC…'
            : 'Placing bet…'
          : needsApproval
          ? 'Approve USDC'
          : `Buy ${side.toUpperCase()}`}
      </button>

      {needsApproval && !isLoading && (
        <p className="mt-2 text-center text-xs text-text-muted">
          One-time approval required before trading
        </p>
      )}
    </div>
  );
}
