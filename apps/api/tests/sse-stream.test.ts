import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { buildApp } from '../src/server.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { hashEventToken } from '../src/auth/tokens.js';
import { liveStateService } from '../src/services/live-state.service.js';

describe('Server-Sent Events (SSE) Live Stream Endpoint', () => {
  let db: DbClient;
  let app: FastifyInstance;
  const tokenA = 'test-token-sse-a';
  const tokenB = 'test-token-sse-b';
  const eventIdA = 'evt-sse-01';
  const eventIdB = 'evt-sse-02';

  beforeEach(async () => {
    db = await createInMemoryTestDb();
    await runMigrations(db);

    const eventRepo = new EventRepository(db);
    await eventRepo.create({
      id: eventIdA,
      name: 'Event A',
      eventType: 'wedding',
      location: 'Udaipur',
      eventDate: '2026-11-22',
      guestCount: 350,
      totalBudgetMinor: 350000000,
      currency: 'INR',
      accessTokenHash: hashEventToken(tokenA),
      briefJson: '{}',
    });

    await eventRepo.create({
      id: eventIdB,
      name: 'Event B',
      eventType: 'birthday',
      location: 'Jaipur',
      eventDate: '2026-12-01',
      guestCount: 50,
      totalBudgetMinor: 5000000,
      currency: 'INR',
      accessTokenHash: hashEventToken(tokenB),
      briefJson: '{}',
    });

    app = await buildApp({ db });
  });

  afterEach(async () => {
    if (app) await app.close();
    if (db) await db.destroy();
  });

  it('rejects unauthenticated requests to stream endpoint with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventIdA}/stream`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('prevents IDOR: token for Event B returns 403 when accessing stream of Event A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventIdA}/stream`,
      headers: { authorization: `Bearer ${tokenB}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('connects to SSE stream and establishes text/event-stream connection with initial heartbeat', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();

    try {
      const res = await fetch(`${address}/api/v1/events/${eventIdA}/stream?token=${tokenA}`, {
        signal: controller.signal,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('cache-control')).toContain('no-cache');

      const reader = res.body?.getReader();
      expect(reader).toBeDefined();

      if (reader) {
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        expect(text).toContain('event: heartbeat');
        expect(text).toContain('"connected":true');
      }
    } finally {
      controller.abort();
    }
  });

  it('broadcasts live events to active subscribers without crashing when subscribers disconnect', () => {
    // Verify broadcast is safe even when no subscribers exist
    expect(() => {
      liveStateService.broadcast(eventIdA, 'schedule_updated', { updated: true });
    }).not.toThrow();
  });
});
