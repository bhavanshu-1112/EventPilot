import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { buildApp } from '../src/server.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { QuoteRepository } from '../src/db/repositories/quote.repository.js';
import { hashEventToken } from '../src/auth/tokens.js';
import { FixtureClient } from '../src/llm/fixture-client.js';

describe('No N+1 Database Queries on Quote Comparison Endpoint', () => {
  let db: DbClient;
  let app: FastifyInstance;
  const token = 'test-token-compare-queries-128';
  const tokenHash = hashEventToken(token);
  const eventId = 'evt-compare-queries-01';

  beforeEach(async () => {
    db = await createInMemoryTestDb();
    await runMigrations(db);

    const eventRepo = new EventRepository(db);
    await eventRepo.create({
      id: eventId,
      name: 'Query Count Test Event',
      eventType: 'wedding',
      location: 'Udaipur',
      eventDate: '2026-11-20',
      guestCount: 350,
      totalBudgetMinor: 350000000,
      currency: 'INR',
      accessTokenHash: tokenHash,
      briefJson: '{}',
    });

    const quoteRepo = new QuoteRepository(db);

    // Create 10 distinct quotes, each with 3 line items and 2 flags
    for (let i = 1; i <= 10; i++) {
      await quoteRepo.create(eventId, {
        vendorName: `Caterer Vendor ${String(i)}`,
        category: 'catering',
        currency: 'INR',
        statedTotalMinor: 100000000 + i * 1000000,
        status: 'extracted',
        confidence: 0.9,
        lineItems: [
          {
            description: 'Buffet Item A',
            quantity: 350,
            unit: 'guest',
            unitPriceMinor: 200000,
            totalMinor: 70000000,
            taxIncluded: false,
          },
          {
            description: 'Chaat Item B',
            quantity: 350,
            unit: 'guest',
            unitPriceMinor: 50000,
            totalMinor: 17500000,
            taxIncluded: false,
          },
          {
            description: 'Dessert Item C',
            quantity: 1,
            unit: 'setup',
            unitPriceMinor: 10000000,
            totalMinor: 10000000,
            taxIncluded: true,
          },
        ],
        flags: [
          {
            ruleId: 'TAX_EXCLUDED',
            severity: 'warning',
            message: 'GST excluded',
            explanation: 'Needs clarification',
          },
          {
            ruleId: 'SERVICE_CHARGE_MISSING',
            severity: 'warning',
            message: 'Service charge missing',
            explanation: 'Add service fee',
          },
        ],
      });
    }

    app = await buildApp({ db, llmClient: new FixtureClient() });
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    await db.destroy();
  });

  it('proves that comparing 10 quotes runs in a bounded O(1) query count (no N+1 queries)', async () => {
    let queryCount = 0;
    const originalExecute = db.executeQuery.bind(db);

    vi.spyOn(db, 'executeQuery').mockImplementation(async (compiledQuery) => {
      queryCount++;
      return originalExecute(compiledQuery);
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventId}/quotes/compare?category=catering`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.quotes.length).toBe(10);

    // 1 query for auth lookup
    // 1 query for quotes SELECT
    // 1 query for batch line_items SELECT (IN quote_ids)
    // 1 query for batch flags SELECT (IN quote_ids)
    // Total query count must be <= 4, proving zero N+1 queries!
    expect(queryCount).toBeLessThanOrEqual(4);
  });
});
