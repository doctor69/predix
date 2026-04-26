import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '@/context/auth';
import { useAccount } from 'wagmi';
import { Layout } from '@/components/Layout';
import { OddsBar } from '@/components/OddsBar';
import { TradePanel } from '@/components/TradePanel';
import { useMarket, isMarketOpen, isInDisputeWindow, isFinalized } from '@/hooks/useMarkets';
import { useUserPosition, usePotentialPayout } from '@/hooks/useUserPositions';
import { useClaimWinnings, useDisputeResolution } from '@/hooks/useTrade';
import {
  calcOdds,
  formatUSDC,
  formatUSDCShort,
  formatDateTime,
  timeFromNow,
} from '@/lib/format';
import { Outcome } from '@/lib/config';

export default function MarketPage() {
  const router = useRouter();
  const marketId = parseInt(router.query.id as string);
  const { authenticated } = useAuth();
  const { address } = useAccount();

  const { market, isLoading, refetch } = useMarket(marketId);
  const { yesAmount, noAmount, claimed } = useUserPosition(marketId);
  const payout = usePotentialPayout(marketId);
  const { claim, isPending: claiming, success: claimed2, error: claimError } = useClaimWinnings();
  const { dispute, isPending: disputing, success: disputed, error: disputeError } = useDisputeResolution();

  if (isLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-4xl animate-pulse space-y-4">
          <div className="h-8 w-3/4 rounded-lg bg-bg-card" />
          <div className="h-4 w-1/3 rounded bg-bg-card" />
          <div className="h-64 rounded-xl bg-bg-card" />
        </div>
      </Layout>
    );
  }

  if (!market) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <p className="text-4xl">❓</p>
          <p className="mt-3 font-semibold text-white">Market not found</p>
          <Link href="/" className="mt-4 inline-block text-sm text-accent hover:underline">
            ← Back to markets
          </Link>
        </div>
      </Layout>
    );
  }

  const { yesPercent, noPercent } = calcOdds(market.yesPool, market.noPool);
  const totalVolume = market.yesPool + market.noPool;
  const open = isMarketOpen(market);
  const inDisputeWindow = isInDisputeWindow(market);
  const finalized = isFinalized(market);
  const hasPosition = yesAmount > 0n || noAmount > 0n;

  const userWon =
    finalized &&
    ((market.outcome === Outcome.YES && yesAmount > 0n) ||
      (market.outcome === Outcome.NO && noAmount > 0n));

  const canClaim = finalized && hasPosition && !claimed && !claimed2;
  const canDispute = inDisputeWindow && hasPosition && !market.disputed && !disputed;

  return (
    <Layout>
      <Head>
        <title>{market.question} — Predix</title>
      </Head>

      <div className="mx-auto max-w-4xl">
        {/* Breadcrumb */}
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-white"
        >
          ← Markets
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-bg-card px-2 py-0.5 text-xs text-text-secondary">
              {market.category || 'General'}
            </span>
            <OutcomeBadge outcome={market.outcome} open={open} />
          </div>
          <h1 className="text-xl font-bold leading-snug text-white sm:text-2xl">
            {market.question}
          </h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left — market info + odds */}
          <div className="space-y-4 lg:col-span-2">
            {/* Odds card */}
            <div className="rounded-xl border border-bg-border bg-bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Current Odds</span>
                <span className="text-xs text-text-secondary">
                  Vol: <span className="text-text-primary">{formatUSDCShort(totalVolume)}</span>
                </span>
              </div>
              <OddsBar yesPercent={yesPercent} noPercent={noPercent} size="lg" />

              <div className="mt-4 grid grid-cols-2 gap-3">
                <PoolStat label="YES Pool" value={formatUSDC(market.yesPool)} color="yes" />
                <PoolStat label="NO Pool" value={formatUSDC(market.noPool)} color="no" />
              </div>
            </div>

            {/* Market details */}
            <div className="rounded-xl border border-bg-border bg-bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-white">Market Details</h3>
              <dl className="space-y-2 text-sm">
                <DetailRow
                  label="Resolution source"
                  value={market.resolutionSource}
                />
                <DetailRow
                  label="Betting closes"
                  value={`${formatDateTime(market.closingTime)} (${timeFromNow(market.closingTime)})`}
                />
                <DetailRow
                  label="Resolves after"
                  value={`${formatDateTime(market.resolutionTime)} (${timeFromNow(market.resolutionTime)})`}
                />
                {market.resolvedAt > 0n && (
                  <DetailRow
                    label="Resolved at"
                    value={formatDateTime(market.resolvedAt)}
                  />
                )}
                {market.finalizedAt > 0n && (
                  <DetailRow
                    label="Payouts unlock"
                    value={`${formatDateTime(market.finalizedAt)} (${timeFromNow(market.finalizedAt)})`}
                  />
                )}
                {market.feesCollected > 0n && (
                  <DetailRow
                    label="Platform fee"
                    value={formatUSDC(market.feesCollected)}
                  />
                )}
                <DetailRow label="Market ID" value={`#${market.id}`} />
              </dl>
            </div>

            {/* Disputed notice */}
            {market.disputed && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
                <p className="text-sm font-semibold text-yellow-400">⚠️ Resolution Disputed</p>
                <p className="mt-1 text-xs text-text-secondary">
                  A participant has disputed this resolution. The platform owner is reviewing.
                  If the resolution is incorrect it will be overridden before the dispute window closes.
                </p>
              </div>
            )}

            {/* User position card */}
            {authenticated && address && hasPosition && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
                <h3 className="mb-3 text-sm font-semibold text-white">Your Position</h3>
                <div className="space-y-2 text-sm">
                  {yesAmount > 0n && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">YES bet</span>
                      <span className="font-semibold text-yes">{formatUSDC(yesAmount)}</span>
                    </div>
                  )}
                  {noAmount > 0n && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">NO bet</span>
                      <span className="font-semibold text-no">{formatUSDC(noAmount)}</span>
                    </div>
                  )}
                  {finalized && payout > 0n && (
                    <div className="flex justify-between border-t border-bg-border pt-2">
                      <span className="text-text-secondary">
                        {userWon ? 'Winnings' : 'Claimable'}
                      </span>
                      <span className={clsx('font-bold', userWon ? 'text-yes' : 'text-text-primary')}>
                        {formatUSDC(payout)}
                      </span>
                    </div>
                  )}
                  {(claimed || claimed2) && (
                    <p className="text-xs text-yes">✓ Winnings claimed</p>
                  )}
                </div>

                {/* Claim / Dispute buttons */}
                <div className="mt-4 space-y-2">
                  {canClaim && (
                    <button
                      onClick={() => claim(market.id)}
                      disabled={claiming}
                      className="w-full rounded-lg bg-yes py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {claiming ? 'Claiming…' : `Claim ${formatUSDC(payout)}`}
                    </button>
                  )}
                  {claimError && (
                    <p className="text-xs text-no">{claimError}</p>
                  )}

                  {canDispute && (
                    <button
                      onClick={() => dispute(market.id)}
                      disabled={disputing}
                      className="w-full rounded-lg border border-yellow-500/40 py-2 text-sm font-medium text-yellow-400 transition-colors hover:bg-yellow-500/10 disabled:opacity-50"
                    >
                      {disputing ? 'Submitting…' : 'Dispute this resolution'}
                    </button>
                  )}
                  {disputeError && (
                    <p className="text-xs text-no">{disputeError}</p>
                  )}
                  {disputed && (
                    <p className="text-xs text-yellow-400">✓ Dispute submitted</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right — trade panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-20">
              <TradePanel market={market} onSuccess={refetch} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome, open }: { outcome: Outcome; open: boolean }) {
  if (outcome === Outcome.CANCELLED)
    return <span className="rounded bg-bg-border px-2 py-0.5 text-xs text-text-secondary">Cancelled</span>;
  if (outcome === Outcome.YES)
    return <span className="rounded bg-yes-muted px-2 py-0.5 text-xs font-semibold text-yes">Resolved YES</span>;
  if (outcome === Outcome.NO)
    return <span className="rounded bg-no-muted px-2 py-0.5 text-xs font-semibold text-no">Resolved NO</span>;
  if (!open)
    return <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-400">Closed</span>;
  return <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">Live</span>;
}

function PoolStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'yes' | 'no';
}) {
  return (
    <div className={clsx('rounded-lg p-3', color === 'yes' ? 'bg-yes-muted' : 'bg-no-muted')}>
      <p className={clsx('text-xs', color === 'yes' ? 'text-yes' : 'text-no')}>{label}</p>
      <p className="mt-0.5 font-bold text-white">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="text-right text-text-primary">{value}</dd>
    </div>
  );
}
