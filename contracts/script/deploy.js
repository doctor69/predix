const { ethers, network } = require("hardhat");
require("dotenv").config();

const USDC_ADDRESSES = {
  hardhat:  "0x0000000000000000000000000000000000000000",
  amoy:     "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  polygon:  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  console.log("═══════════════════════════════════════════");
  console.log("  Deploying PredictionMarket");
  console.log("═══════════════════════════════════════════");
  console.log(`  Network:  ${networkName}`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} MATIC`);

  const OWNER_ADDRESS  = process.env.OWNER_ADDRESS;
  const ADMIN_ADDRESS  = process.env.ADMIN_ADDRESS;
  const FEE_WALLET     = process.env.FEE_WALLET_ADDRESS;
  const EMERGENCY_ROLE = process.env.EMERGENCY_ROLE_ADDRESS;
  const USDC_ADDRESS   = USDC_ADDRESSES[networkName];

  if (!OWNER_ADDRESS || !ADMIN_ADDRESS || !FEE_WALLET || !EMERGENCY_ROLE) {
    throw new Error("Missing required environment variables. Copy .env.example to .env and fill in all wallet addresses.");
  }

  const roles = [OWNER_ADDRESS, ADMIN_ADDRESS, FEE_WALLET, EMERGENCY_ROLE];
  const unique = new Set(roles.map(a => a.toLowerCase()));
  if (unique.size !== roles.length) {
    throw new Error("All role addresses must be unique!");
  }

  console.log("\n  Role Addresses:");
  console.log(`  Owner (multisig):  ${OWNER_ADDRESS}`);
  console.log(`  Admin (hot):       ${ADMIN_ADDRESS}`);
  console.log(`  Fee Wallet:        ${FEE_WALLET}`);
  console.log(`  Emergency Role:    ${EMERGENCY_ROLE}`);
  console.log(`  USDC:              ${USDC_ADDRESS}`);

  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const contract = await PredictionMarket.deploy(
    USDC_ADDRESS, OWNER_ADDRESS, ADMIN_ADDRESS, FEE_WALLET, EMERGENCY_ROLE
  );
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log(`\n✅ Deployed to: ${contractAddress}`);

  if (networkName === "polygon") {
    console.log(`   https://polygonscan.com/address/${contractAddress}`);
  } else if (networkName === "amoy") {
    console.log(`   https://amoy.polygonscan.com/address/${contractAddress}`);
  }

  const fs = require("fs");
  if (!fs.existsSync("deployments")) fs.mkdirSync("deployments");
  fs.writeFileSync(
    `deployments/${networkName}.json`,
    JSON.stringify({ network: networkName, contractAddress, usdc: USDC_ADDRESS,
      owner: OWNER_ADDRESS, admin: ADMIN_ADDRESS, feeWallet: FEE_WALLET,
      emergencyRole: EMERGENCY_ROLE, deployedAt: new Date().toISOString(),
      deployedBy: deployer.address }, null, 2)
  );
  console.log(`   Saved to deployments/${networkName}.json`);

  console.log("\n  Next steps:");
  console.log(`  1. npx hardhat verify --network ${networkName} ${contractAddress}`);
  console.log("  2. Update CONTRACT_ADDRESS in frontend/.env and backend/.env");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
