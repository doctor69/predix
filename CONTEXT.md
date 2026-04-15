# PREDIX — PROJECT CONTEXT
# Paste this entire file at the start of a new Claude conversation to resume.

## What We're Building
A zero-custody crypto prediction market — direct competitor to Kalshi and Polymarket.
Users trade YES/NO contracts on real-world events using USDC on Polygon.
The smart contract holds ALL funds. The platform never touches user money.

## Business Model
- 2% platform fee auto-sent to our feeWallet on every market resolution
- Fee is hardcoded in the smart contract — passive, automatic, unstoppable
- Admin creates markets and resolves YES/NO after events happen
- Users connect wallet, deposit USDC, buy YES or NO, claim winnings

## Architecture Decision Log
- NO ZeroHash — we skip BTC/LTC conversion complexity
- NO fake/play money — real USDC on Polygon mainnet
- YES Privy for auth — email/Google/Apple/MetaMask all supported, free up to 500 MAU
- YES smart contract for custody — zero trust, zero liability for us
- YES hybrid model — contract holds money, regular web app handles UI/API
- Polygon chosen over Base — battle-tested by Polymarket, native USDC support
- Admin resolution (not oracle) for v1 — simpler, upgrade to Chainlink later
- 4 separate wallet roles for maximum security (see below)

## Security Architecture
Four wallets, all DIFFERENT addresses, all enforced at deploy time:

  OWNER        Gnosis Safe multisig. Change roles, update fee, emergency unpause.
               Worst case if hacked. MUST be a multisig (2-of-3 minimum).

  ADMIN        Hot wallet. Creates markets, resolves YES/NO daily.
               If hacked: attacker can resolve markets wrong. Cannot steal funds.

  FEE_WALLET   Receives 2% fee on every resolution. Separate hot wallet.
               If hacked: attacker receives future fees only. All user funds safe.

  EMERGENCY    Can pause contract instantly. Nothing else.
               Give to security partner or keep as owner for v1.

Additional protections built into contract:
  - 2-hour dispute window before any payout unlocks
  - 2-step ownership transfer (prevents accidental transfers)
  - Fee hardcapped at 5% FOREVER in contract code (cannot exceed)
  - ReentrancyGuard on all fund-moving functions
  - SafeERC20 for all USDC transfers
  - Emergency pause by emergencyRole
  - Admin override of wrong resolutions during dispute window
  - Full event log for on-chain audit trail
  - Market cancellation with full refunds (no fee on cancelled markets)

## Smart Contract — PredictionMarket.sol
Location: contracts/src/PredictionMarket.sol
Language: Solidity 0.8.24
Framework: Hardhat 2.x (CJS — NOT ESM)
Dependencies: OpenZeppelin 5.x (ReentrancyGuard, Pausable, SafeERC20)

Key functions:
  createMarket(question, category, imageUrl, resolutionSource, closingTime, resolutionTime)
  placeBet(marketId, isYes, amount)       — users call this
  resolveMarket(marketId, isYes)          — admin only, starts 2h dispute window
  claimWinnings(marketId)                 — winners call after dispute window
  cancelMarket(marketId)                  — admin only, triggers full refunds
  disputeResolution(marketId)             — users flag wrong resolution
  overrideResolution(marketId, isYes)     — owner only, during dispute window

Payout formula:
  totalPool = yesPool + noPool
  fee = totalPool * 2%  → sent to feeWallet immediately on resolve
  afterFee = totalPool - fee
  winnerPayout = userStake + (userStake / winnerPool) * loserPool

USDC addresses:
  Polygon mainnet:  0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
  Polygon Amoy testnet: 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582

## Project File Structure
```
predix/
├── contracts/
│   ├── src/
│   │   ├── PredictionMarket.sol    ✅ DONE — main contract
│   │   └── MockERC20.sol           ✅ DONE — test token
│   ├── test/
│   │   └── PredictionMarket.test.js ✅ DONE — 30+ tests
│   ├── script/
│   │   └── deploy.js               ✅ DONE — testnet + mainnet
│   ├── deployments/                (populated after deploy)
│   ├── .env.example                ✅ DONE
│   ├── hardhat.config.js           ✅ DONE
│   └── package.json                ✅ DONE
│
├── frontend/                       🔲 TODO — next phase
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── context/
│   └── public/
│
├── backend/                        🔲 TODO — after frontend
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── services/
│   └── prisma/
│
├── .gitignore                      ✅ DONE
└── README.md                       ✅ DONE
```

## Build Order
Phase 1: Smart Contract ✅ COMPLETE
Phase 2: Frontend (NEXT)
  - Next.js + Tailwind CSS
  - Privy for auth (email/Google/Apple/MetaMask)
  - Wagmi + Viem for contract interaction
  - Pages: Home feed, Market detail, Portfolio, Admin panel
  - Dark theme, Kalshi-style UI
Phase 3: Backend
  - Node.js + Express
  - PostgreSQL + Prisma
  - Market metadata, user profiles, categories
  - Resolution evidence (public audit log)

## Frontend Pages Needed
  /                     Home — category tabs, trending markets, market cards
  /market/[id]          Market detail — price chart, order book, YES/NO trade panel
  /portfolio            User positions, P&L, trade history
  /admin                Create market, resolve market (admin wallet only)

## Tech Stack
  Smart Contracts:  Solidity, Hardhat, OpenZeppelin
  Blockchain:       Polygon
  Currency:         Native USDC (Circle)
  Frontend:         Next.js, React, Tailwind CSS
  Auth/Wallets:     Privy (@privy-io/react-auth) — free up to 500 MAU
  Contract calls:   Wagmi + Viem
  Backend:          Node.js, Express
  Database:         PostgreSQL, Prisma ORM
  Hosting:          Vercel (frontend), Railway (backend)

## Key Decisions Still To Make
  - Contract address (after testnet deploy — update in frontend + backend .env)
  - Admin wallet addresses (owner, admin, feeWallet, emergencyRole)
  - Privy App ID (sign up at privy.io, free)
  - Domain name for the platform

## Commands Reference
  cd contracts && npm install       Install contract dependencies
  npx hardhat test                  Run all tests
  npx hardhat run script/deploy.js --network amoy     Deploy testnet
  npx hardhat run script/deploy.js --network polygon  Deploy mainnet
  npx hardhat verify --network polygon <address>      Verify on Polygonscan

## How to Resume This Session
Paste this entire CONTEXT.md file at the start of a new Claude conversation.
Say: "Continue building the Predix prediction market. We finished Phase 1 (smart contract).
Start Phase 2 — the frontend."
