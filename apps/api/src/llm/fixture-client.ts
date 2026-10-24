import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LlmClient, LlmCallOptions, LlmCallResult, LlmUsageStats } from './types.js';
import { sanitizeLlmPayload } from './injection-defense.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.resolve(__dirname, '../../../../samples/llm-fixtures/index.json');

function loadFixturesFromDisk(): Record<string, unknown> {
  try {
    if (fs.existsSync(FIXTURES_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as {
        fixtures?: Record<string, unknown>;
      };
      return parsed.fixtures ?? {};
    }
  } catch {
    // Fallback if file read fails
  }
  return {};
}

function resolveQuoteFixture(prompt: string, fixtures: Record<string, unknown>): unknown {
  const lower = prompt.toLowerCase();
  if (lower.includes('lakeview') || lower.includes('lb-2026')) {
    return fixtures['extract_quote_2'];
  }
  if (lower.includes('palace flavours') || lower.includes('pf-2026')) {
    return fixtures['extract_quote_3'];
  }
  return fixtures['extract_quote_1'];
}

function resolveNegotiationFixture(prompt: string, fixtures: Record<string, unknown>): unknown {
  const lower = prompt.toLowerCase();
  if (lower.includes('whatsapp')) {
    return fixtures['draft_negotiation_whatsapp'] ?? fixtures['draft_negotiation_email'];
  }
  return fixtures['draft_negotiation_email'];
}

function resolveFixturePayload(
  options: LlmCallOptions<unknown>,
  fixtures: Record<string, unknown>,
): unknown {
  const { tool, userPrompt } = options;

  if (tool.name === 'extract_quote') {
    return resolveQuoteFixture(userPrompt, fixtures);
  }
  if (tool.name === 'draft_negotiation') {
    return resolveNegotiationFixture(userPrompt, fixtures);
  }
  if (tool.name === 'propose_rebalance') {
    return fixtures['propose_rebalance'];
  }
  if (tool.name === 'parse_brief') {
    return fixtures['parse_brief_wedding'];
  }
  if (tool.name === 'parse_disruption') {
    return fixtures['parse_disruption'];
  }
  if (tool.name === 'propose_schedule_fixes') {
    return fixtures['propose_schedule_fixes'];
  }
  if (tool.name === 'draft_notifications') {
    return fixtures['draft_notifications'];
  }
  if (tool.name === 'analyze_inspiration') {
    return fixtures['analyze_inspiration'];
  }
  if (tool.name === 'generate_ideas') {
    return fixtures['generate_ideas'];
  }
  return Object.values(fixtures)[0];
}

/**
 * FixtureClient replays pre-recorded LLM responses for offline development,
 * integration testing, and demo fallback.
 */
export class FixtureClient implements LlmClient {
  private readonly fixtures: Record<string, unknown>;

  constructor(customFixtures?: Record<string, unknown>) {
    this.fixtures = customFixtures ?? loadFixturesFromDisk();
  }

  async callTool<T>(options: LlmCallOptions<T>): Promise<LlmCallResult<T>> {
    const rawFixture = resolveFixturePayload(options as LlmCallOptions<unknown>, this.fixtures);
    if (!rawFixture) {
      throw new Error(
        `FIXTURE_NOT_FOUND: No recorded fixture available for tool ${options.tool.name}.`,
      );
    }

    // Validate fixture strictly against the tool's Zod schema
    const parsedData = options.tool.schema.parse(rawFixture);
    const sanitizedData = sanitizeLlmPayload<T>(parsedData);

    const usage: LlmUsageStats = {
      promptTokens: 450,
      completionTokens: 250,
      totalTokens: 700,
      estimatedCostMinor: 15,
      latencyMs: 18,
      model: 'fixture-claude-3-5-haiku',
    };

    return {
      data: sanitizedData,
      usage,
      fromCache: false,
    };
  }
}
