/**
 * Resolves prediction markets on-chain.
 *
 * Two resolution modes (checked in order):
 *
 *   1. YAML override — admin sets `outcome: yes | no | cancel` on any market
 *      entry in markets.yml. Script picks it up and calls resolveMarket().
 *      Use this for manual control.
 *
 *   2. Claude AI — for markets past resolutionTime with no YAML outcome,
 *      Claude determines YES/NO from its knowledge. Only auto-resolves when
 *      confidence >= CONFIDENCE_THRESHOLD. Uncertain markets are logged and
 *      skipped until admin sets the outcome manually.
 *
 * After resolveMarket() the contract starts a 2-hour dispute window
 * (finalizedAt = resolvedAt + 2h) before payouts unlock — no extra handling
 * needed here.
 *
 * Usage:
 *   npx hardhat run scripts/resolve-markets.ts --network polygonAmoy
 *
 * Env vars:
 *   ANTHROPIC_API_KEY       — required for Claude AI mode
 *   RESOLVE_BUFFER_MINS     — minutes after resolutionTime before auto-resolve (default 30)
 *   CONFIDENCE_THRESHOLD    — minimum Claude confidence 0-100 to auto-resolve (default 85)
 */
import { ethers, network } from "hardhat";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarketEntry {
  question: string;
  category: string;
  imageUrl: string;
  resolutionSource: string;
  closingTime: string;
  resolutionTime: string;
  contractId: number | null;
  outcome?: "yes" | "no" | "cancel" | null;  // admin-set resolution
}

interface MarketsFile {
  markets: MarketEntry[];
}

interface OnChainMarket {
  id: number;
  question: string;
  category: string;
  resolutionSource: string;
  resolutionTime: bigint;
  outcome: number;
}

interface ClaudeVerdict {
  outcome: "YES" | "NO" | "UNCERTAIN" | "PENDING";
  confidence: number;
  reasoning: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CONTRACT_ADDRESSES: Record<string, string> = {
  polygonAmoy: process.env.CONTRACT_ADDRESS_AMOY    ?? "",
  polygon:     process.env.CONTRACT_ADDRESS_POLYGON ?? "",
};

const MARKETS_FILE          = path.resolve(__dirname, "../../markets/markets.yml");
const RESOLVE_BUFFER_SECS   = parseInt(process.env.RESOLVE_BUFFER_MINS ?? "30") * 60;
const CONFIDENCE_THRESHOLD  = parseInt(process.env.CONFIDENCE_THRESHOLD ?? "85");
const OUTCOME_UNRESOLVED    = 0;
// Claude's training cutoff — markets resolving after this date return UNCERTAIN anyway, so skip the API call
const CLAUDE_CUTOFF_UNIX    = Math.floor(new Date("2025-08-01T00:00:00Z").getTime() / 1000);

// ─── YAML helpers ─────────────────────────────────────────────────────────────

function readMarketsFile(): { data: MarketsFile; header: string } {
  if (!fs.existsSync(MARKETS_FILE)) return { data: { markets: [] }, header: "" };
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

// ─── Claude AI resolution (batched — one API call for all eligible markets) ───

async function askClaudeBatch(
  client: Anthropic,
  markets: OnChainMarket[],
  todayIso: string
): Promise<Map<number, ClaudeVerdict>> {
  const list = markets
    .map((m, i) =>
      `${i + 1}. [id=${m.id}] "${m.question}" | source: ${m.resolutionSource} | resolves: ${new Date(Number(m.resolutionTime) * 1000).toISOString()}`
    )
    .join("\n");

  const prompt = `You are resolving binary prediction markets. Today (UTC): ${todayIso}

For each market determine YES, NO, UNCERTAIN, or PENDING.
Rules:
- YES / NO only when you have ≥85% confidence from training data
- UNCERTAIN if you lack specific knowledge of the outcome
- PENDING if the resolution time is in the future

${list}

Return ONLY a JSON array (no markdown), one entry per market in the same order:
[{"id":<contractId>,"outcome":"YES|NO|UNCERTAIN|PENDING","confidence":0-100,"reasoning":"one sentence"}]`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  const results = new Map<number, ClaudeVerdict>();
  if (!match) return results;

  try {
    const arr = JSON.parse(match[0]) as Array<{ id: number } & ClaudeVerdict>;
    for (const item of arr) results.set(item.id, item);
  } catch { /* return empty map */ }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const networkName     = network.name;
  const contractAddress = CONTRACT_ADDRESSES[networkName];

  if (!contractAddress) {
    throw new Error(
      `No CONTRACT_ADDRESS for network "${networkName}". ` +
      `Set CONTRACT_ADDRESS_AMOY or CONTRACT_ADDRESS_POLYGON.`
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const claude = apiKey ? new Anthropic({ apiKey }) : null;
  if (!claude) console.warn("  ANTHROPIC_API_KEY not set — Claude AI mode disabled");

  const [signer] = await ethers.getSigners();
  console.log("══════════════════════════════════════════════════");
  console.log("  Predix — Resolve Markets");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Network:    ${networkName}`);
  console.log(`  Signer:     ${signer.address}`);
  console.log(`  Contract:   ${contractAddress}`);
  console.log(`  Buffer:     ${RESOLVE_BUFFER_SECS / 60} min after resolutionTime`);
  console.log(`  Confidence: ${CONFIDENCE_THRESHOLD}% threshold for Claude auto-resolve`);

  // ── Connect to contract ────────────────────────────────────────────────────
  const abi = [
    "function marketCount() view returns (uint256)",
    "function getMarket(uint256) view returns (tuple(string question,string category,string imageUrl,string resolutionSource,uint256 createdAt,uint256 closingTime,uint256 resolutionTime,uint256 resolvedAt,uint256 finalizedAt,uint256 yesPool,uint256 noPool,uint256 feesCollected,uint8 outcome,bool disputed))",
    "function resolveMarket(uint256 marketId, bool isYes) external",
    "function cancelMarket(uint256 marketId) external",
  ];
  const contract = new ethers.Contract(contractAddress, abi, signer);
  const iface = new ethers.Interface(abi);

  // Multicall3 — same address on all EVM chains
  const multicall = new ethers.Contract(
    "0xcA11bde05977b3631167028862bE2a173976CA11",
    ["function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) view returns (tuple(bool success,bytes returnData)[])"],
    ethers.provider,
  );

  // ── Load YAML for admin outcomes ──────────────────────────────────────────
  const { data: yamlData, header } = readMarketsFile();
  yamlData.markets ??= [];

  // Build a lookup: contractId → YAML entry (for admin-set outcomes)
  const yamlByContractId = new Map<number, MarketEntry>();
  for (const entry of yamlData.markets) {
    if (typeof entry.contractId === "number" && entry.contractId >= 0) {
      yamlByContractId.set(entry.contractId, entry);
    }
  }

  // Early exit if no YAML overrides pending and no markets could be past buffer yet
  const hasYamlOverrides = yamlData.markets.some(
    (m) => m.outcome === "yes" || m.outcome === "no" || m.outcome === "cancel"
  );

  // ── Fetch all markets in ONE multicall ────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  const todayIso = new Date().toISOString();
  const count = Number(await contract.marketCount());
  console.log(`\n  On-chain markets: ${count}`);

  if (count === 0) {
    console.log("  No markets on-chain yet.\n");
    return;
  }

  // Batch all getMarket calls into a single RPC request via Multicall3
  process.stdout.write(`  Fetching all markets via multicall ...`);
  const calls = Array.from({ length: count }, (_, i) => ({
    target:       contractAddress,
    allowFailure: true,
    callData:     iface.encodeFunctionData("getMarket", [BigInt(i)]),
  }));
  const results: { success: boolean; returnData: string }[] = await multicall.aggregate3(calls);
  console.log(` done`);

  const eligible: OnChainMarket[] = [];
  for (let i = 0; i < results.length; i++) {
    if (!results[i].success) continue;
    const decoded = iface.decodeFunctionResult("getMarket", results[i].returnData);
    const m = decoded[0];
    if (
      Number(m.outcome) === OUTCOME_UNRESOLVED &&
      Number(m.resolutionTime) + RESOLVE_BUFFER_SECS <= now
    ) {
      eligible.push({
        id: i,
        question:         m.question as string,
        category:         m.category as string,
        resolutionSource: m.resolutionSource as string,
        resolutionTime:   m.resolutionTime as bigint,
        outcome:          Number(m.outcome),
      });
    }
  }

  if (eligible.length === 0) {
    console.log("  No markets ready for resolution.\n");
    return;
  }
  console.log(`  Eligible for resolution: ${eligible.length}\n`);

  // ── Resolve each market ───────────────────────────────────────────────────
  let resolved  = 0;
  let skipped   = 0;
  let yamlDirty = false;

  // Split eligible into YAML-overridden vs needing Claude
  const needsClaude: OnChainMarket[] = [];

  for (const market of eligible) {
    const yamlEntry = yamlByContractId.get(market.id);

    if (yamlEntry?.outcome === "yes" || yamlEntry?.outcome === "no") {
      const isYes = yamlEntry.outcome === "yes";
      console.log(`  [${market.id}] YAML → ${yamlEntry.outcome.toUpperCase()}: "${market.question.slice(0, 65)}"`);
      const tx = await contract.resolveMarket(market.id, isYes);
      process.stdout.write(`    tx ${tx.hash} ...`);
      const receipt = await tx.wait();
      console.log(` block ${receipt.blockNumber} ✓`);
      yamlEntry.outcome = null;
      yamlDirty = true;
      resolved++;
      continue;
    }

    if (yamlEntry?.outcome === "cancel") {
      console.log(`  [${market.id}] YAML → CANCEL: "${market.question.slice(0, 65)}"`);
      const tx = await contract.cancelMarket(market.id);
      process.stdout.write(`    tx ${tx.hash} ...`);
      const receipt = await tx.wait();
      console.log(` block ${receipt.blockNumber} ✓`);
      yamlEntry.outcome = null;
      yamlDirty = true;
      resolved++;
      continue;
    }

    // Skip Claude for markets resolving after its knowledge cutoff — always UNCERTAIN
    if (Number(market.resolutionTime) > CLAUDE_CUTOFF_UNIX) {
      skipped++;
      continue;
    }

    needsClaude.push(market);
  }

  // ── One batched Claude call for all pre-cutoff markets ───────────────────
  if (needsClaude.length > 0) {
    if (!claude) {
      console.log(`  ${needsClaude.length} markets need Claude but ANTHROPIC_API_KEY not set — skipping`);
      skipped += needsClaude.length;
    } else {
      console.log(`\n  Asking Claude about ${needsClaude.length} pre-2025-08 market(s)...`);
      const verdicts = await askClaudeBatch(claude, needsClaude, todayIso);

      for (const market of needsClaude) {
        const verdict = verdicts.get(market.id) ?? { outcome: "UNCERTAIN" as const, confidence: 0, reasoning: "No response" };
        console.log(`  [${market.id}] Claude: ${verdict.outcome} (${verdict.confidence}%) — ${verdict.reasoning}`);

        if (verdict.outcome === "UNCERTAIN" || verdict.outcome === "PENDING" || verdict.confidence < CONFIDENCE_THRESHOLD) {
          skipped++;
          continue;
        }

        const tx = await contract.resolveMarket(market.id, verdict.outcome === "YES");
        process.stdout.write(`    tx ${tx.hash} ...`);
        const receipt = await tx.wait();
        console.log(` block ${receipt.blockNumber} ✓`);
        resolved++;
      }
    }
  } else if (eligible.length > 0) {
    console.log(`  ${skipped} market(s) skipped — all resolve after Claude's knowledge cutoff (Aug 2025).`);
    console.log("  To resolve, set  outcome: yes/no  on the entry in markets.yml and push.");
  }

  // ── Persist any YAML changes (cleared outcome flags) ────────────────────
  if (yamlDirty) {
    writeMarketsFile(yamlData, header);
    console.log(`\n  Saved ${MARKETS_FILE}`);
  }

  console.log(`\n  ✓ Resolved: ${resolved} | Skipped: ${skipped}`);
  console.log("══════════════════════════════════════════════════");

  if (skipped > 0) {
    console.log("\n  To manually resolve a skipped market, add to its entry in markets.yml:");
    console.log("    outcome: yes   # or: no, cancel");
    console.log("  Then push to main — the resolve workflow will pick it up.\n");
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
