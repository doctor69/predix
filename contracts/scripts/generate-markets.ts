/**
 * AI-powered market generator for Predix.
 * Fetches news from RSS feeds, asks Claude to generate binary prediction markets,
 * deduplicates against existing markets, and appends new entries to markets.yml.
 *
 * Runs standalone (not via hardhat):
 *   npx ts-node scripts/generate-markets.ts
 *
 * Env vars:
 *   ANTHROPIC_API_KEY  — required
 *   MARKETS_PER_RUN    — markets to generate per run (default: 40)
 *   MAX_NEWS_AGE_HOURS — how old news can be (default: 72)
 */
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { XMLParser } from "fast-xml-parser";

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface GeneratedMarket {
  question: string;
  category: string;
  resolutionSource: string;
  closingTime: string;
  resolutionTime: string;
}

interface NewsItem {
  title: string;
  description: string;
  category: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const MARKETS_FILE     = path.resolve(__dirname, "../../markets/markets.yml");
const MARKETS_PER_RUN  = parseInt(process.env.MARKETS_PER_RUN  ?? "40");
const MAX_NEWS_AGE_H   = parseInt(process.env.MAX_NEWS_AGE_HOURS ?? "72");
const DEDUP_THRESHOLD  = 0.55; // word-overlap ratio above which we consider a duplicate

// ─── RSS Feed Sources ────────────────────────────────────────────────────────

const RSS_FEEDS: Record<string, string[]> = {
  Crypto: [
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://cointelegraph.com/rss",
    "https://decrypt.co/feed",
  ],
  Sports: [
    "https://feeds.bbci.co.uk/sport/rss.xml",
    "https://www.espn.com/espn/rss/news",
    "https://rss.app/feeds/vEfJrIg3VJoFhUFi.xml",
  ],
  Politics: [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
    "https://feeds.skynews.com/feeds/rss/world.xml",
  ],
  Finance: [
    "https://feeds.marketwatch.com/marketwatch/topstories/",
    "https://finance.yahoo.com/news/rssindex",
    "https://rss.dw.com/rdf/rss-en-top",
  ],
  Tech: [
    "https://techcrunch.com/feed/",
    "https://www.theverge.com/rss/index.xml",
    "https://feeds.arstechnica.com/arstechnica/index",
  ],
  Science: [
    "https://phys.org/rss-feed/",
    "https://www.newscientist.com/feed/home/",
    "https://rss.sciencedaily.com/top/science.xml",
  ],
  Entertainment: [
    "https://variety.com/feed/",
    "https://deadline.com/feed/",
    "https://www.rollingstone.com/feed/",
  ],
  Global: [
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.reuters.com/reuters/topNews",
  ],
};

// ─── Curated images per category (Unsplash) ──────────────────────────────────

const CATEGORY_IMAGES: Record<string, string[]> = {
  Crypto: [
    "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=800",
    "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800",
    "https://images.unsplash.com/photo-1622630998477-20aa696ecb05?w=800",
    "https://images.unsplash.com/photo-1605792657660-596af9009e82?w=800",
  ],
  Sports: [
    "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800",
    "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800",
    "https://images.unsplash.com/photo-1540747913346-19212a4f434a?w=800",
    "https://images.unsplash.com/photo-1471295253337-3ceaaedca402?w=800",
  ],
  Politics: [
    "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800",
    "https://images.unsplash.com/photo-1555848962-6e79363ec58f?w=800",
    "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800",
  ],
  Finance: [
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800",
    "https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=800",
  ],
  Tech: [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
    "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800",
    "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=800",
    "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800",
  ],
  Science: [
    "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=800",
    "https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=800",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800",
  ],
  Entertainment: [
    "https://images.unsplash.com/photo-1509909756405-be0199881695?w=800",
    "https://images.unsplash.com/photo-1603190287605-e6ade32fa852?w=800",
    "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800",
  ],
  Global: [
    "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800",
    "https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?w=800",
    "https://images.unsplash.com/photo-1474631245212-32dc3c8310c6?w=800",
  ],
};

// ─── RSS helpers ──────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

async function fetchFeed(url: string, category: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Predix-MarketBot/1.0 (prediction market generator)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, allowBooleanAttributes: true });
    const doc = parser.parse(xml);

    const channel = doc?.rss?.channel ?? doc?.feed ?? {};
    const items: unknown[] = Array.isArray(channel.item ?? channel.entry)
      ? (channel.item ?? channel.entry)
      : [channel.item ?? channel.entry].filter(Boolean);

    const cutoff = Date.now() - MAX_NEWS_AGE_H * 3_600_000;

    return items
      .filter((item: any) => {
        const pub = item?.pubDate ?? item?.published ?? item?.updated ?? "";
        return !pub || new Date(String(pub)).getTime() > cutoff;
      })
      .map((item: any) => ({
        title: stripHtml(String(item?.title ?? "")).slice(0, 200),
        description: stripHtml(
          String(item?.description ?? item?.summary ?? item?.["content:encoded"] ?? "")
        ).slice(0, 400),
        category,
      }))
      .filter((n) => n.title.length > 15);
  } catch {
    return [];
  }
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

function meaningfulWords(s: string): Set<string> {
  // Strip common stop words so "Will X happen?" doesn't match "Will Y happen?"
  const STOP = new Set(["will","the","and","for","are","that","this","have","with","from","been","has","was","were","they","their","what","when","who","how","can","not","but","its","into","more","than","then","than","also","does","did"]);
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
  );
}

function wordOverlap(a: string, b: string): number {
  const wa = meaningfulWords(a);
  const wb = meaningfulWords(b);
  if (wa.size === 0 && wb.size === 0) return 1;
  const hits = [...wa].filter((w) => wb.has(w)).length;
  return hits / Math.max(wa.size, wb.size, 1);
}

function isDuplicate(question: string, pool: string[]): boolean {
  return pool.some((q) => wordOverlap(question, q) >= DEDUP_THRESHOLD);
}

// ─── Claude market generation ─────────────────────────────────────────────────

async function generateWithClaude(
  client: Anthropic,
  newsItems: NewsItem[],
  existingQuestions: string[],
  count: number
): Promise<GeneratedMarket[]> {
  const today = new Date().toISOString().split("T")[0];

  const headlines = newsItems
    .map((n) => `[${n.category}] ${n.title}${n.description ? " — " + n.description : ""}`)
    .join("\n");

  // Only send a representative sample of existing questions (prompt length control)
  const existingSample = existingQuestions.slice(-200).join("\n");

  const prompt = `You are a prediction market curator for Predix, a platform like Kalshi and Polymarket.

Today: ${today} UTC

Generate exactly ${count} high-quality binary (YES/NO) prediction markets from the news below.

━━━ QUALITY RULES ━━━
• Each question resolves to a clear, objectively verifiable YES or NO
• Include the specific metric, threshold, name, or date in the question
• closingTime: at least 24 h from now (betting deadline)
• resolutionTime: at least 12 h after closingTime (when outcome is checked)
• Spread evenly across categories: Crypto, Sports, Politics, Finance, Tech, Science, Entertainment, Global
• Do NOT generate a question that is too similar to any in the EXISTING MARKETS list
• Short-to-medium horizon: resolve within 7–90 days from today

━━━ GOOD EXAMPLES ━━━
• "Will Bitcoin (BTC) close above $110,000 on CoinGecko on July 4, 2026?"
• "Will the Federal Reserve cut interest rates at its June 2026 FOMC meeting?"
• "Will Apple's WWDC 2026 announce a new Apple Intelligence model?"
• "Will Real Madrid win the 2026 UEFA Champions League final?"

━━━ NEWS HEADLINES ━━━
${headlines}

━━━ EXISTING MARKETS (avoid duplicating) ━━━
${existingSample || "(none yet)"}

Return ONLY a raw JSON array — no markdown fences, no explanation. Schema for each element:
{
  "question":         "Will X happen by [specific date/condition]?",
  "category":         "Crypto|Sports|Politics|Finance|Tech|Science|Entertainment|Global",
  "resolutionSource": "Public verifiable source name (e.g. CoinGecko, BBC Sport, Federal Reserve)",
  "closingTime":      "YYYY-MM-DDTHH:mm:00Z",
  "resolutionTime":   "YYYY-MM-DDTHH:mm:00Z"
}`;

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Claude returned no JSON array");

  return JSON.parse(match[0]) as GeneratedMarket[];
}

// ─── YAML helpers ─────────────────────────────────────────────────────────────

function readMarketsFile(): { data: MarketsFile; header: string } {
  if (!fs.existsSync(MARKETS_FILE)) {
    return { data: { markets: [] }, header: "" };
  }
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

  const client = new Anthropic({ apiKey });

  console.log("══════════════════════════════════════════════════");
  console.log("  Predix — AI Market Generator");
  console.log(`  Target: ${MARKETS_PER_RUN} new markets`);
  console.log("══════════════════════════════════════════════════\n");

  // Load existing markets
  const { data, header } = readMarketsFile();
  data.markets ??= [];
  const existingQuestions = data.markets.map((m) => m.question);
  console.log(`  Existing markets in YAML: ${existingQuestions.length}`);

  // Fetch RSS feeds
  console.log("\n  Fetching RSS feeds...");
  const allNews: NewsItem[] = [];
  for (const [category, urls] of Object.entries(RSS_FEEDS)) {
    for (const url of urls) {
      const items = await fetchFeed(url, category);
      allNews.push(...items);
      if (items.length > 0) process.stdout.write(`    ${category}: ${items.length} items\n`);
    }
  }
  console.log(`\n  Total news items: ${allNews.length}`);

  if (allNews.length < 10) {
    console.warn("  Too few news items fetched — aborting to avoid low-quality markets.");
    process.exit(0);
  }

  // Shuffle and cap news to keep prompt size manageable
  const newsForPrompt = allNews.sort(() => Math.random() - 0.5).slice(0, 120);

  // Generate markets via Claude
  console.log(`\n  Calling Claude (claude-opus-4-7) for ${MARKETS_PER_RUN} markets...`);
  const generated = await generateWithClaude(client, newsForPrompt, existingQuestions, MARKETS_PER_RUN);
  console.log(`  Claude returned ${generated.length} candidates`);

  // Validate + deduplicate
  const newMarkets: MarketEntry[] = [];
  const seenThisRun: string[] = [];
  const now = new Date();

  for (const m of generated) {
    if (!m.question?.trim() || !m.resolutionSource?.trim() || !m.closingTime || !m.resolutionTime) {
      continue;
    }
    if (new Date(m.closingTime) <= now) continue;
    if (new Date(m.resolutionTime) < new Date(m.closingTime)) continue;

    const allKnown = [...existingQuestions, ...seenThisRun];
    if (isDuplicate(m.question, allKnown)) {
      console.log(`  SKIP dup: "${m.question.slice(0, 75)}"`);
      continue;
    }

    const pool = CATEGORY_IMAGES[m.category] ?? CATEGORY_IMAGES.Global;
    const imageUrl = pool[Math.floor(Math.random() * pool.length)];

    newMarkets.push({
      question:         m.question.trim(),
      category:         m.category,
      imageUrl,
      resolutionSource: m.resolutionSource.trim(),
      closingTime:      m.closingTime,
      resolutionTime:   m.resolutionTime,
      contractId:       null,
    });
    seenThisRun.push(m.question);
    console.log(`  + [${m.category}] "${m.question.slice(0, 75)}"`);
  }

  if (newMarkets.length === 0) {
    console.log("\n  No new unique markets generated — nothing to write.");
    return;
  }

  data.markets.push(...newMarkets);
  writeMarketsFile(data, header);

  console.log(`\n  ✓ Added ${newMarkets.length} markets to ${MARKETS_FILE}`);
  console.log("══════════════════════════════════════════════════");
}

main().catch((err) => { console.error(err); process.exit(1); });
