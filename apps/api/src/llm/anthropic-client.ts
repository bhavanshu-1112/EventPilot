import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validationError, internalError } from '@eventpilot/shared';
import type {
  LlmClient,
  LlmCallOptions,
  LlmCallResult,
  LlmUsageStats,
  ModelTier,
} from './types.js';
import { INJECTION_DEFENSE_SYSTEM_INSTRUCTION, sanitizeLlmPayload } from './injection-defense.js';

const MODEL_MAP: Record<ModelTier, string> = {
  extraction: 'claude-3-5-haiku-20241022',
  planner: 'claude-3-5-sonnet-20241022',
};

const RATES: Record<string, { inRate: number; outRate: number }> = {
  'claude-3-5-haiku-20241022': { inRate: 6800, outRate: 34000 },
  'claude-3-5-sonnet-20241022': { inRate: 25500, outRate: 127500 },
};

const DEFAULT_RATE = { inRate: 6800, outRate: 34000 };

function calculateCostMinor(model: string, promptTokens: number, completionTokens: number): number {
  const rate = RATES[model] ?? DEFAULT_RATE;
  const inCost = (promptTokens * rate.inRate) / 1_000_000;
  const outCost = (completionTokens * rate.outRate) / 1_000_000;
  return Math.ceil(inCost + outCost);
}

function buildAnthropicTool<T>(options: LlmCallOptions<T>): Anthropic.Tool {
  const jsonSchema = zodToJsonSchema(options.tool.schema, options.tool.name);
  const toolInputSchema = (jsonSchema.definitions?.[options.tool.name] ??
    jsonSchema) as Anthropic.Tool.InputSchema;

  const toolDef: Anthropic.Tool = {
    name: options.tool.name,
    description: options.tool.description,
    input_schema: toolInputSchema,
  };

  if (options.cachePrompt !== false) {
    (toolDef as unknown as { cache_control: { type: string } }).cache_control = {
      type: 'ephemeral',
    };
  }
  return toolDef;
}

function extractToolUseBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use') {
      return block;
    }
  }
  return null;
}

function parseAndValidate<T>(
  toolUseBlock: Anthropic.ToolUseBlock,
  schema: LlmCallOptions<T>['tool']['schema'],
): T {
  const parsed = schema.safeParse(toolUseBlock.input);
  if (!parsed.success) {
    throw validationError(
      `LLM output schema validation failed: ${JSON.stringify(parsed.error.issues)}`,
    );
  }
  return sanitizeLlmPayload<T>(parsed.data);
}

export class AnthropicClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!key) {
      throw internalError('ANTHROPIC_API_KEY is required for live LLM mode.');
    }
    this.client = new Anthropic({ apiKey: key });
  }

  async callTool<T>(options: LlmCallOptions<T>): Promise<LlmCallResult<T>> {
    const tier = options.modelTier ?? 'extraction';
    const model = MODEL_MAP[tier];
    const systemPrompt =
      `${INJECTION_DEFENSE_SYSTEM_INSTRUCTION}\n\n${options.systemPrompt}`.trim();
    const toolDef = buildAnthropicTool(options);

    const startTime = Date.now();
    const message = await this.client.messages.create(
      {
        model,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            ...(options.cachePrompt !== false ? { cache_control: { type: 'ephemeral' } } : {}),
          },
        ],
        tools: [toolDef],
        tool_choice: { type: 'tool', name: options.tool.name },
        messages: [{ role: 'user', content: options.userPrompt }],
      },
      { signal: options.signal },
    );

    const durationMs = Date.now() - startTime;
    const toolUse = extractToolUseBlock(message);
    if (!toolUse) {
      throw internalError('Anthropic response did not contain forced tool execution.');
    }

    const validatedData = parseAndValidate(toolUse, options.tool.schema);
    const usage: LlmUsageStats = {
      promptTokens: message.usage.input_tokens,
      completionTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      estimatedCostMinor: calculateCostMinor(
        model,
        message.usage.input_tokens,
        message.usage.output_tokens,
      ),
      latencyMs: durationMs,
      model,
    };

    return { data: validatedData, usage };
  }
}
