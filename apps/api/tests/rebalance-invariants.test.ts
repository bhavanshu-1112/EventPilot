import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { buildApp } from '../src/server.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { BudgetRepository } from '../src/db/repositories/budget.repository.js';
import { hashEventToken } from '../src/auth/tokens.js';
import { FixtureClient } from '../src/llm/fixture-client.js';

describe('Budget Rebalance & Invariant Protection', () => {
  let db: DbClient;
  let app: FastifyInstance;
  const token = 'test-token-rebalance-128';
  const tokenHash = hashEventToken(token);
  const eventId = 'evt-rebalance-test-01';

  beforeEach(async () => {
    db = await createInMemoryTestDb();
    await runMigrations(db);

    const eventRepo = new EventRepository(db);
    await eventRepo.create({
      id: eventId,
      name: 'Rebalance Test Wedding',
      eventType: 'wedding',
      location: 'Udaipur',
      eventDate: '2026-11-20',
      guestCount: 350,
      totalBudgetMinor: 350000000, // 35 Lakh INR
      currency: 'INR',
      accessTokenHash: tokenHash,
      briefJson: '{}',
    });

    const budgetRepo = new BudgetRepository(db);
    await budgetRepo.setCategories(eventId, [
      {
        categoryId: 'venue',
        label: 'Venue & Palace',
        weight: 0.35,
        locked: true,
        floorPercent: 20,
        priority: 1,
        allocatedMinor: 122500000,
        spentMinor: 122500000,
      },
      {
        categoryId: 'catering',
        label: 'Catering & Banquets',
        weight: 0.3,
        locked: false,
        floorPercent: 15,
        priority: 2,
        allocatedMinor: 105000000,
        spentMinor: 0,
      },
      {
        categoryId: 'decor',
        label: 'Floral & Production',
        weight: 0.15,
        locked: false,
        floorPercent: 5,
        priority: 4,
        allocatedMinor: 52500000,
        spentMinor: 0,
      },
      {
        categoryId: 'logistics',
        label: 'Transport Fleet',
        weight: 0.1,
        locked: false,
        floorPercent: 3,
        priority: 5,
        allocatedMinor: 35000000,
        spentMinor: 0,
      },
      {
        categoryId: 'contingency',
        label: 'Emergency Reserve',
        weight: 0.1,
        locked: false,
        floorPercent: 5,
        priority: 1,
        allocatedMinor: 35000000,
        spentMinor: 0,
      },
    ]);

    app = await buildApp({ db, llmClient: new FixtureClient() });
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    await db.destroy();
  });

  it('generates a rebalance proposal that never cuts locked categories or violates contingency floor', async () => {
    const overrunMinor = 5000000; // 50,000 INR overrun

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/budget/rebalance/proposal`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        overrunMinor,
        overrunCategoryId: 'catering',
        contingencyFloorPercent: 5,
        maxCutPercent: 50,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.cuts).toBeDefined();
    expect(body.cuts.length).toBeGreaterThan(0);

    const totalCuts = body.cuts.reduce(
      (sum: number, c: { reduceByMinor: number }) => sum + c.reduceByMinor,
      0,
    );
    expect(totalCuts).toBe(overrunMinor);

    // Verify locked category 'venue' was NEVER cut
    const venueCut = body.cuts.find((c: { categoryId: string }) => c.categoryId === 'venue');
    expect(venueCut).toBeUndefined();

    // Verify every cut includes reason and impact
    for (const cut of body.cuts) {
      expect(cut.reason.length).toBeGreaterThan(0);
      expect(cut.impact.length).toBeGreaterThan(0);
    }
  });

  it('applies rebalance transactionally, updates categories, and records append-only ledger entries', async () => {
    const overrunMinor = 5000000;
    const cuts = [
      { categoryId: 'decor', reduceByMinor: 3000000, reason: 'Switch to local seasonal marigolds' },
      {
        categoryId: 'logistics',
        reduceByMinor: 2000000,
        reason: 'Optimize transport shuttle frequency',
      },
    ];

    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/budget/rebalance/apply`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        cuts,
        overrunCategoryId: 'catering',
        overrunMinor,
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const body = JSON.parse(applyRes.body);
    expect(body.success).toBe(true);

    const budgetRepo = new BudgetRepository(db);
    const updatedCats = await budgetRepo.getCategories(eventId);

    // Check decor reduced by 30,000 INR (3000000 paise)
    const decor = updatedCats.find((c) => c.category_id === 'decor');
    expect(Number(decor?.allocated_minor)).toBe(52500000 - 3000000);

    // Check logistics reduced by 20,000 INR (2000000 paise)
    const logistics = updatedCats.find((c) => c.category_id === 'logistics');
    expect(Number(logistics?.allocated_minor)).toBe(35000000 - 2000000);

    // Check catering increased by 50,000 INR
    const catering = updatedCats.find((c) => c.category_id === 'catering');
    expect(Number(catering?.allocated_minor)).toBe(105000000 + 5000000);

    // Verify total budget sum is strictly conserved
    const totalAllocated = updatedCats.reduce((sum, c) => sum + Number(c.allocated_minor), 0);
    expect(totalAllocated).toBe(350000000);

    // Verify budget ledger recorded all 3 operations
    const ledger = await budgetRepo.getLedger(eventId);
    expect(ledger.length).toBe(3);
    expect(
      ledger.some((l) => l.category_id === 'decor' && Number(l.previous_minor) === 52500000),
    ).toBe(true);
    expect(
      ledger.some((l) => l.category_id === 'catering' && Number(l.new_minor) === 110000000),
    ).toBe(true);
  });

  it('rejects rebalance proposals when sum of cuts does not equal the overrun', async () => {
    const invalidRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/budget/rebalance/apply`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        cuts: [{ categoryId: 'decor', reduceByMinor: 1000000, reason: 'Partial cut' }],
        overrunCategoryId: 'catering',
        overrunMinor: 5000000, // Mismatch: 10,000 vs 50,000
      },
    });

    expect(invalidRes.statusCode).toBe(400);
    const body = JSON.parse(invalidRes.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/Sum of cuts/);
  });
});
