/**
 * Reads markets/markets.yml, creates any market where contractId is null,
 * checks on-chain for duplicates before each deployment,
 * then writes the contractIds back to the YAML file.
 *
 * contractId values in YAML:
 *   null        → pending deployment
 *   0, 1, 2 …   → deployed, this is the on-chain market ID
 *   -1          → skipped (duplicate already exists on-chain)
 *
 * Usage:
 *   npx hardhat run scripts/create-markets.ts --network polygonAmoy
 *   npx hardhat run scripts/create-markets.ts --network polygon
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarketEntry {
  question: string;
  category: string;
  imageUrl: string;
  resolutionSource: string;
  closingTime: string;
  resolutionTime: string;
  contractId: number | null;
}

interface MarketsFile {
  markets: MarketEntry[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CONTRACT_ADDRESSES: Record<string, string> = {
  polygonAmoy: process.env.CONTRACT_ADDRESS_AMOY    ?? "",
  polygon:     process.env.CONTRACT_ADDRESS_POLYGON ?? "",
};

const MARKETS_FILE        = path.resolve(__dirname, "../../markets/markets.yml");
const MAX_PER_RUN         = parseInt(process.env.MAX_MARKETS_PER_DEPLOY ?? "100");
const DEDUP_THRESHOLD     = 0.6;

// ─── Duplicate detection ──────────────────────────────────────────────────────

const STOP_WORDS = new Set(["will","the","and","for","are","that","this","have","with","from","been","has","was","were","they","their","what","when","who","how","can","not","but","its","into","more","than","then","also","does","did"]);

function meaningfulWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
  );
}

function wordOverlap(a: string, b: string): number {
  const wa = meaningfulWords(a);
  const wb = meaningfulWords(b);
  if (wa.size === 0 && wb.size === 0) return 1;
  const hits = [...wa].filter((w) => wb.has(w)).length;
  return hits / Math.max(wa.size, wb.size, 1);
}

function findDuplicate(question: string, existing: string[]): string | null {
  for (const eq of existing) {
    if (wordOverlap(question, eq) >= DEDUP_THRESHOLD) return eq;
  }
  return null;
}

// ─── YAML helpers ─────────────────────────────────────────────────────────────

function readMarketsFile(): { data: MarketsFile; header: string } {
  const raw = fs.readFileSync(MARKETS_FILE, "utf8");
  const headerLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") headerLines.push(line);
    else break;
  }
  return {
    data: (yaml.load(raw) as MarketsFile) ?? { markets: [] },
    header: headerLines.join("\n"),
  };
}

function writeMarketsFile(data: MarketsFile, header: string): void {
  const body = yaml.dump(data, { lineWidth: 140, noRefs: true });
  fs.writeFileSync(MARKETS_FILE, header ? header + "\n" + body : body);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toUnixTimestamp(iso: string): bigint {
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  if (isNaN(ts)) throw new Error(`Invalid timestamp: ${iso}`);
  return BigInt(ts);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const networkName     = network.name;
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

  if (!fs.existsSync(MARKETS_FILE)) throw new Error(`Markets file not found: ${MARKETS_FILE}`);
  const { data, header } = readMarketsFile();
  data.markets ??= [];

  const pending = data.markets
    .filter((m) => m.contractId === null || m.contractId === undefined)
    .slice(0, MAX_PER_RUN);

  if (pending.length === 0) {
    console.log("\n  No pending markets (all contractIds are set).");
    return;
  }
  console.log(`\n  Pending: ${pending.length} markets (cap: ${MAX_PER_RUN})\n`);

  // ── Connect to contract ────────────────────────────────────────────────────
  const abi = [
    "function marketCount() view returns (uint256)",
    "function createMarket(string,string,string,string,uint256,uint256) external returns (uint256)",
    "function getMarket(uint256) view returns (tuple(string question,string category,string imageUrl,string resolutionSource,uint256 createdAt,uint256 closingTime,uint256 resolutionTime,uint256 resolvedAt,uint256 finalizedAt,uint256 yesPool,uint256 noPool,uint256 feesCollected,uint8 outcome,bool disputed))",
    "event MarketCreated(uint256 indexed marketId,string question,string category,uint256 closingTime,uint256 resolutionTime)",
  ];
  const contract = new ethers.Contract(contractAddress, abi, signer);

  // ── Load on-chain questions for dedup ────────────────────────────────────
  const chainCount = Number(await contract.marketCount());
  const onChainQuestions: string[] = [];
  if (chainCount > 0) {
    process.stdout.write(`  Loading ${chainCount} on-chain markets for dedup check ...`);
    for (let i = 0; i < chainCount; i++) {
      const m = await contract.getMarket(i);
      onChainQuestions.push(m.question as string);
    }
    console.log(" done");
  }

  // ── Create each pending market ────────────────────────────────────────────
  let created = 0;
  let skipped = 0;
  const now = Math.floor(Date.now() / 1000);

  for (const market of pending) {
    // Timestamps validation
    const closingTs    = Number(toUnixTimestamp(market.closingTime));
    const resolutionTs = Number(toUnixTimestamp(market.resolutionTime));
    if (closingTs <= now) {
      console.log(`  SKIP (closing in past): "${market.question.slice(0, 70)}"`);
      market.contractId = -1;
      skipped++;
      continue;
    }

    // On-chain duplicate check
    const dup = findDuplicate(market.question, onChainQuestions);
    if (dup) {
      console.log(`  SKIP (dup on-chain): "${market.question.slice(0, 70)}"`);
      console.log(`    ↳ matches: "${dup.slice(0, 70)}"`);
      market.contractId = -1;
      skipped++;
      continue;
    }

    console.log(`  Creating [${market.category}]: "${market.question.slice(0, 70)}"`);

    const expectedId = chainCount + created;
    const tx = await contract.createMarket(
      market.question,
      market.category,
      market.imageUrl,
      market.resolutionSource,
      BigInt(closingTs),
      BigInt(resolutionTs),
    );

    process.stdout.write(`    tx ${tx.hash} ...`);
    const receipt = await tx.wait();
    console.log(` block ${receipt.blockNumber} — id: ${expectedId}`);

    market.contractId = expectedId;
    onChainQuestions.push(market.question); // prevent intra-run duplicates
    created++;
  }

  // ── Persist updated YAML ──────────────────────────────────────────────────
  writeMarketsFile(data, header);
  console.log(`\n  Saved ${MARKETS_FILE}`);
  console.log(`  ✓ Created: ${created} | Skipped: ${skipped}`);
  console.log("══════════════════════════════════════════════════");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
