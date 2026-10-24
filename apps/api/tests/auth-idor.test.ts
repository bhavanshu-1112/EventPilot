import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  ANTHROPIC_API_KEY: 'sk-ant-test-placeholder',
  LLM_MODE: 'fixture',
  NOTIFY_MODE: 'dry-run',
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
};

describe('Auth & IDOR Prevention on All Routes', () => {
  let db: DbClient;
  let app: FastifyInstance;
  let eventA: { id: string; accessToken: string };
  let eventB: { id: string; accessToken: string };

  beforeEach(async () => {
    db = await createInMemoryTestDb();
    await runMigrations(db);

    app = await buildApp({
      rawEnv: TEST_ENV,
      db,
    });

    // Create Event A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      payload: {
        name: 'Wedding Udaipur',
        eventType: 'wedding',
        location: 'Udaipur, Rajasthan',
        eventDate: '2026-11-20',
        guestCount: 250,
        totalBudgetMinor: 500000000,
        currency: 'INR',
      },
    });
    expect(resA.statusCode).toBe(201);
    const bodyA = JSON.parse(resA.body);
    eventA = { id: bodyA.event.id, accessToken: bodyA.accessToken };

    // Create Event B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      payload: {
        name: 'Birthday Party',
        eventType: 'birthday',
        location: 'Bengaluru, Karnataka',
        eventDate: '2026-12-15',
        guestCount: 50,
        totalBudgetMinor: 50000000,
        currency: 'INR',
      },
    });
    expect(resB.statusCode).toBe(201);
    const bodyB = JSON.parse(resB.body);
    eventB = { id: bodyB.event.id, accessToken: bodyB.accessToken };
  });

  afterEach(async () => {
    await app.close();
    await db.destroy();
  });

  it('allows Event A token to access Event A resources', async () => {
    // Read Event A
    const resGet = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventA.id}`,
      headers: { authorization: `Bearer ${eventA.accessToken}` },
    });
    expect(resGet.statusCode).toBe(200);
    expect(JSON.parse(resGet.body).event.id).toBe(eventA.id);

    // Update Event A
    const resPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/events/${eventA.id}`,
      headers: { authorization: `Bearer ${eventA.accessToken}` },
      payload: { name: 'Updated Wedding Udaipur' },
    });
    expect(resPatch.statusCode).toBe(200);

    // Get Budget
    const resBudget = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventA.id}/budget`,
      headers: { authorization: `Bearer ${eventA.accessToken}` },
    });
    expect(resBudget.statusCode).toBe(200);

    // Put Budget Categories
    const resPutBudget = await app.inject({
      method: 'PUT',
      url: `/api/v1/events/${eventA.id}/budget`,
      headers: { authorization: `Bearer ${eventA.accessToken}` },
      payload: {
        categories: [
          {
            categoryId: 'venue',
            label: 'Venue & Stay',
            weight: 0.35,
            allocatedMinor: 175000000,
          },
        ],
      },
    });
    expect(resPutBudget.statusCode).toBe(200);

    // Get Schedule
    const resSched = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventA.id}/schedule`,
      headers: { authorization: `Bearer ${eventA.accessToken}` },
    });
    expect(resSched.statusCode).toBe(200);

    // Get Checklist
    const resCheck = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventA.id}/checklist`,
      headers: { authorization: `Bearer ${eventA.accessToken}` },
    });
    expect(resCheck.statusCode).toBe(200);

    // Quotes compare
    const resQuotes = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventA.id}/quotes/compare`,
      headers: { authorization: `Bearer ${eventA.accessToken}` },
    });
    expect(resQuotes.statusCode).toBe(200);

    // Inspiration
    const resInsp = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventA.id}/inspiration`,
      headers: { authorization: `Bearer ${eventA.accessToken}` },
    });
    expect(resInsp.statusCode).toBe(200);

    // Notifications
    const resNotif = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventA.id}/notifications`,
      headers: { authorization: `Bearer ${eventA.accessToken}` },
    });
    expect(resNotif.statusCode).toBe(200);
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    // Missing Authorization header
    const res1 = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventA.id}`,
    });
    expect(res1.statusCode).toBe(401);
    expect(JSON.parse(res1.body).error.code).toBe('UNAUTHORIZED');

    // Invalid/malformed token
    const res2 = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventA.id}`,
      headers: { authorization: 'Bearer totally-invalid-token' },
    });
    expect(res2.statusCode).toBe(401);
    expect(JSON.parse(res2.body).error.code).toBe('UNAUTHORIZED');
  });

  it('prevents IDOR: Event A token returns 403 Forbidden when accessing Event B on all routes', async () => {
    const routes = [
      { method: 'GET' as const, url: `/api/v1/events/${eventB.id}` },
      { method: 'PATCH' as const, url: `/api/v1/events/${eventB.id}`, payload: { name: 'Hacked' } },
      { method: 'GET' as const, url: `/api/v1/events/${eventB.id}/budget` },
      {
        method: 'PUT' as const,
        url: `/api/v1/events/${eventB.id}/budget`,
        payload: {
          categories: [{ categoryId: 'venue', label: 'Venue', weight: 0.5, allocatedMinor: 100 }],
        },
      },
      { method: 'GET' as const, url: `/api/v1/events/${eventB.id}/budget/ledger` },
      { method: 'GET' as const, url: `/api/v1/events/${eventB.id}/schedule` },
      { method: 'GET' as const, url: `/api/v1/events/${eventB.id}/checklist` },
      {
        method: 'PATCH' as const,
        url: `/api/v1/events/${eventB.id}/checklist/item-test`,
        payload: { status: 'booked' },
      },
      { method: 'GET' as const, url: `/api/v1/events/${eventB.id}/quotes/compare` },
      { method: 'GET' as const, url: `/api/v1/events/${eventB.id}/inspiration` },
      { method: 'GET' as const, url: `/api/v1/events/${eventB.id}/notifications` },
    ];

    for (const route of routes) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        headers: { authorization: `Bearer ${eventA.accessToken}` }, // Token for A, URL for B
        ...(route.payload ? { payload: route.payload } : {}),
      });

      expect(
        res.statusCode,
        `Expected 403 FORBIDDEN for ${route.method} ${route.url} but got ${res.statusCode}`,
      ).toBe(403);

      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('FORBIDDEN');
    }
  });
});
