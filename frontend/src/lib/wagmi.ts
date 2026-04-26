import { createConfig, http } from 'wagmi';
import { polygon, polygonAmoy } from 'wagmi/chains';

export const wagmiConfig = createConfig({
  chains: [polygon, polygonAmoy],
  transports: {
    [polygon.id]: http(
      process.env.NEXT_PUBLIC_POLYGON_RPC || undefined,
    ),
    [polygonAmoy.id]: http(
      process.env.NEXT_PUBLIC_AMOY_RPC || undefined,
    ),
  },
  // SSR: disable auto-connect on server to prevent hydration mismatches
  ssr: true,
});
