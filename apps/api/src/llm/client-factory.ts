import type { DbClient } from '../db/client.js';
import type { LlmClient, LlmCallOptions, LlmCallResult } from './types.js';
import { NullClient } from './null-client.js';
import { FixtureClient } from './fixture-client.js';
import { AnthropicClient } from './anthropic-client.js';
import { GeminiClient } from './gemini-client.js';
import { LlmResponseCache } from './cache.js';
import { checkSpendCaps, recordLlmUsage } from './spend-caps.js';

export interface LlmFactoryOptions {
  db?: DbClient;
  mode?: 'live' | 'fixture' | 'null';
  apiKey?: string;
  cache?: LlmResponseCache;
}

export class ManagedLlmClient implements LlmClient {
  private readonly innerClient: LlmClient;
  private readonly db?: DbClient;
  private readonly cache: LlmResponseCache;

  constructor(innerClient: LlmClient, db?: DbClient, cache?: LlmResponseCache) {
    this.innerClient = innerClient;
    this.db = db;
    this.cache = cache ?? new LlmResponseCache();
  }

  async callTool<T>(options: LlmCallOptions<T>): Promise<LlmCallResult<T>> {
    // 1. Check content-hash response cache
    const cached = this.cache.get<T>(options.purpose, options.contentHash);
    if (cached) {
      return cached;
    }

    // 2. Enforce spend caps and rate limits
    if (this.db) {
      await checkSpendCaps(this.db, options.eventId);
    }

    // 3. Execute tool call with forced tool use and retry/validation
    const result = await this.innerClient.callTool(options);

    // 4. Store in cache if contentHash provided
    if (options.contentHash) {
      this.cache.set(options.purpose, options.contentHash, result);
    }

    // 5. Log usage to llm_usage table
    if (this.db) {
      await recordLlmUsage(this.db, options.eventId, options.purpose, result.usage);
    }

    return result;
  }
}

export function createLlmClient(options: LlmFactoryOptions = {}): LlmClient {
  const mode =
    options.mode ??
    (process.env['LLM_MODE'] as 'live' | 'fixture' | 'null' | undefined) ??
    'fixture';

  let rawClient: LlmClient;
  if (mode === 'live') {
    if (process.env['LLM_PROVIDER'] === 'anthropic') {
      rawClient = new AnthropicClient(options.apiKey);
    } else {
      rawClient = new GeminiClient(options.apiKey);
    }
  } else if (mode === 'null') {
    rawClient = new NullClient();
  } else {
    rawClient = new FixtureClient();
  }

  return new ManagedLlmClient(rawClient, options.db, options.cache);
}
