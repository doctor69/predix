import { createConfig, http } from 'wagmi';
import { polygon, polygonAmoy } from 'wagmi/chains';
import { defineChain } from 'viem';

// Polygon Amoy requires a minimum priority fee of 25 gwei —
// override the default so viem doesn't underestimate it.
const polygonAmoyFixed = defineChain({
  ...polygonAmoy,
  fees: {
    defaultPriorityFee: BigInt(30_000_000_000), // 30 gwei (above 25 gwei minimum)
  },
});

export const wagmiConfig = createConfig({
  chains: [polygon, polygonAmoyFixed],
  transports: {
    [polygon.id]: http(
      process.env.NEXT_PUBLIC_POLYGON_RPC || undefined,
    ),
    [polygonAmoy.id]: http(
      process.env.NEXT_PUBLIC_AMOY_RPC || undefined,
    ),
  },
  ssr: true,
});
