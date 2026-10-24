import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { buildApp } from '../src/server.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { NotificationRepository } from '../src/db/repositories/notification.repository.js';
import { hashEventToken } from '../src/auth/tokens.js';

describe('Notification Service, Outbox, and Twilio Webhooks', () => {
  let db: DbClient;
  let app: FastifyInstance;
  const token = 'test-token-notif-128';
  const tokenHash = hashEventToken(token);
  const eventId = 'evt-notif-test-01';
  const twilioAuthToken = 'mock_twilio_secret_token_12345';

  beforeEach(async () => {
    db = await createInMemoryTestDb();
    await runMigrations(db);

    const eventRepo = new EventRepository(db);
    await eventRepo.create({
      id: eventId,
      name: 'Udaipur Royal Wedding',
      eventType: 'wedding',
      location: 'Udaipur, Rajasthan',
      eventDate: '2026-11-22',
      guestCount: 350,
      totalBudgetMinor: 350000000,
      currency: 'INR',
      accessTokenHash: tokenHash,
      briefJson: JSON.stringify({ vibe: 'royal' }),
    });

    app = await buildApp({
      db,
      rawEnv: {
        ...process.env,
        DATABASE_URL: 'postgres://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        NOTIFY_MODE: 'dry-run',
        TWILIO_AUTH_TOKEN: twilioAuthToken,
        NOTIFY_ALLOWLIST: '+919876543210, +919876543211',
      },
    });
  });

  afterEach(async () => {
    if (app) await app.close();
    if (db) await db.destroy();
  });

  it('lists notifications in outbox and sends them in dry-run mode without external calls', async () => {
    const notifRepo = new NotificationRepository(db);
    const staged = await notifRepo.create(eventId, {
      recipient: '+919876543210',
      channel: 'whatsapp',
      body: 'Schedule update: cake cutting adjusted to 20:30.',
      status: 'draft',
      idempotencyKey: 'notif-key-01',
    });

    // 1. List outbox
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventId}/notifications`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.notifications.length).toBe(1);
    expect(listBody.notifications[0].status).toBe('draft');

    // 2. Send outbox notifications
    const sendRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/notifications/send`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { notificationId: staged.id },
    });

    expect(sendRes.statusCode).toBe(200);
    const sendBody = sendRes.json();
    expect(sendBody.results.length).toBe(1);
    expect(sendBody.results[0].status).toBe('sent');
    expect(sendBody.results[0].mode).toBe('dry-run');

    // 3. Verify status updated in DB
    const updated = await notifRepo.getNotifications(eventId);
    expect(updated[0]?.status).toBe('sent');
    expect(updated[0]?.sent_at).not.toBeNull();
  });

  it('enforces idempotency key to prevent duplicate notification sends', async () => {
    const notifRepo = new NotificationRepository(db);
    const notif1 = await notifRepo.create(eventId, {
      recipient: '+919876543210',
      channel: 'sms',
      body: 'Alert: Baraat is starting in 15 minutes',
      idempotencyKey: 'idemp-baraat-15min',
    });

    const notif2 = await notifRepo.create(eventId, {
      recipient: '+919876543210',
      channel: 'sms',
      body: 'Alert: Baraat is starting in 15 minutes',
      idempotencyKey: 'idemp-baraat-15min', // Identical key
    });

    // Same row returned, no duplicate created
    expect(notif1.id).toBe(notif2.id);

    const all = await notifRepo.getNotifications(eventId);
    expect(all.length).toBe(1);
  });

  it('blocks sending to phone numbers not present in NOTIFY_ALLOWLIST when in Twilio mode', async () => {
    const twilioApp = await buildApp({
      db,
      rawEnv: {
        ...process.env,
        DATABASE_URL: 'postgres://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        NOTIFY_MODE: 'twilio',
        TWILIO_ACCOUNT_SID: 'AC_MOCK_12345',
        TWILIO_AUTH_TOKEN: twilioAuthToken,
        TWILIO_FROM_NUMBER: '+15550001111',
        NOTIFY_ALLOWLIST: '+919876543210', // Only this number is allowed
      },
    });

    const notifRepo = new NotificationRepository(db);
    const blockedNotif = await notifRepo.create(eventId, {
      recipient: '+15559998888', // NOT on allowlist
      channel: 'sms',
      body: 'Testing unallowed recipient protection',
      idempotencyKey: 'unallowed-01',
    });

    const res = await twilioApp.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/notifications/send`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { notificationId: blockedNotif.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].error).toContain('RECIPIENT_NOT_IN_ALLOWLIST');
    expect(body.results[0].status).toBe('draft');

    await twilioApp.close();
  });

  it('validates Twilio webhook signatures using HMAC-SHA1 and accepts valid delivery receipts', async () => {
    const notifRepo = new NotificationRepository(db);
    await notifRepo.create(eventId, {
      recipient: '+919876543210',
      channel: 'sms',
      body: 'Wedding reception schedule update',
      status: 'pending',
      idempotencyKey: 'receipt-01',
    });

    const webhookUrl = 'http://localhost/api/v1/webhooks/twilio/status';
    const params: Record<string, string> = {
      MessageSid: 'SM_TEST_MOCK_SID_999',
      MessageStatus: 'delivered',
      To: '+919876543210',
      From: '+15550001111',
    };

    // Calculate valid Twilio signature: HMAC-SHA1(url + sorted_params)
    const sortedKeys = Object.keys(params).sort();
    let dataToSign = webhookUrl;
    for (const key of sortedKeys) {
      dataToSign += `${key}${params[key] ?? ''}`;
    }

    const validSignature = crypto
      .createHmac('sha1', twilioAuthToken)
      .update(Buffer.from(dataToSign, 'utf-8'))
      .digest('base64');

    // 1. Valid signature -> 200 OK
    const validRes = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/twilio/status',
      headers: {
        host: 'localhost',
        'x-twilio-signature': validSignature,
        'content-type': 'application/json',
      },
      payload: params,
    });

    expect(validRes.statusCode).toBe(200);
    expect(validRes.body).toBe('<Response/>');

    // Verify DB updated to sent
    const updated = await notifRepo.getNotifications(eventId);
    expect(updated[0]?.status).toBe('sent');

    // 2. Forged signature -> 403 Forbidden
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/twilio/status',
      headers: {
        host: 'localhost',
        'x-twilio-signature': 'forged_invalid_signature_xyz',
        'content-type': 'application/json',
      },
      payload: params,
    });

    expect(invalidRes.statusCode).toBe(403);
    const invalidBody = invalidRes.json();
    expect(invalidBody.error.code).toBe('FORBIDDEN');
  });
});
