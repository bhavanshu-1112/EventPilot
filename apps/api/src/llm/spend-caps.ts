import crypto from 'node:crypto';
import { sql } from 'kysely';
import { rateLimitedError } from '@eventpilot/shared';
import type { DbClient } from '../db/client.js';
import type { LlmUsageStats, LlmPurpose } from './types.js';

export const DEFAULT_MAX_CALLS_PER_EVENT_HOUR = 50;
export const DEFAULT_DAILY_TOKEN_CAP = 500_000;

async function checkHourlyLimit(db: DbClient, eventId: string, maxPerHour: number): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const hourlyRes = await db
    .selectFrom('llm_usage')
    .select(db.fn.count<number>('id').as('count'))
    .where('event_id', '=', eventId)
    .where('created_at', '>=', oneHourAgo)
    .executeTakeFirst();

  const hourlyCalls = Number(hourlyRes?.count ?? 0);
  if (hourlyCalls >= maxPerHour) {
    throw rateLimitedError(3600);
  }
}

async function checkDailyTokenLimit(db: DbClient, maxDaily: number): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dailyRes = await db
    .selectFrom('llm_usage')
    .select(sql<string>`COALESCE(SUM(total_tokens), 0)`.as('sum_tokens'))
    .where('created_at', '>=', oneDayAgo)
    .executeTakeFirst();

  const totalDailyTokens = Number(dailyRes?.sum_tokens ?? 0);
  if (totalDailyTokens >= maxDaily) {
    throw rateLimitedError(86400);
  }
}

export async function checkSpendCaps(
  db: DbClient,
  eventId?: string,
  options: { maxPerHour?: number; maxDailyTokens?: number } = {},
): Promise<void> {
  const maxPerHour = options.maxPerHour ?? DEFAULT_MAX_CALLS_PER_EVENT_HOUR;
  const maxDaily = options.maxDailyTokens ?? DEFAULT_DAILY_TOKEN_CAP;

  if (eventId) {
    await checkHourlyLimit(db, eventId, maxPerHour);
  }
  await checkDailyTokenLimit(db, maxDaily);
}

export async function recordLlmUsage(
  db: DbClient,
  eventId: string | undefined,
  purpose: LlmPurpose,
  usage: LlmUsageStats,
): Promise<void> {
  try {
    await db
      .insertInto('llm_usage')
      .values({
        id: crypto.randomUUID(),
        event_id: eventId ?? null,
        purpose,
        model: usage.model,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
        estimated_cost_minor: usage.estimatedCostMinor,
        created_at: new Date() as unknown as Date,
      })
      .execute();
  } catch (err) {
    // Non-fatal if usage logging fails in test/mock environment
    console.error('Failed to log LLM usage:', err);
  }
}
