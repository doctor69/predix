'use client';

import { ReactNode, useState } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { polygon, polygonAmoy } from 'wagmi/chains';
import { wagmiConfig } from '@/lib/wagmi';
import { ACTIVE_CHAIN } from '@/lib/config';
import { AuthContext, PrivyAuthBridge } from '@/context/auth';

interface Props {
  children: ReactNode;
}

export function Providers({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';

  // No Privy App ID — plain wagmi, stub auth context.
  if (!privyAppId) {
    return (
      <AuthContext.Provider
        value={{ authenticated: false, ready: true, login: () => {}, logout: () => {} }}
      >
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            <SetupBanner />
            {children}
          </WagmiProvider>
        </QueryClientProvider>
      </AuthContext.Provider>
    );
  }

  // Full stack: Privy → QueryClient → Privy-aware Wagmi → AuthBridge
  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'google', 'apple', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#4c82fb',
          logo: '/logo.svg',
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
        defaultChain: ACTIVE_CHAIN,
        supportedChains: [polygon, polygonAmoy],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={wagmiConfig}>
          <PrivyAuthBridge>{children}</PrivyAuthBridge>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

function SetupBanner() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        background: '#1a1d26',
        border: '1px solid #f59e0b44',
        borderRadius: 10,
        padding: '12px 16px',
        maxWidth: 340,
        fontSize: 12,
        color: '#f59e0b',
        lineHeight: 1.5,
      }}
    >
      <strong>Privy App ID missing</strong>
      <br />
      Create a free account at{' '}
      <a href="https://privy.io" target="_blank" rel="noreferrer" style={{ color: '#4c82fb' }}>
        privy.io
      </a>{' '}
      and set{' '}
      <code style={{ background: '#0a0b0f', padding: '1px 4px', borderRadius: 4 }}>
        NEXT_PUBLIC_PRIVY_APP_ID
      </code>{' '}
      in{' '}
      <code style={{ background: '#0a0b0f', padding: '1px 4px', borderRadius: 4 }}>.env.local</code>.
    </div>
  );
}
