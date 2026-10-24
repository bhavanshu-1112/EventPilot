import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { buildApp } from '../src/server.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { BudgetRepository } from '../src/db/repositories/budget.repository.js';
import { hashEventToken } from '../src/auth/tokens.js';
import { FixtureClient } from '../src/llm/fixture-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLES_QUOTES_DIR = path.resolve(__dirname, '../../../samples/quotes');

function createMultipartPayload(
  files: Array<{ fieldname: string; filename: string; contentType: string; buffer: Buffer }>,
  fields: Record<string, string> = {},
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`,
      ),
    );
  }

  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const payload = Buffer.concat(chunks);
  return {
    payload,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('Quote Source Stage End-to-End API Routes', () => {
  let db: DbClient;
  let app: FastifyInstance;
  let tempUploadDir: string;
  const token = 'test-token-source-128';
  const tokenHash = hashEventToken(token);
  const eventId = 'evt-source-test-01';

  beforeEach(async () => {
    tempUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-source-quotes-'));
    db = await createInMemoryTestDb();
    await runMigrations(db);

    const eventRepo = new EventRepository(db);
    await eventRepo.create({
      id: eventId,
      name: 'Source Stage Wedding Test',
      eventType: 'wedding',
      location: 'Udaipur',
      eventDate: '2026-11-20',
      guestCount: 350,
      totalBudgetMinor: 350000000,
      currency: 'INR',
      accessTokenHash: tokenHash,
      briefJson: '{}',
    });

    const budgetRepo = new BudgetRepository(db);
    await budgetRepo.setCategories(eventId, [
      {
        categoryId: 'catering',
        label: 'Catering',
        weight: 0.3,
        locked: false,
        floorPercent: 15,
        priority: 2,
        allocatedMinor: 105000000,
        spentMinor: 0,
      },
      {
        categoryId: 'venue',
        label: 'Venue',
        weight: 0.35,
        locked: true,
        floorPercent: 20,
        priority: 1,
        allocatedMinor: 122500000,
        spentMinor: 0,
      },
      {
        categoryId: 'decor',
        label: 'Decor',
        weight: 0.2,
        locked: false,
        floorPercent: 10,
        priority: 3,
        allocatedMinor: 70000000,
        spentMinor: 0,
      },
      {
        categoryId: 'contingency',
        label: 'Contingency',
        weight: 0.15,
        locked: false,
        floorPercent: 5,
        priority: 1,
        allocatedMinor: 52500000,
        spentMinor: 0,
      },
    ]);

    app = await buildApp({
      db,
      uploadDir: tempUploadDir,
      llmClient: new FixtureClient(),
    });
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    await db.destroy();
    fs.rmSync(tempUploadDir, { recursive: true, force: true });
  });

  it('uploads, extracts, and flags quote 1 (Royal Caterers) with hidden cost flags', async () => {
    const pdfPath = path.join(SAMPLES_QUOTES_DIR, 'quote-1-royal-caterers', 'quote.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const multipart = createMultipartPayload([
      {
        fieldname: 'file',
        filename: 'quote-1.pdf',
        contentType: 'application/pdf',
        buffer: pdfBuffer,
      },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/quotes`,
      headers: { authorization: `Bearer ${token}`, ...multipart.headers },
      payload: multipart.payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.quote).toBeDefined();
    expect(body.quote.vendorName).toBe('Royal Caterers & Banqueting');
    expect(body.quote.category).toBe('catering');
    expect(body.lineItems.length).toBe(3);

    const flagRuleIds = body.flags.map((f: { rule_id: string }) => f.rule_id);
    expect(flagRuleIds).toContain('TAX_EXCLUDED');
    expect(flagRuleIds).toContain('SERVICE_CHARGE_MISSING');
    expect(flagRuleIds).toContain('VALIDITY_EXPIRED');
    expect(flagRuleIds).toContain('SUM_MISMATCH');
  });

  it('compares quotes across category and identifies all-in total with tax assumptions', async () => {
    // Upload quote 1
    const pdf1 = fs.readFileSync(
      path.join(SAMPLES_QUOTES_DIR, 'quote-1-royal-caterers', 'quote.pdf'),
    );
    const mp1 = createMultipartPayload([
      { fieldname: 'file', filename: 'q1.pdf', contentType: 'application/pdf', buffer: pdf1 },
    ]);
    await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/quotes`,
      headers: { authorization: `Bearer ${token}`, ...mp1.headers },
      payload: mp1.payload,
    });

    // Upload quote 2
    const pdf2 = fs.readFileSync(
      path.join(SAMPLES_QUOTES_DIR, 'quote-2-lakeview-banquets', 'quote.pdf'),
    );
    const mp2 = createMultipartPayload([
      { fieldname: 'file', filename: 'q2.pdf', contentType: 'application/pdf', buffer: pdf2 },
    ]);
    await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/quotes`,
      headers: { authorization: `Bearer ${token}`, ...mp2.headers },
      payload: mp2.payload,
    });

    const compareRes = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${eventId}/quotes/compare?category=catering`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(compareRes.statusCode).toBe(200);
    const body = JSON.parse(compareRes.body);
    expect(body.quotesCount).toBe(2);
    expect(body.cheapestQuoteId).toBeDefined();
    expect(body.quotes[0].allInTotalMinor).toBeGreaterThan(0);
    expect(body.quotes[0].assumptions).toBeDefined();
  });

  it('generates negotiation drafts with cited line items in email and WhatsApp tones', async () => {
    const pdf1 = fs.readFileSync(
      path.join(SAMPLES_QUOTES_DIR, 'quote-1-royal-caterers', 'quote.pdf'),
    );
    const mp1 = createMultipartPayload([
      { fieldname: 'file', filename: 'q1.pdf', contentType: 'application/pdf', buffer: pdf1 },
    ]);
    const upRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/quotes`,
      headers: { authorization: `Bearer ${token}`, ...mp1.headers },
      payload: mp1.payload,
    });
    const quoteId = JSON.parse(upRes.body).quote.id;

    // Test email draft
    const emailRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/quotes/${quoteId}/negotiation-draft`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tone: 'email' },
    });

    expect(emailRes.statusCode).toBe(200);
    const emailBody = JSON.parse(emailRes.body);
    expect(emailBody.draft.subject).toBeDefined();
    expect(emailBody.draft.body).toContain('Royal Caterers');
    expect(emailBody.draft.citedLineItemIds.length).toBeGreaterThan(0);

    // Test WhatsApp draft
    const waRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/quotes/${quoteId}/negotiation-draft`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tone: 'whatsapp' },
    });

    expect(waRes.statusCode).toBe(200);
    const waBody = JSON.parse(waRes.body);
    expect(waBody.draft.body).toBeDefined();
  });

  it('detects budget overrun on booking quote 1 and requests rebalance', async () => {
    // Quote 1 stated total is 11,50,000 INR (115000000 paise). Category allocation is 10,50,000 INR (105000000 paise).
    // Overrun = 1,00,000 INR (10000000 paise).
    const pdf1 = fs.readFileSync(
      path.join(SAMPLES_QUOTES_DIR, 'quote-1-royal-caterers', 'quote.pdf'),
    );
    const mp1 = createMultipartPayload([
      { fieldname: 'file', filename: 'q1.pdf', contentType: 'application/pdf', buffer: pdf1 },
    ]);
    const upRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/quotes`,
      headers: { authorization: `Bearer ${token}`, ...mp1.headers },
      payload: mp1.payload,
    });
    const quoteId = JSON.parse(upRes.body).quote.id;

    const bookRes = await app.inject({
      method: 'POST',
      url: `/api/v1/events/${eventId}/quotes/${quoteId}/book`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(bookRes.statusCode).toBe(200);
    const bookBody = JSON.parse(bookRes.body);
    expect(bookBody.booked).toBe(false);
    expect(bookBody.needsRebalance).toBe(true);
    expect(bookBody.overrunMinor).toBe(10000000); // 1 Lakh INR overrun
    expect(bookBody.categoryId).toBe('catering');
  });
});
