import { ethers, network, run } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const USDC_ADDRESSES: Record<string, string> = {
  hardhat:     "0x0000000000000000000000000000000000000000",
  polygonAmoy: process.env.USDC_ADDRESS_AMOY    ?? "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  polygon:     process.env.USDC_ADDRESS_POLYGON ?? "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  console.log("═══════════════════════════════════════════════════");
  console.log("  Deploying PredictionMarket (Predix)");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Network:   ${networkName}`);
  console.log(`  Deployer:  ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:   ${ethers.formatEther(balance)} POL/MATIC`);

  // ── Required env vars ────────────────────────────────────────
  const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS;
  const FEE_WALLET    = process.env.FEE_WALLET;
  const FEE_PERCENT   = process.env.FEE_PERCENT;

  if (!ADMIN_ADDRESS) throw new Error("Missing env var: ADMIN_ADDRESS");
  if (!FEE_WALLET)    throw new Error("Missing env var: FEE_WALLET");
  if (!FEE_PERCENT)   throw new Error("Missing env var: FEE_PERCENT");

  const usdcAddress = USDC_ADDRESSES[networkName];
  if (!usdcAddress || usdcAddress === "0x0000000000000000000000000000000000000000") {
    if (networkName !== "hardhat") {
      throw new Error(`No USDC address configured for network: ${networkName}`);
    }
  }

  const feePercent = BigInt(FEE_PERCENT);
  if (feePercent > 500n) throw new Error("FEE_PERCENT exceeds max of 500 bps (5%)");

  console.log("\n  Constructor Arguments:");
  console.log(`  Admin:       ${ADMIN_ADDRESS}`);
  console.log(`  Fee Wallet:  ${FEE_WALLET}`);
  console.log(`  USDC:        ${usdcAddress}`);
  console.log(`  Fee %:       ${FEE_PERCENT} bps (${Number(FEE_PERCENT) / 100}%)`);

  // ── Deploy ───────────────────────────────────────────────────
  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const contract = await PredictionMarket.deploy(
    ADMIN_ADDRESS,
    FEE_WALLET,
    usdcAddress,
    feePercent,
  );
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log(`\n  Deployed to: ${contractAddress}`);

  if (networkName === "polygon") {
    console.log(`  Explorer:    https://polygonscan.com/address/${contractAddress}`);
  } else if (networkName === "polygonAmoy") {
    console.log(`  Explorer:    https://amoy.polygonscan.com/address/${contractAddress}`);
  }

  // ── Save deployment record ───────────────────────────────────
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const record = {
    network:         networkName,
    contractAddress,
    usdc:            usdcAddress,
    admin:           ADMIN_ADDRESS,
    feeWallet:       FEE_WALLET,
    feePercent:      FEE_PERCENT,
    deployedAt:      new Date().toISOString(),
    deployedBy:      deployer.address,
  };
  fs.writeFileSync(
    path.join(deploymentsDir, `${networkName}.json`),
    JSON.stringify(record, null, 2),
  );
  console.log(`  Saved:       deployments/${networkName}.json`);

  // ── Verify on Polygonscan (skip for local hardhat network) ───
  if (networkName !== "hardhat") {
    console.log("\n  Waiting 30 seconds before verification...");
    await new Promise((resolve) => setTimeout(resolve, 30_000));

    console.log("  Verifying on Polygonscan...");
    try {
      await run("verify:verify", {
        address:              contractAddress,
        constructorArguments: [ADMIN_ADDRESS, FEE_WALLET, usdcAddress, feePercent],
      });
      console.log("  Verification successful.");
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes("already verified")) {
        console.log("  Already verified.");
      } else {
        console.warn("  Verification failed:", err);
      }
    }
  }

  console.log("\n  Next steps:");
  console.log(`  1. Update CONTRACT_ADDRESS in frontend/.env`);
  console.log(`  2. Update CONTRACT_ADDRESS in backend/.env`);
  console.log("═══════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
