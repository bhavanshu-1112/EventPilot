import { z } from 'zod';

/**
 * Environment variable schema. Validated on boot — fails fast with clear errors.
 * All secrets come from env, never hard-coded.
 */
export const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),

  // Redis
  REDIS_URL: z.string().url().describe('Redis connection string'),

  // Server
  PORT: z.coerce.number().int().positive().default(3000).describe('HTTP port'),
  HOST: z.string().default('0.0.0.0').describe('Bind host'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173').describe('Allowed CORS origin'),

  // LLM
  LLM_PROVIDER: z.enum(['gemini', 'anthropic']).default('gemini'),
  GEMINI_API_KEY: z.string().default('').describe('Gemini API key'),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_FALLBACK_MODEL_2: z.string().default('gemini-2.5-flash-lite'),
  ANTHROPIC_API_KEY: z.string().default('').describe('Anthropic API key (optional)'),
  LLM_MODE: z.enum(['live', 'fixture']).default('fixture').describe('LLM mode'),
  LLM_MODEL_PLANNER: z.string().default('gemini-3.8-flash'),
  LLM_MODEL_EXTRACT: z.string().default('gemini-3.8-flash'),
  LLM_MAX_CALLS_PER_EVENT_PER_HOUR: z.coerce.number().int().positive().default(100),
  LLM_DAILY_TOKEN_CAP: z.coerce.number().int().positive().default(1_000_000),
  LLM_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Notifications
  NOTIFY_MODE: z.enum(['dry-run', 'twilio']).default('dry-run'),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_FROM_NUMBER: z.string().default(''),
  NOTIFY_ALLOWLIST: z.string().default('').describe('Comma-separated allowed phone numbers'),

  // Uploads
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_DOC_SIZE_MB: z.coerce.number().positive().default(10),
  MAX_IMAGE_SIZE_MB: z.coerce.number().positive().default(5),

  // Rate limiting
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_LLM_PER_MINUTE: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_UPLOAD_PER_MINUTE: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables. Throws on invalid config.
 */
export function parseEnv(raw: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return result.data;
}
