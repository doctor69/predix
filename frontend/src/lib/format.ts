import { formatUnits, parseUnits } from 'viem';
import { formatDistanceToNowStrict, format, isPast } from 'date-fns';
import { USDC_DECIMALS } from './config';

// ─── USDC ─────────────────────────────────────────────────────────────────────

/** Convert on-chain USDC amount (6 decimals) to a display string: "$1,234.56" */
export function formatUSDC(amount: bigint, showSign = true): string {
  const value = parseFloat(formatUnits(amount, USDC_DECIMALS));
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return showSign ? `$${formatted}` : formatted;
}

/** Shorten large USDC amounts: "$1.2M", "$45.6K" */
export function formatUSDCShort(amount: bigint): string {
  const value = parseFloat(formatUnits(amount, USDC_DECIMALS));
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/** Parse a user-entered USDC string ("12.50") to on-chain units (BigInt) */
export function parseUSDC(value: string): bigint {
  try {
    return parseUnits(value, USDC_DECIMALS);
  } catch {
    return 0n;
  }
}

// ─── Time ──────────────────────────────────────────────────────────────────────

/** "in 3 days" / "2 hours ago" */
export function timeFromNow(unixSeconds: bigint): string {
  const date = new Date(Number(unixSeconds) * 1000);
  if (isPast(date)) {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  }
  return `in ${formatDistanceToNowStrict(date)}`;
}

/** "Dec 31, 2025, 11:59 PM" */
export function formatDateTime(unixSeconds: bigint): string {
  const date = new Date(Number(unixSeconds) * 1000);
  return format(date, 'MMM d, yyyy, h:mm a');
}

/** Whether a unix timestamp (in seconds, as bigint) is in the past */
export function isExpired(unixSeconds: bigint): boolean {
  return Date.now() > Number(unixSeconds) * 1000;
}

// ─── Odds ─────────────────────────────────────────────────────────────────────

/** Calculate implied odds from two pool sizes */
export function calcOdds(
  yesPool: bigint,
  noPool: bigint,
): { yesPercent: number; noPercent: number } {
  const total = yesPool + noPool;
  if (total === 0n) return { yesPercent: 50, noPercent: 50 };
  const yes = Number((yesPool * 100n) / total);
  return { yesPercent: yes, noPercent: 100 - yes };
}

/** Estimate payout multiplier for a bet: "2.4x" */
export function estimatePayout(
  betAmount: bigint,
  userPool: bigint,
  opponentPool: bigint,
  feePercent: number,
): number {
  if (betAmount === 0n || userPool === 0n) return 0;
  const totalPool = userPool + opponentPool + betAmount;
  const fee = (totalPool * BigInt(feePercent)) / 100n;
  const afterFee = totalPool - fee;
  const newUserPool = userPool + betAmount;
  const loserPool = afterFee - newUserPool;
  const payout = betAmount + (betAmount * loserPool) / newUserPool;
  return Number(payout) / Number(betAmount);
}

// ─── Address ──────────────────────────────────────────────────────────────────

/** Shorten wallet address: "0x1234…abcd" */
export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
