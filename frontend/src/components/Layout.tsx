import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import clsx from 'clsx';
import { shortAddress } from '@/lib/format';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/context/auth';
import { ACTIVE_CHAIN } from '@/lib/config';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { login, logout, authenticated, ready } = useAuth();
  const { address, isConnected } = useAccount();
  const { isAdmin } = useIsAdmin();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== ACTIVE_CHAIN.id;

  const navLinks = [
    { href: '/', label: 'Markets' },
    { href: '/portfolio', label: 'Portfolio' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Wrong network banner */}
      {isWrongNetwork && (
        <div className="flex items-center justify-center gap-3 bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2 text-sm text-yellow-400">
          <span>Wrong network — please switch to {ACTIVE_CHAIN.name}</span>
          <button
            onClick={() => switchChain({ chainId: ACTIVE_CHAIN.id })}
            className="rounded bg-yellow-500/20 px-3 py-1 text-xs font-semibold text-yellow-300 hover:bg-yellow-500/30 transition-colors"
          >
            Switch Network
          </button>
        </div>
      )}

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-bg-border bg-bg-primary/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-white">
              PREDIX
            </span>
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs font-semibold text-accent">
              BETA
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  router.pathname === href
                    ? 'bg-bg-hover text-white'
                    : 'text-text-secondary hover:text-white',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Connect wallet */}
          <div className="flex items-center gap-3">
            {!ready ? (
              <div className="h-9 w-28 animate-pulse rounded-lg bg-bg-card" />
            ) : authenticated ? (
              <div className="flex items-center gap-2">
                <span className="hidden rounded-lg bg-bg-card px-3 py-1.5 text-sm font-mono text-text-secondary sm:block">
                  {address ? shortAddress(address) : 'Connected'}
                </span>
                <button
                  onClick={logout}
                  className="rounded-lg border border-bg-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-text-muted hover:text-white"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      {/* Footer */}
      <footer className="mt-20 border-t border-bg-border py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-text-muted">
          <p>
            Predix — Zero-custody prediction markets on Polygon.{' '}
            <span className="text-text-secondary">All funds held by smart contract.</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
