import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { buildApp } from '../src/server.js';
import { FixtureClient } from '../src/llm/fixture-client.js';
import { IdeaRepository } from '../src/db/repositories/idea.repository.js';

describe('Plan Stage — Brief Parsing, Auto-Seeding & Personalized Ideas', () => {
  let db: DbClient;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = await createInMemoryTestDb();
    await runMigrations(db);

    const fixtureClient = new FixtureClient();
    app = await buildApp({
      db,
      llmClient: fixtureClient,
    });
  });

  afterEach(async () => {
    if (app) await app.close();
    if (db) await db.destroy();
  });

  it('parses free-text event brief into structured parameters via LLM parse_brief', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/events/parse-brief',
      payload: {
        brief:
          '3-day royal destination wedding in Udaipur with 350 guests and 3.5 Crore INR budget. Mehendi, Sangeet and Reception.',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.brief.eventType).toBe('wedding');
    expect(body.brief.city).toBe('Udaipur');
    expect(body.brief.guestCount).toBe(350);
    expect(body.brief.budgetMinor).toBe(350000000);
    expect(body.brief.currency).toBe('INR');
    expect(body.brief.ceremonies.length).toBeGreaterThanOrEqual(1);
  });

  it('supports all three event types (wedding, birthday, community) with budget allocation and checklists', async () => {
    const eventTypes = [
      {
        type: 'wedding',
        name: 'Royal Lake Pichola Wedding',
        budgetMinor: 350000000,
        expectedCategoryCount: 8,
        expectedChecklistRole: 'couple',
      },
      {
        type: 'birthday',
        name: '50th Milestone Birthday Gala',
        budgetMinor: 40000000,
        expectedCategoryCount: 6,
        expectedChecklistRole: 'host',
      },
      {
        type: 'community',
        name: 'Udaipur Heritage Cultural Festival',
        budgetMinor: 80000000,
        expectedCategoryCount: 6,
        expectedChecklistRole: 'lead',
      },
    ];

    for (const et of eventTypes) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: {
          name: et.name,
          eventType: et.type,
          location: 'Udaipur, Rajasthan',
          eventDate: '2026-11-20',
          guestCount: 200,
          totalBudgetMinor: et.budgetMinor,
          currency: 'INR',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.event.eventType).toBe(et.type);

      // 1. Budget categories allocated deterministically
      const budgetCategories = body.budget;
      expect(budgetCategories.length).toBe(et.expectedCategoryCount);

      // Verify contingency floor is kept
      const contingency = budgetCategories.find(
        (c: { category_id: string }) => c.category_id === 'contingency',
      );
      expect(contingency).toBeDefined();
      expect(Number(contingency.allocated_minor)).toBeGreaterThanOrEqual(
        Math.floor(et.budgetMinor * 0.05),
      );

      // Sum of categories equals total budget exactly (money conservation invariant)
      const allocatedSum = budgetCategories.reduce(
        (sum: number, c: { allocated_minor: string | number }) => sum + Number(c.allocated_minor),
        0,
      );
      expect(allocatedSum).toBe(et.budgetMinor);

      // 2. Checklist items generated with relative due dates
      const checklist = body.checklist;
      expect(checklist.length).toBeGreaterThan(0);
      for (const item of checklist) {
        expect(item.days_before_event).toBeDefined();
        expect(item.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(item.status).toBe('needed');
      }
    }
  });

  it('generates personalized ideas and strictly validates them against remaining budget', async () => {
    // Create an event with 35 Lakh INR budget
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      payload: {
        name: 'Lake Pichola Royal Wedding',
        eventType: 'wedding',
        location: 'Udaipur, Rajasthan',
        eventDate: '2026-11-20',
        guestCount: 350,
        totalBudgetMinor: 350000000,
        currency: 'INR',
        brief: { vibe: ['royal', 'heritage'] },
      },
    });

    const { event, accessToken } = createRes.json();

    // 1. Generate ideas
    const ideasRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/ideas`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(ideasRes.statusCode).toBe(201);
    const ideasBody = ideasRes.json();
    expect(ideasBody.ideas.length).toBeGreaterThanOrEqual(3);

    for (const idea of ideasBody.ideas) {
      expect(idea).toHaveProperty('title');
      expect(idea).toHaveProperty('whyFits');
      expect(idea.status).toBe('suggested');
      // Must not exceed total budget
      expect(idea.estimatedCostMinor).toBeLessThanOrEqual(350000000);
    }

    // 2. Accept an idea into the plan
    const firstIdea = ideasBody.ideas[0];
    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/ideas/${firstIdea.id}/accept`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(acceptRes.statusCode).toBe(200);
    const acceptBody = acceptRes.json();
    expect(acceptBody.success).toBe(true);
    expect(acceptBody.idea.status).toBe('accepted');

    // Verify DB reflection
    const ideaRepo = new IdeaRepository(db);
    const savedIdeas = await ideaRepo.getIdeas(event.id);
    const acceptedInDb = savedIdeas.find((i) => i.id === firstIdea.id);
    expect(acceptedInDb?.status).toBe('accepted');
  });
});
