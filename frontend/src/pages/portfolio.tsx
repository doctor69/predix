import { useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '@/context/auth';
import { useAccount } from 'wagmi';
import { Layout } from '@/components/Layout';
import { OddsBar } from '@/components/OddsBar';
import { useMarkets, isFinalized } from '@/hooks/useMarkets';
import { useUserPositions, useUSDCBalance } from '@/hooks/useUserPositions';
import { useClaimWinnings } from '@/hooks/useTrade';
import { calcOdds, formatUSDC, timeFromNow } from '@/lib/format';
import { Outcome } from '@/lib/config';

export default function PortfolioPage() {
  const { authenticated, login } = useAuth();
  const { address } = useAccount();
  const { markets, isLoading: marketsLoading } = useMarkets();
  const { balance } = useUSDCBalance();

  const marketIds = useMemo(() => markets.map((m) => m.id), [markets]);
  const { positions, isLoading: positionsLoading } = useUserPositions(marketIds);
  const { claim, isPending: claiming } = useClaimWinnings();

  const isLoading = marketsLoading || positionsLoading;

  // Enrich positions with market data
  const enriched = useMemo(() => {
    return positions
      .map((pos) => {
        const market = markets.find((m) => m.id === pos.marketId);
        if (!market) return null;
        return { ...pos, market };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => {
        // Claimable first, then open, then settled
        const aClaimable = isFinalized(a.market) && !a.claimed;
        const bClaimable = isFinalized(b.market) && !b.claimed;
        if (aClaimable && !bClaimable) return -1;
        if (!aClaimable && bClaimable) return 1;
        return Number(b.market.closingTime - a.market.closingTime);
      });
  }, [positions, markets]);

  // Summary stats
  const stats = useMemo(() => {
    let totalBet = 0n;
    for (const p of enriched) {
      totalBet += p.yesAmount + p.noAmount;
    }
    return { totalBet, openPositions: enriched.length };
  }, [enriched]);

  if (!authenticated) {
    return (
      <Layout>
        <Head>
          <title>Portfolio — Predix</title>
        </Head>
        <div className="py-20 text-center">
          <p className="text-4xl">👛</p>
          <p className="mt-3 text-lg font-semibold text-white">Connect to view your portfolio</p>
          <p className="mt-1 text-sm text-text-secondary">
            Track your positions, P&L, and claim winnings.
          </p>
          <button
            onClick={login}
            className="mt-6 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Connect Wallet
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Head>
        <title>Portfolio — Predix</title>
      </Head>

      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-bold text-white">Portfolio</h1>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatCard label="USDC Balance" value={formatUSDC(balance)} />
          <StatCard label="Open Positions" value={String(stats.openPositions)} />
          <StatCard label="Total Wagered" value={formatUSDC(stats.totalBet)} />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-bg-card" />
            ))}
          </div>
        ) : enriched.length === 0 ? (
          <EmptyPortfolio />
        ) : (
          <div className="space-y-3">
            {enriched.map(({ market, yesAmount, noAmount, claimed }) => {
              const { yesPercent, noPercent } = calcOdds(market.yesPool, market.noPool);
              const finalized = isFinalized(market);
              const userYes = yesAmount > 0n;
              const userNo = noAmount > 0n;
              const userWon =
                finalized &&
                ((market.outcome === Outcome.YES && userYes) ||
                  (market.outcome === Outcome.NO && userNo));
              const userLost =
                finalized &&
                ((market.outcome === Outcome.YES && !userYes && noAmount > 0n) ||
                  (market.outcome === Outcome.NO && !userNo && yesAmount > 0n));
              const canClaim = finalized && !claimed && userWon;
              const canRefund = market.outcome === Outcome.CANCELLED && !claimed;

              return (
                <div
                  key={market.id}
                  className={clsx(
                    'rounded-xl border bg-bg-card p-4 transition-colors',
                    canClaim
                      ? 'border-yes/40'
                      : userLost
                      ? 'border-no/20'
                      : 'border-bg-border',
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <Link
                      href={`/market/${market.id}`}
                      className="text-sm font-medium leading-snug text-text-primary hover:text-white"
                    >
                      {market.question}
                    </Link>
                    <PositionBadge
                      outcome={market.outcome}
                      claimed={claimed}
                      userWon={userWon}
                      userLost={userLost}
                    />
                  </div>

                  <div className="mb-3">
                    <OddsBar yesPercent={yesPercent} noPercent={noPercent} size="sm" />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-4 text-xs">
                      {userYes && (
                        <span>
                          YES{' '}
                          <span className="font-semibold text-yes">{formatUSDC(yesAmount)}</span>
                        </span>
                      )}
                      {userNo && (
                        <span>
                          NO{' '}
                          <span className="font-semibold text-no">{formatUSDC(noAmount)}</span>
                        </span>
                      )}
                      <span className="text-text-muted">
                        {market.outcome === Outcome.UNRESOLVED
                          ? `Closes ${timeFromNow(market.closingTime)}`
                          : market.outcome === Outcome.CANCELLED
                          ? 'Cancelled — refund available'
                          : `Resolved ${timeFromNow(market.resolvedAt)}`}
                      </span>
                    </div>

                    {canClaim && (
                      <button
                        onClick={() => claim(market.id)}
                        disabled={claiming}
                        className="rounded-lg bg-yes px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50"
                      >
                        {claiming ? 'Claiming…' : 'Claim Winnings'}
                      </button>
                    )}

                    {canRefund && (
                      <button
                        onClick={() => claim(market.id)}
                        disabled={claiming}
                        className="rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {claiming ? 'Claiming…' : 'Claim Refund'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function PositionBadge({
  outcome,
  claimed,
  userWon,
  userLost,
}: {
  outcome: Outcome;
  claimed: boolean;
  userWon: boolean;
  userLost: boolean;
}) {
  if (claimed) return <Badge color="gray">Claimed</Badge>;
  if (outcome === Outcome.CANCELLED) return <Badge color="blue">Refundable</Badge>;
  if (userWon) return <Badge color="green">Won</Badge>;
  if (userLost) return <Badge color="red">Lost</Badge>;
  if (outcome === Outcome.UNRESOLVED) return <Badge color="blue">Open</Badge>;
  return <Badge color="yellow">Pending</Badge>;
}

function Badge({
  color,
  children,
}: {
  color: 'gray' | 'green' | 'red' | 'blue' | 'yellow';
  children: React.ReactNode;
}) {
  const styles = {
    gray: 'bg-bg-border text-text-secondary',
    green: 'bg-yes-muted text-yes',
    red: 'bg-no-muted text-no',
    blue: 'bg-accent/10 text-accent',
    yellow: 'bg-yellow-500/10 text-yellow-400',
  };
  return (
    <span
      className={clsx(
        'shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium',
        styles[color],
      )}
    >
      {children}
    </span>
  );
}

function EmptyPortfolio() {
  return (
    <div className="py-16 text-center">
      <p className="text-4xl">📭</p>
      <p className="mt-3 font-semibold text-white">No positions yet</p>
      <p className="mt-1 text-sm text-text-secondary">
        Browse markets and place your first bet.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Browse Markets
      </Link>
    </div>
  );
}
