import { zodToJsonSchema } from 'zod-to-json-schema';
import { validationError, internalError } from '@eventpilot/shared';
import type { LlmClient, LlmCallOptions, LlmCallResult, LlmUsageStats } from './types.js';
import { INJECTION_DEFENSE_SYSTEM_INSTRUCTION, sanitizeLlmPayload } from './injection-defense.js';

export const DEFAULT_GEMINI_CHAIN = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

function cleanGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(cleanGeminiSchema);
  }
  if (schema !== null && typeof schema === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(schema)) {
      if (key === 'additionalProperties' || key === '$schema' || key === '$ref') {
        continue;
      }
      cleaned[key] = cleanGeminiSchema(val);
    }
    return cleaned;
  }
  return schema;
}

interface GeminiFunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
    role?: string;
  };
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

function parseAndValidate<T>(rawArgs: unknown, schema: LlmCallOptions<T>['tool']['schema']): T {
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    throw validationError(
      `Gemini LLM output schema validation failed: ${JSON.stringify(parsed.error.issues)}`,
    );
  }
  return sanitizeLlmPayload<T>(parsed.data);
}

function buildGeminiRequestBody<T>(options: LlmCallOptions<T>) {
  const rawSchema = zodToJsonSchema(options.tool.schema, { target: 'openApi3' });
  const cleanedSchema = cleanGeminiSchema(rawSchema);

  const systemInstructionText =
    `${INJECTION_DEFENSE_SYSTEM_INSTRUCTION}\n\n${options.systemPrompt}`.trim();

  return {
    system_instruction: {
      parts: [{ text: systemInstructionText }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: options.userPrompt }],
      },
    ],
    tools: [
      {
        functionDeclarations: [
          {
            name: options.tool.name,
            description: options.tool.description,
            parameters: cleanedSchema,
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [options.tool.name],
      },
    },
  };
}

function parseJsonTextPart(parts: GeminiPart[]): unknown {
  const textPart = parts.find((p) => p.text)?.text;
  if (!textPart) {
    throw internalError('Gemini response contained neither functionCall nor parsable JSON text.');
  }
  try {
    return JSON.parse(textPart);
  } catch {
    throw internalError('Gemini text part could not be parsed as JSON.');
  }
}

function extractRawPayload(data: GeminiResponse): unknown {
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw internalError('Gemini API response did not contain candidates or content parts.');
  }

  const funcCall = parts.find((p) => p.functionCall)?.functionCall;
  if (funcCall?.args) {
    return funcCall.args;
  }

  return parseJsonTextPart(parts);
}

async function handleHttpError(res: Response, model: string): Promise<never> {
  const errJson = (await res.json().catch(() => ({}))) as GeminiResponse;
  const msg = errJson.error?.message || res.statusText;
  throw new Error(`Gemini model ${model} HTTP ${res.status}: ${msg}`);
}

function buildUsageStats(data: GeminiResponse, model: string, durationMs: number): LlmUsageStats {
  const promptTokens = data.usageMetadata?.promptTokenCount ?? 100;
  const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 50;
  return {
    promptTokens,
    completionTokens,
    totalTokens: data.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens,
    estimatedCostMinor: 1,
    latencyMs: durationMs,
    model,
  };
}

export class GeminiClient implements LlmClient {
  private readonly apiKey: string;
  private readonly modelChain: string[];

  constructor(apiKey?: string, modelChain?: string[]) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];

    if (!key) {
      throw internalError('GEMINI_API_KEY is required for Gemini live LLM mode.');
    }
    this.apiKey = key;

    const primary = process.env['GEMINI_MODEL'] ?? DEFAULT_GEMINI_CHAIN[0];
    const fallback1 = process.env['GEMINI_FALLBACK_MODEL'] ?? DEFAULT_GEMINI_CHAIN[1];
    const fallback2 = process.env['GEMINI_FALLBACK_MODEL_2'] ?? DEFAULT_GEMINI_CHAIN[2];

    this.modelChain = modelChain ?? [primary, fallback1, fallback2];
  }

  private async trySingleModel<T>(
    model: string,
    options: LlmCallOptions<T>,
    requestBody: unknown,
  ): Promise<LlmCallResult<T>> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 8000);

    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onCallerAbort);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        await handleHttpError(res, model);
      }

      const data = (await res.json()) as GeminiResponse;
      const rawPayload = extractRawPayload(data);
      const validatedData = parseAndValidate(rawPayload, options.tool.schema);
      const durationMs = Date.now() - startTime;
      const usage = buildUsageStats(data, model, durationMs);

      return { data: validatedData, usage };
    } finally {
      clearTimeout(timeoutTimer);
      options.signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  async callTool<T>(options: LlmCallOptions<T>): Promise<LlmCallResult<T>> {
    const requestBody = buildGeminiRequestBody(options);
    const errors: string[] = [];

    for (const model of this.modelChain) {
      try {
        return await this.trySingleModel(model, options, requestBody);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${model} -> ${msg}`);
      }
    }

    throw internalError(`All models in the Gemini chain failed:\n${errors.join('\n')}`);
  }
}
