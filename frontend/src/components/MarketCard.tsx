import Link from 'next/link';
import clsx from 'clsx';
import { OddsBar } from './OddsBar';
import { type Market, isMarketOpen } from '@/hooks/useMarkets';
import { calcOdds, formatUSDCShort, timeFromNow } from '@/lib/format';
import { Outcome } from '@/lib/config';

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const { yesPercent, noPercent } = calcOdds(market.yesPool, market.noPool);
  const totalVolume = market.yesPool + market.noPool;
  const open = isMarketOpen(market);

  const statusBadge = () => {
    if (market.outcome === Outcome.CANCELLED)
      return <Badge color="gray">Cancelled</Badge>;
    if (market.outcome === Outcome.YES)
      return <Badge color="green">Resolved YES</Badge>;
    if (market.outcome === Outcome.NO)
      return <Badge color="red">Resolved NO</Badge>;
    if (!open) return <Badge color="yellow">Closed</Badge>;
    return <Badge color="blue">Live</Badge>;
  };

  return (
    <Link href={`/market/${market.id}`}>
      <div className="group flex h-full cursor-pointer flex-col rounded-xl border border-bg-border bg-bg-card p-4 transition-all duration-200 hover:border-accent/30 hover:bg-bg-hover">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="rounded bg-bg-border px-2 py-0.5 text-xs text-text-secondary">
            {market.category || 'General'}
          </span>
          {statusBadge()}
        </div>

        {/* Question */}
        <p className="mb-4 flex-1 text-sm font-medium leading-snug text-text-primary line-clamp-3 group-hover:text-white">
          {market.question}
        </p>

        {/* Odds bar */}
        <div className="mb-3">
          <OddsBar yesPercent={yesPercent} noPercent={noPercent} size="sm" />
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>
            Vol:{' '}
            <span className="text-text-secondary">{formatUSDCShort(totalVolume)}</span>
          </span>
          <span>
            {open
              ? `Closes ${timeFromNow(market.closingTime)}`
              : market.outcome === Outcome.UNRESOLVED
              ? `Resolves ${timeFromNow(market.resolutionTime)}`
              : `Resolved ${timeFromNow(market.resolvedAt)}`}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Small helper ─────────────────────────────────────────────────────────────

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
        'whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium',
        styles[color],
      )}
    >
      {children}
    </span>
  );
}
