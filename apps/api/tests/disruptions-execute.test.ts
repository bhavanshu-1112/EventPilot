import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { buildApp } from '../src/server.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { ScheduleRepository } from '../src/db/repositories/schedule.repository.js';
import { NotificationRepository } from '../src/db/repositories/notification.repository.js';
import { hashEventToken } from '../src/auth/tokens.js';
import { FixtureClient } from '../src/llm/fixture-client.js';

describe('Execute Stage — Schedule Disruptions & Fix Proposals', () => {
  let db: DbClient;
  let app: FastifyInstance;
  const token = 'test-token-execute-128';
  const tokenHash = hashEventToken(token);
  const eventId = 'evt-execute-test-01';

  beforeEach(async () => {
    db = await createInMemoryTestDb();
    await runMigrations(db);

    const eventRepo = new EventRepository(db);
    await eventRepo.create({
      id: eventId,
      name: 'Udaipur Grand Royal Wedding',
      eventType: 'wedding',
      location: 'Udaipur, Rajasthan',
      eventDate: '2026-11-22',
      guestCount: 350,
      totalBudgetMinor: 350000000,
      currency: 'INR',
      accessTokenHash: tokenHash,
      briefJson: JSON.stringify({ vibe: 'royal' }),
    });

    const scheduleRepo = new ScheduleRepository(db);
    await scheduleRepo.setItems(eventId, [
      {
        id: 'cake',
        label: 'Grand Wedding Cake Cutting',
        startMin: 1200, // 20:00
        durationMin: 30,
        fixed: false,
        bufferMin: 15,
        vendor: 'Artisan Bakes',
        guestVisible: true,
        priority: 2,
        dependsOn: [],
      },
      {
        id: 'photos',
        label: 'Family & Dignitary Photoshoot',
        startMin: 1245, // 20:45
        durationMin: 30,
        fixed: false,
        bufferMin: 10,
        vendor: 'Lumiere Studios',
        guestVisible: true,
        priority: 3,
        dependsOn: [],
      },
      {
        id: 'dinner',
        label: 'Royal Dinner Banquet',
        startMin: 1285, // 21:25
        durationMin: 90,
        fixed: true, // Fixed ceremony time
        bufferMin: 0,
        vendor: 'Royal Caterers',
        guestVisible: true,
        priority: 1,
        dependsOn: ['cake', 'photos'],
      },
    ]);

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

  it('parses spoken disruption, computes ripple through DAG, and ranks fix options', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/disruptions`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        transcript: 'the cake is delayed by an hour due to traffic congestion',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // 1. Disruption parsed via LLM tool
    expect(body.disruption.delayMin).toBe(60);
    expect(body.disruption.itemId).toBe('cake');
    expect(body.disruption.needsClarification).toBe(false);

    // 2. Ripple calculated through DAG: dinner is fixed at 1285, delaying cake by 60 pushes it to 1260 + 30 + 15 = 1305 > 1285
    expect(body.ripple).toBeDefined();
    expect(body.ripple.conflicts.length).toBeGreaterThan(0);
    expect(body.ripple.conflicts[0].fixedItemId).toBe('dinner');

    // 3. Fix options scored and ranked
    expect(body.fixOptions.length).toBeGreaterThan(0);
    const topFix = body.fixOptions[0];
    expect(topFix).toHaveProperty('label');
    expect(topFix).toHaveProperty('operations');
    expect(topFix).toHaveProperty('rationale');
    expect(topFix).toHaveProperty('score');

    // 4. Draft notifications ready for review
    expect(body.draftNotifications.length).toBeGreaterThan(0);
    expect(body.draftNotifications[0]).toHaveProperty('recipient');
    expect(body.draftNotifications[0]).toHaveProperty('body');
  });

  it('applies fix atomically, updates schedule times, and stages outbox notifications', async () => {
    // Apply a swap fix: cake <-> photos
    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/disruptions/apply-fix`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        operations: [{ op: 'swap', itemId: 'cake', swapWithId: 'photos' }],
        notify: true,
        notifications: [
          {
            recipient: '+919876543210',
            channel: 'whatsapp',
            body: 'Cake cutting moved to 20:45. Photoshoot now at 20:00.',
          },
        ],
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const applyBody = applyRes.json();
    expect(applyBody.success).toBe(true);

    // Verify schedule times in DB
    const scheduleRepo = new ScheduleRepository(db);
    const updatedItems = await scheduleRepo.getItems(eventId);
    const cakeItem = updatedItems.find((i) => i.id === 'cake');
    const photosItem = updatedItems.find((i) => i.id === 'photos');

    // Start times were swapped: cake is now at 1245, photos at 1200
    expect(cakeItem?.start_min).toBe(1245);
    expect(photosItem?.start_min).toBe(1200);

    // Verify outbox notification staged
    const notifRepo = new NotificationRepository(db);
    const outbox = await notifRepo.getNotifications(eventId);
    expect(outbox.length).toBe(1);
    expect(outbox[0]?.recipient).toBe('+919876543210');
    expect(outbox[0]?.channel).toBe('whatsapp');
    expect(outbox[0]?.status).toBe('draft');
  });

  it('prevents IDOR: Event A cannot disrupt or modify schedule of Event B', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/events/evt-other-unauthorized/disruptions',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        delayMin: 30,
        itemId: 'cake',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
