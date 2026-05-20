/**
 * Reads markets/markets.yml, creates any market where contractId is null,
 * then writes the contractIds back to the YAML file.
 *
 * Usage:
 *   npx hardhat run scripts/create-markets.ts --network polygonAmoy
 *   npx hardhat run scripts/create-markets.ts --network polygon
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

interface MarketEntry {
  question: string;
  category: string;
  imageUrl: string;
  resolutionSource: string;
  closingTime: string;   // ISO 8601
  resolutionTime: string; // ISO 8601
  contractId: number | null;
}

interface MarketsFile {
  markets: MarketEntry[];
}

const CONTRACT_ADDRESSES: Record<string, string> = {
  polygonAmoy: process.env.CONTRACT_ADDRESS_AMOY    ?? "",
  polygon:     process.env.CONTRACT_ADDRESS_POLYGON ?? "",
};

const MARKETS_FILE = path.resolve(__dirname, "../../markets/markets.yml");

function toUnixTimestamp(iso: string): bigint {
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  if (isNaN(ts)) throw new Error(`Invalid timestamp: ${iso}`);
  return BigInt(ts);
}

async function main(): Promise<void> {
  const networkName = network.name;
  const contractAddress = CONTRACT_ADDRESSES[networkName];

  if (!contractAddress) {
    throw new Error(
      `No CONTRACT_ADDRESS configured for network "${networkName}". ` +
      `Set CONTRACT_ADDRESS_AMOY or CONTRACT_ADDRESS_POLYGON env var.`
    );
  }

  const [signer] = await ethers.getSigners();
  console.log("══════════════════════════════════════════════════");
  console.log("  Predix — Create Markets");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Network:   ${networkName}`);
  console.log(`  Signer:    ${signer.address}`);
  console.log(`  Contract:  ${contractAddress}`);
  const balance = await ethers.provider.getBalance(signer.address);
  console.log(`  Balance:   ${ethers.formatEther(balance)} POL`);

  // ── Load markets.yml ──────────────────────────────────────────
  if (!fs.existsSync(MARKETS_FILE)) {
    throw new Error(`Markets file not found: ${MARKETS_FILE}`);
  }
  const raw = fs.readFileSync(MARKETS_FILE, "utf8");
  const data = yaml.load(raw) as MarketsFile;

  const pending = data.markets.filter((m) => m.contractId === null || m.contractId === undefined);
  if (pending.length === 0) {
    console.log("\n  No new markets to deploy (all contractIds are set).");
    return;
  }
  console.log(`\n  Found ${pending.length} market(s) to create.\n`);

  // ── Connect to contract ───────────────────────────────────────
  const abi = [
    "function marketCount() view returns (uint256)",
    "function createMarket(string,string,string,string,uint256,uint256) external",
    "event MarketCreated(uint256 indexed marketId, string question)",
  ];
  const contract = new ethers.Contract(contractAddress, abi, signer);

  // ── Create each pending market ────────────────────────────────
  let created = 0;
  for (const market of pending) {
    console.log(`  Creating: "${market.question}"`);

    const countBefore = await contract.marketCount() as bigint;
    const expectedId = Number(countBefore);

    const tx = await contract.createMarket(
      market.question,
      market.category,
      market.imageUrl,
      market.resolutionSource,
      toUnixTimestamp(market.closingTime),
      toUnixTimestamp(market.resolutionTime),
    );

    process.stdout.write(`  Waiting for tx ${tx.hash} ...`);
    const receipt = await tx.wait();
    console.log(` confirmed (block ${receipt.blockNumber})`);

    market.contractId = expectedId;
    console.log(`  → contractId: ${expectedId}\n`);
    created++;
  }

  // ── Write back updated YAML ───────────────────────────────────
  const updated = yaml.dump(data, { lineWidth: 120, noRefs: true });

  // Preserve the header comment block
  const headerLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") {
      headerLines.push(line);
    } else {
      break;
    }
  }
  const header = headerLines.join("\n");
  fs.writeFileSync(MARKETS_FILE, header + "\n" + updated);

  console.log(`  Saved ${MARKETS_FILE}`);
  console.log(`\n  ✓ Created ${created} market(s) on ${networkName}.`);
  console.log("══════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
