import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, requireAdmin } from '../middleware/auth';
import type { Bindings, Variables } from '../index';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const generateSchema = z.object({
  topic:    z.string().max(200).optional(),
  category: z.string().optional(),
  count:    z.number().int().min(1).max(10).default(5),
});

const SYSTEM_PROMPT = `You are a prediction market question designer for Predix, a zero-custody crypto prediction market platform similar to Kalshi and Polymarket.

Generate high-quality, specific, verifiable binary (YES/NO) prediction market questions.

Good questions are:
- Specific and unambiguous — resolution criteria are crystal clear
- Verifiable — there is a single authoritative source that determines the outcome
- Time-bounded — clear closing and resolution dates
- Interesting to bettors — meaningful stakes and genuine uncertainty (not trivially obvious)

Available categories: Crypto, Sports, Politics, Economy, Tech, Entertainment, Other

Rules for timing:
- Closing time: 7–90 days from today (when betting stops)
- Resolution time: 1–7 days after closing time (when the outcome is confirmed)

Respond ONLY with a JSON array. Each element must have exactly these fields:
{
  "question": "Full binary question ending with '?'",
  "category": "One of the available categories",
  "resolutionSource": "Specific source and criteria (e.g. 'CoinGecko BTC/USD closing price on Jan 1, 2027 00:00 UTC')",
  "closingTime": "ISO 8601 datetime string",
  "resolutionTime": "ISO 8601 datetime string",
  "rationale": "1–2 sentences on why this question is interesting to bettors"
}

No markdown, no preamble, no explanation — only the JSON array.`;

// POST /api/agent/generate-questions
app.post(
  '/generate-questions',
  requireAuth,
  requireAdmin,
  zValidator('json', generateSchema),
  async (c) => {
    const { topic, category, count } = c.req.valid('json');
    const today = new Date().toISOString().split('T')[0];

    const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });

    let userPrompt = `Today is ${today}. Generate ${count} prediction market question${count > 1 ? 's' : ''}`;
    if (category) userPrompt += ` in the "${category}" category`;
    if (topic)    userPrompt += ` about: ${topic}`;
    userPrompt += '. Make them diverse and engaging.';

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return c.json({ error: 'No text response from AI' }, 500);
    }

    let questions: unknown;
    try {
      questions = JSON.parse(textBlock.text);
    } catch {
      return c.json({ error: 'Failed to parse AI response', raw: textBlock.text }, 500);
    }

    return c.json({ questions });
  },
);

export default app;
