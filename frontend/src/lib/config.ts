import { polygon, polygonAmoy } from 'wagmi/chains';
import type { Chain } from 'viem';

// ─── Chain config ─────────────────────────────────────────────────────────────

const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? '80002');

export const ACTIVE_CHAIN: Chain =
  chainId === 137 ? polygon : polygonAmoy;

export const IS_MAINNET = chainId === 137;

// ─── Contract addresses ────────────────────────────────────────────────────────

// Set after deploying. Leave blank to show "not deployed" state.
export const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? ''
) as `0x${string}`;

export const CONTRACT_DEPLOYED = CONTRACT_ADDRESS.startsWith('0x') && CONTRACT_ADDRESS.length === 42;

// USDC contract on each network
export const USDC_ADDRESS: `0x${string}` = IS_MAINNET
  ? '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'  // Polygon mainnet native USDC
  : '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'; // Polygon Amoy testnet

// ─── Constants matching the smart contract ────────────────────────────────────

export const MIN_BET_USDC = 1;       // 1 USDC
export const MAX_BET_USDC = 100_000; // 100,000 USDC
export const USDC_DECIMALS = 6;
export const DISPUTE_WINDOW_HOURS = 2;

// Market outcome enum (mirrors Solidity)
export enum Outcome {
  UNRESOLVED = 0,
  YES = 1,
  NO = 2,
  CANCELLED = 3,
}

// Category options for the admin create-market form
export const CATEGORIES = [
  'Crypto',
  'Sports',
  'Politics',
  'Economy',
  'Tech',
  'Entertainment',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number] | 'All';
