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
      <div className="group card-elevated flex h-full cursor-pointer flex-col rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.01]">
        {/* Image banner */}
        <div className="relative h-36 overflow-hidden flex-shrink-0">
          {market.imageUrl ? (
            <img
              src={market.imageUrl}
              alt={market.question}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-accent/30 to-accent/10" />
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          {/* Badges */}
          <div className="absolute bottom-2 left-3 right-3 flex justify-between items-end">
            <span className="bg-white/20 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
              {market.category || 'General'}
            </span>
            {statusBadge()}
          </div>
        </div>

        {/* Content section */}
        <div className="p-4 flex flex-col flex-1 bg-bg-card">
          {/* Question */}
          <p className="mb-3 flex-1 text-sm font-semibold leading-snug text-text-primary line-clamp-2 group-hover:text-accent transition-colors">
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
              <span className="text-text-secondary font-medium">{formatUSDCShort(totalVolume)}</span>
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
    gray:   'bg-white/20 backdrop-blur-sm text-white',
    green:  'bg-yes/30  backdrop-blur-sm text-white',
    red:    'bg-no/30   backdrop-blur-sm text-white',
    blue:   'bg-white/20 backdrop-blur-sm text-white',
    yellow: 'bg-yellow-500/30 backdrop-blur-sm text-white',
  };

  return (
    <span
      className={clsx(
        'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        styles[color],
      )}
    >
      {children}
    </span>
  );
}
