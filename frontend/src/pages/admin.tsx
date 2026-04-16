import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '@/context/auth';
import { Layout } from '@/components/Layout';
import { useMarkets } from '@/hooks/useMarkets';
import { useIsAdmin, useCreateMarket, useResolveMarket, useCancelMarket } from '@/hooks/useAdmin';
import { CATEGORIES, Outcome } from '@/lib/config';
import { formatUSDCShort, formatDateTime } from '@/lib/format';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateForm {
  question: string;
  category: string;
  imageUrl: string;
  resolutionSource: string;
  closingTime: string;   // datetime-local string
  resolutionTime: string;
}

const EMPTY_FORM: CreateForm = {
  question: '',
  category: 'Crypto',
  imageUrl: '',
  resolutionSource: '',
  closingTime: '',
  resolutionTime: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { authenticated, login } = useAuth();
  const { isAdmin, adminAddress } = useIsAdmin();
  const { markets, isLoading: marketsLoading } = useMarkets();

  const unresolvedMarkets = markets.filter((m) => m.outcome === Outcome.UNRESOLVED);

  if (!authenticated) {
    return (
      <Layout>
        <Head><title>Admin — Predix</title></Head>
        <div className="py-20 text-center">
          <p className="text-4xl">🔐</p>
          <p className="mt-3 font-semibold text-white">Admin access required</p>
          <button
            onClick={login}
            className="mt-5 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Connect Wallet
          </button>
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <Head><title>Admin — Predix</title></Head>
        <div className="py-20 text-center">
          <p className="text-4xl">🚫</p>
          <p className="mt-3 font-semibold text-white">Not authorized</p>
          <p className="mt-1 text-sm text-text-secondary">
            Connected wallet is not the admin.
          </p>
          {adminAddress && (
            <p className="mt-2 text-xs font-mono text-text-muted">
              Admin: {adminAddress}
            </p>
          )}
          <Link href="/" className="mt-5 inline-block text-sm text-accent hover:underline">
            ← Back to markets
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Head><title>Admin — Predix</title></Head>

      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          <span className="rounded-lg bg-yes-muted px-3 py-1 text-xs font-semibold text-yes">
            ✓ Admin Connected
          </span>
        </div>

        {/* Create market */}
        <CreateMarketForm />

        {/* Resolve / cancel markets */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Pending Markets
            <span className="ml-2 rounded bg-bg-card px-2 py-0.5 text-sm font-normal text-text-secondary">
              {unresolvedMarkets.length}
            </span>
          </h2>

          {marketsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-bg-card" />
              ))}
            </div>
          ) : unresolvedMarkets.length === 0 ? (
            <p className="text-sm text-text-secondary">No pending markets.</p>
          ) : (
            <div className="space-y-3">
              {unresolvedMarkets.map((market) => (
                <PendingMarketRow key={market.id} marketId={market.id} market={market} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

// ─── Create Market Form ───────────────────────────────────────────────────────

function CreateMarketForm() {
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const { createMarket, isPending, success, error } = useCreateMarket();

  function set(field: keyof CreateForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.question || !form.resolutionSource || !form.closingTime || !form.resolutionTime) return;

    const closingTimestamp = Math.floor(new Date(form.closingTime).getTime() / 1000);
    const resolutionTimestamp = Math.floor(new Date(form.resolutionTime).getTime() / 1000);

    await createMarket({
      question: form.question,
      category: form.category,
      imageUrl: form.imageUrl,
      resolutionSource: form.resolutionSource,
      closingTime: closingTimestamp,
      resolutionTime: resolutionTimestamp,
    });

    if (!error) setForm(EMPTY_FORM);
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <h2 className="mb-4 text-lg font-semibold text-white">Create Market</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Question *">
          <input
            type="text"
            placeholder="Will BTC hit $200K before Dec 2026?"
            value={form.question}
            onChange={(e) => set('question', e.target.value)}
            required
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Image URL (optional)">
            <input
              type="url"
              placeholder="https://..."
              value={form.imageUrl}
              onChange={(e) => set('imageUrl', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Resolution Source *">
          <input
            type="text"
            placeholder="CoinGecko BTC/USD price at 00:00 UTC Jan 1, 2027"
            value={form.resolutionSource}
            onChange={(e) => set('resolutionSource', e.target.value)}
            required
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Betting Closes *">
            <input
              type="datetime-local"
              value={form.closingTime}
              onChange={(e) => set('closingTime', e.target.value)}
              required
              className={inputClass}
            />
          </Field>

          <Field label="Resolution Time *">
            <input
              type="datetime-local"
              value={form.resolutionTime}
              onChange={(e) => set('resolutionTime', e.target.value)}
              required
              className={inputClass}
            />
          </Field>
        </div>

        {error && (
          <p className="rounded-lg bg-no-muted px-3 py-2 text-xs text-no">
            {error.includes('user rejected') ? 'Transaction cancelled.' : error}
          </p>
        )}

        {success && (
          <p className="rounded-lg bg-yes-muted px-3 py-2 text-xs text-yes">
            ✓ Market created on-chain!
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create Market'}
        </button>
      </form>
    </div>
  );
}

// ─── Pending Market Row ───────────────────────────────────────────────────────

function PendingMarketRow({
  marketId,
  market,
}: {
  marketId: number;
  market: {
    question: string;
    category: string;
    yesPool: bigint;
    noPool: bigint;
    closingTime: bigint;
    resolutionTime: bigint;
    outcome: Outcome;
  };
}) {
  const { resolveMarket, isPending: resolving, success: resolved, error: resolveError } = useResolveMarket();
  const { cancelMarket, isPending: cancelling, success: cancelled, error: cancelError } = useCancelMarket();

  const totalVolume = market.yesPool + market.noPool;
  const canResolve = Date.now() >= Number(market.resolutionTime) * 1000;

  if (resolved || cancelled) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card px-4 py-3 text-sm text-text-secondary">
        {resolved ? '✓ Market resolved' : '✓ Market cancelled'} — #{marketId}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/market/${marketId}`}
            className="text-sm font-medium text-text-primary hover:text-white"
          >
            #{marketId}: {market.question}
          </Link>
          <p className="mt-0.5 text-xs text-text-muted">
            Vol: {formatUSDCShort(totalVolume)} ·{' '}
            {canResolve ? (
              <span className="text-yes">Ready to resolve</span>
            ) : (
              <span>Resolves {formatDateTime(market.resolutionTime)}</span>
            )}
          </p>
        </div>
      </div>

      {(resolveError || cancelError) && (
        <p className="mb-2 text-xs text-no">
          {(resolveError || cancelError)?.includes('user rejected')
            ? 'Transaction cancelled.'
            : resolveError || cancelError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => resolveMarket(marketId, true)}
          disabled={resolving || cancelling || !canResolve}
          className={clsx(
            'rounded-lg px-4 py-1.5 text-xs font-bold transition-all',
            canResolve
              ? 'bg-yes text-black hover:opacity-90 disabled:opacity-50'
              : 'cursor-not-allowed bg-bg-border text-text-muted',
          )}
          title={!canResolve ? `Resolution opens ${formatDateTime(market.resolutionTime)}` : undefined}
        >
          {resolving ? 'Resolving…' : 'Resolve YES'}
        </button>
        <button
          onClick={() => resolveMarket(marketId, false)}
          disabled={resolving || cancelling || !canResolve}
          className={clsx(
            'rounded-lg px-4 py-1.5 text-xs font-bold transition-all',
            canResolve
              ? 'bg-no text-white hover:opacity-90 disabled:opacity-50'
              : 'cursor-not-allowed bg-bg-border text-text-muted',
          )}
        >
          {resolving ? 'Resolving…' : 'Resolve NO'}
        </button>
        <button
          onClick={() => cancelMarket(marketId)}
          disabled={resolving || cancelling}
          className="ml-auto rounded-lg border border-bg-border px-3 py-1.5 text-xs text-text-secondary hover:border-text-muted hover:text-white disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-bg-border bg-bg-primary px-3 py-2 text-sm text-white placeholder-text-muted outline-none transition-colors focus:border-accent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-text-secondary">{label}</label>
      {children}
    </div>
  );
}
