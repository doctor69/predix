/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'ipfs.io' },
    ],
  },
  webpack: (config) => {
    // Node builtins not available in browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Silence warnings for optional native modules pulled in by wallet SDKs
    // that aren't needed in a browser context.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
      '@farcaster/mini-app-solana': false,
      '@solana-program/memo': false,
      '@solana-program/system': false,
      '@solana-program/token': false,
      '@solana/kit': false,
    };

    return config;
  },
};

module.exports = nextConfig;
