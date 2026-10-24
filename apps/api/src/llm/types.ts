import type { z } from 'zod';

export type LlmPurpose =
  | 'extract_quote'
  | 'draft_negotiation'
  | 'propose_rebalance'
  | 'parse_brief'
  | 'analyze_inspiration'
  | 'generate_ideas'
  | 'parse_disruption'
  | 'propose_schedule_fixes'
  | 'draft_notifications';

export type ModelTier = 'extraction' | 'planner';

export interface LlmToolDefinition<T> {
  name: string;
  description: string;
  schema: z.ZodType<T, z.ZodTypeDef, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface LlmCallOptions<T> {
  systemPrompt: string;
  userPrompt: string;
  tool: LlmToolDefinition<T>;
  purpose: LlmPurpose;
  eventId?: string;
  modelTier?: ModelTier;
  cachePrompt?: boolean;
  contentHash?: string;
  signal?: AbortSignal;
}

export interface LlmUsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostMinor: number;
  latencyMs: number;
  model: string;
}

export interface LlmCallResult<T> {
  data: T;
  usage: LlmUsageStats;
  fromCache?: boolean;
}

export interface LlmClient {
  callTool<T>(options: LlmCallOptions<T>): Promise<LlmCallResult<T>>;
}
