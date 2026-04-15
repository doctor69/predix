# Predix — Decentralized Prediction Market

A zero-custody prediction market platform built on Polygon. Users trade YES/NO contracts on real-world events using USDC. The smart contract holds all funds — the platform never touches user money.

## Architecture

```
predix/
├── contracts/     Solidity smart contracts (Hardhat)
├── frontend/      React app (Next.js + Privy + Wagmi)
├── backend/       Node.js API (Express + Prisma + PostgreSQL)
└── docs/          Architecture and deployment guides
```

## Security Model

Four separate wallet roles — each with minimal privileges:

| Role | Purpose | If Compromised |
|---|---|---|
| **Owner** (multisig) | Change roles, update fee | Worst case — use Gnosis Safe |
| **Admin** (hot wallet) | Create & resolve markets | Wrong resolutions only, cannot steal funds |
| **Fee Wallet** | Receives platform fees | Attacker gets future fees only |
| **Emergency** | Pause contract instantly | Can only pause, nothing else |

Additional protections:
- 2-hour dispute window before any payout is released
- 2-step ownership transfer (prevents accidental transfers)
- Platform fee hardcapped at 5% forever in contract code
- ReentrancyGuard on all fund-moving functions
- SafeERC20 for all USDC transfers
- Emergency pause by emergency role

## Smart Contract

**PredictionMarket.sol** — Deployed on Polygon

- Users deposit USDC to buy YES or NO positions
- Admin creates markets and resolves them after events conclude
- Contract automatically sends 2% fee to fee wallet on resolution
- Winners claim proportional share of losing pool after dispute window
- Cancelled markets trigger full refunds with no fees

## Getting Started

### Contracts

```bash
cd contracts
npm install
cp .env.example .env      # Fill in your wallet addresses
npx hardhat test          # Run test suite
npx hardhat run script/deploy.js --network amoy   # Deploy to testnet
npx hardhat run script/deploy.js --network polygon # Deploy to mainnet
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # Fill in contract address + Privy app ID
npm run dev
```

### Backend

```bash
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

## Deployment Checklist

- [ ] All 4 role wallets created and secured
- [ ] Owner wallet is a Gnosis Safe multisig (2-of-3 minimum)
- [ ] Deployed and tested on Amoy testnet
- [ ] Contract source verified on Polygonscan
- [ ] Frontend .env updated with contract address
- [ ] Backend .env updated with contract address
- [ ] Smart contract audit completed before mainnet launch

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin |
| Blockchain | Polygon (MATIC) |
| Stablecoin | Native USDC (Circle) |
| Frontend | Next.js, React, Tailwind CSS |
| Auth & Wallets | Privy (email/social + MetaMask) |
| Contract Interaction | Wagmi, Viem |
| Backend | Node.js, Express |
| Database | PostgreSQL, Prisma ORM |
| Hosting | Vercel (frontend), Railway (backend) |

## License

MIT
