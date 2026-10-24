import crypto from 'node:crypto';
import type { LlmCallResult, LlmPurpose } from './types.js';

interface CacheEntry<T> {
  result: LlmCallResult<T>;
  expiresAt: number;
}

export class LlmResponseCache {
  private readonly memoryCache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs = 24 * 60 * 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  private computeKey(purpose: LlmPurpose, contentHash: string): string {
    return crypto.createHash('sha256').update(`${purpose}:${contentHash}`).digest('hex');
  }

  get<T>(purpose: LlmPurpose, contentHash: string | undefined): LlmCallResult<T> | null {
    if (!contentHash) return null;
    const key = this.computeKey(purpose, contentHash);
    const entry = this.memoryCache.get(key) as CacheEntry<T> | undefined;

    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    return {
      ...entry.result,
      fromCache: true,
    };
  }

  set<T>(
    purpose: LlmPurpose,
    contentHash: string | undefined,
    result: LlmCallResult<T>,
    ttlMs?: number,
  ): void {
    if (!contentHash) return;
    const key = this.computeKey(purpose, contentHash);
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.memoryCache.set(key, { result, expiresAt });
  }

  clear(): void {
    this.memoryCache.clear();
  }
}
