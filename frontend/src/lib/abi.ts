// ABI for PredictionMarket.sol — auto-derived from contracts/src/PredictionMarket.sol

export const PREDICTION_MARKET_ABI = [
  // ─── Events ───────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'question', type: 'string', indexed: false },
      { name: 'category', type: 'string', indexed: false },
      { name: 'closingTime', type: 'uint256', indexed: false },
      { name: 'resolutionTime', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BetPlaced',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'outcome', type: 'uint8', indexed: false },
      { name: 'resolvedAt', type: 'uint256', indexed: false },
      { name: 'finalizedAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketDisputed',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'disputer', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'WinningsClaimed',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketCancelled',
    inputs: [{ name: 'marketId', type: 'uint256', indexed: true }],
  },
  {
    type: 'event',
    name: 'FeeCollected',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'feeWallet', type: 'address', indexed: false },
    ],
  },

  // ─── Admin: market management ─────────────────────────────────────────────
  {
    type: 'function',
    name: 'createMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'question', type: 'string' },
      { name: 'category', type: 'string' },
      { name: 'imageUrl', type: 'string' },
      { name: 'resolutionSource', type: 'string' },
      { name: 'closingTime', type: 'uint256' },
      { name: 'resolutionTime', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'resolveMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelMarket',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'overrideResolution',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
    ],
    outputs: [],
  },

  // ─── User: betting ─────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'placeBet',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimWinnings',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'disputeResolution',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
  },

  // ─── Views ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'marketCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getMarket',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'question', type: 'string' },
          { name: 'category', type: 'string' },
          { name: 'imageUrl', type: 'string' },
          { name: 'resolutionSource', type: 'string' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'closingTime', type: 'uint256' },
          { name: 'resolutionTime', type: 'uint256' },
          { name: 'resolvedAt', type: 'uint256' },
          { name: 'finalizedAt', type: 'uint256' },
          { name: 'yesPool', type: 'uint256' },
          { name: 'noPool', type: 'uint256' },
          { name: 'feesCollected', type: 'uint256' },
          { name: 'outcome', type: 'uint8' },
          { name: 'disputed', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getUserPositions',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      { name: 'yesAmount', type: 'uint256' },
      { name: 'noAmount', type: 'uint256' },
      { name: 'claimed', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getMarketOdds',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'yesPercent', type: 'uint256' },
      { name: 'noPercent', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getPayout',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'feePercent',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'admin',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'feeWallet',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },

  // ─── Emergency ─────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'emergencyPause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'emergencyUnpause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

// Minimal ERC20 ABI — just the functions we need for USDC approval
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;
