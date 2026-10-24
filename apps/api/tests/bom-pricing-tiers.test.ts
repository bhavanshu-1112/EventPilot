import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { buildApp } from '../src/server.js';
import { FixtureClient } from '../src/llm/fixture-client.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { BomRepository } from '../src/db/repositories/bom.repository.js';
import { hashEventToken } from '../src/auth/tokens.js';

// Minimal 1x1 valid PNG buffer
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function createMultipartImagePayload(
  filename: string,
  buffer: Buffer,
  altText: string,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="altText"\r\n\r\n${altText}\r\n`,
    ),
  );

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
    ),
  );
  chunks.push(buffer);
  chunks.push(Buffer.from('\r\n'));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('BOM Pricing Engine & Save/Standard/Splurge Tiers', () => {
  let db: DbClient;
  let app: FastifyInstance;
  let tempUploadDir: string;
  const token = 'test-token-bom-128';
  const tokenHash = hashEventToken(token);
  const eventId = 'evt-bom-test-01';

  beforeEach(async () => {
    db = await createInMemoryTestDb();
    await runMigrations(db);

    tempUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventpilot-bom-upload-'));

    const eventRepo = new EventRepository(db);
    await eventRepo.create({
      id: eventId,
      name: 'Lake Palace Royal Wedding',
      eventType: 'wedding',
      location: 'Udaipur, Rajasthan',
      eventDate: '2026-11-20',
      guestCount: 350,
      totalBudgetMinor: 350000000,
      currency: 'INR',
      accessTokenHash: tokenHash,
      briefJson: JSON.stringify({ vibe: 'royal' }),
    });

    const fixtureClient = new FixtureClient();
    app = await buildApp({
      db,
      uploadDir: tempUploadDir,
      llmClient: fixtureClient,
    });
  });

  afterEach(async () => {
    if (app) await app.close();
    if (db) await db.destroy();
    if (fs.existsSync(tempUploadDir)) {
      fs.rmSync(tempUploadDir, { recursive: true, force: true });
    }
  });

  it('extracts visual BOM from inspiration, joins price catalog, and populates 3 tiers per item', async () => {
    const multipart = createMultipartImagePayload(
      'moodboard.png',
      TINY_PNG,
      'Royal Mewari Palace Elegance with lakeside lawns and floral mandap',
    );

    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/inspiration`,
      headers: {
        authorization: `Bearer ${token}`,
        ...multipart.headers,
      },
      payload: multipart.payload,
    });

    expect(uploadRes.statusCode).toBe(201);
    const body = uploadRes.json();

    // 1. Vision extraction verified
    expect(body.vision).toBeDefined();
    expect(body.vision.theme).toBe('Royal Mewari Palace Elegance');
    expect(body.vision.paletteHex.length).toBeGreaterThanOrEqual(3);

    // 2. BOM items priced against catalog
    expect(body.bom).toBeDefined();
    expect(body.bom.length).toBe(4);

    let calculatedStandardSum = 0;
    for (const item of body.bom) {
      expect(item.tiers.length).toBe(3);
      const tierNames = item.tiers.map((t: { tier: string }) => t.tier);
      expect(tierNames).toContain('save');
      expect(tierNames).toContain('standard');
      expect(tierNames).toContain('splurge');

      // Tiers ordered: save <= standard <= splurge
      const savePrice = Number(
        item.tiers.find((t: { tier: string }) => t.tier === 'save').price_minor,
      );
      const standardPrice = Number(
        item.tiers.find((t: { tier: string }) => t.tier === 'standard').price_minor,
      );
      const splurgePrice = Number(
        item.tiers.find((t: { tier: string }) => t.tier === 'splurge').price_minor,
      );

      expect(savePrice).toBeLessThanOrEqual(standardPrice);
      expect(standardPrice).toBeLessThanOrEqual(splurgePrice);

      calculatedStandardSum += standardPrice;
    }

    // 3. Initial total matches exact sum of standard tiers
    expect(body.totalMinor).toBe(calculatedStandardSum);
  });

  it('updates selected tiers and guarantees BOM total recomputes with exact mathematical precision', async () => {
    // Populate BOM items in DB
    const bomRepo = new BomRepository(db);
    const initialBom = await bomRepo.setBomItems(eventId, [
      {
        catalogKey: 'venue.heritage_palace_lawn',
        category: 'venue',
        label: 'Heritage Palace Lakeside Lawn',
        quantity: 1,
        unit: 'per event',
        selectedTier: 'standard',
        tiers: [
          {
            tier: 'save',
            name: 'Boutique Haveli Courtyard',
            priceMinor: 35000000,
            description: 'Save',
          },
          {
            tier: 'standard',
            name: 'Lake Pichola Heritage Lawn',
            priceMinor: 75000000,
            description: 'Standard',
          },
          {
            tier: 'splurge',
            name: 'Royal Island Palace Pavilion',
            priceMinor: 180000000,
            description: 'Splurge',
          },
        ],
      },
      {
        catalogKey: 'decor.mandap_floral_royal',
        category: 'decor',
        label: 'Grand Royal Floral Mandap',
        quantity: 1,
        unit: 'setup',
        selectedTier: 'standard',
        tiers: [
          {
            tier: 'save',
            name: 'Seasonal Marigold Mandap',
            priceMinor: 15000000,
            description: 'Save',
          },
          {
            tier: 'standard',
            name: 'Exotic Rose & Marigold Mandap',
            priceMinor: 30000000,
            description: 'Standard',
          },
          {
            tier: 'splurge',
            name: 'Crystal & Orchid Royal Mandap',
            priceMinor: 60000000,
            description: 'Splurge',
          },
        ],
      },
    ]);

    const initialTotal = 75000000 + 30000000; // 105,000,000 paise (10.5 Lakh INR)

    // 1. Verify GET /bom matches initial math
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventId}/bom`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.totalMinor).toBe(initialTotal);
    expect(getBody.items.length).toBe(2);

    // 2. Switch venue to 'save' tier
    const venueItem = initialBom.find((i) => i.category === 'venue')!;
    const patchSaveRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/events/${eventId}/bom/${venueItem.id}/tier`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { tier: 'save' },
    });

    expect(patchSaveRes.statusCode).toBe(200);
    const saveBody = patchSaveRes.json();
    expect(saveBody.item.selected_tier).toBe('save');

    // Expected total: 35,000,000 + 30,000,000 = 65,000,000
    const expectedSaveTotal = 35000000 + 30000000;
    expect(saveBody.totalMinor).toBe(expectedSaveTotal);

    // 3. Switch decor to 'splurge' tier
    const decorItem = initialBom.find((i) => i.category === 'decor')!;
    const patchSplurgeRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/events/${eventId}/bom/${decorItem.id}/tier`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { tier: 'splurge' },
    });

    expect(patchSplurgeRes.statusCode).toBe(200);
    const splurgeBody = patchSplurgeRes.json();
    expect(splurgeBody.item.selected_tier).toBe('splurge');

    // Expected total: 35,000,000 (venue save) + 60,000,000 (decor splurge) = 95,000,000
    const expectedSplurgeTotal = 35000000 + 60000000;
    expect(splurgeBody.totalMinor).toBe(expectedSplurgeTotal);

    // 4. Verify GET /bom reflects new state
    const finalGetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventId}/bom`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(finalGetRes.json().totalMinor).toBe(expectedSplurgeTotal);
  });
});
