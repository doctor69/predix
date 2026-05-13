import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en" className="dark">
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#0a0b0f" />
        <meta
          name="description"
          content="Zero-custody prediction markets. Trade YES/NO on real-world events. All funds held by smart contract."
        />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Predix" />
        <meta property="og:url" content="https://predix.vip" />
        <meta property="og:title" content="Predix — Prediction Markets" />
        <meta property="og:description" content="Zero-custody prediction markets. Trade YES/NO on real-world events. All funds held by smart contract." />
        <meta property="og:image" content="https://predix.vip/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter / X card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Predix — Prediction Markets" />
        <meta name="twitter:description" content="Zero-custody prediction markets. Trade YES/NO on real-world events." />
        <meta name="twitter:image" content="https://predix.vip/og-image.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
