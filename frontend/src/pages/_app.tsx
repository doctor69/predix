import type { AppProps } from 'next/app';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import '@/styles/globals.css';

// Privy + Wagmi providers crash during SSR — load them client-side only.
const Providers = dynamic(
  () => import('@/context/providers').then((m) => m.Providers),
  { ssr: false },
);

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Predix — Prediction Markets</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Providers>
        <Component {...pageProps} />
      </Providers>
    </>
  );
}
