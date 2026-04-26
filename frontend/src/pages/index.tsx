import { useState, useMemo } from 'react';
import Head from 'next/head';
import { Layout } from '@/components/Layout';
import { MarketCard } from '@/components/MarketCard';
import { CategoryTabs } from '@/components/CategoryTabs';
import { useMarkets } from '@/hooks/useMarkets';
import { CONTRACT_DEPLOYED } from '@/lib/config';
import type { Category } from '@/lib/config';
import { Outcome } from '@/lib/config';

export default function HomePage() {
  const [category, setCategory] = useState<Category>('All');
  const [showResolved, setShowResolved] = useState(false);
  const { markets, isLoading } = useMarkets();

  const filtered = useMemo(() => {
    return markets.filter((m) => {
      if (category !== 'All' && m.category !== category) return false;
      if (!showResolved && m.outcome !== Outcome.UNRESOLVED) return false;
      return true;
    });
  }, [markets, category, showResolved]);

  return (
    <Layout>
      <Head>
        <title>Predix — Prediction Markets</title>
      </Head>

      {/* Hero */}
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Predict the future.{' '}
          <span className="bg-gradient-to-r from-accent to-yes bg-clip-text text-transparent">
            Get paid if you're right.
          </span>
        </h1>
        <p className="text-text-secondary">
          Trade YES/NO on real-world events. Zero custody — your USDC held by smart contract.
        </p>
      </div>

      {/* Contract not deployed notice */}
      {!CONTRACT_DEPLOYED && (
        <div className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-center text-sm">
          <p className="font-semibold text-yellow-400">Contract not yet deployed</p>
          <p className="mt-1 text-text-secondary">
            Set <code className="rounded bg-bg-card px-1">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in{' '}
            <code className="rounded bg-bg-card px-1">.env.local</code> after deploying to Polygon.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <CategoryTabs selected={category} onChange={setCategory} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded accent-accent"
          />
          Show resolved
        </label>
      </div>

      {/* Market grid */}
      {isLoading ? (
        <MarketSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState category={category} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </Layout>
  );
}

function MarketSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-xl border border-bg-border bg-bg-card"
        />
      ))}
    </div>
  );
}

function EmptyState({ category }: { category: Category }) {
  return (
    <div className="py-20 text-center">
      <p className="text-4xl">📊</p>
      <p className="mt-3 font-semibold text-white">No markets yet</p>
      <p className="mt-1 text-sm text-text-secondary">
        {category !== 'All'
          ? `No ${category} markets are live right now.`
          : 'Check back soon — new markets are added regularly.'}
      </p>
    </div>
  );
}
