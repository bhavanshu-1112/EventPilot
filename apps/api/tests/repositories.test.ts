import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { BudgetRepository } from '../src/db/repositories/budget.repository.js';
import { ScheduleRepository } from '../src/db/repositories/schedule.repository.js';
import { QuoteRepository } from '../src/db/repositories/quote.repository.js';
import { ChecklistRepository } from '../src/db/repositories/checklist.repository.js';
import { ContactRepository } from '../src/db/repositories/contact.repository.js';
import { NotificationRepository } from '../src/db/repositories/notification.repository.js';
import { AssetRepository } from '../src/db/repositories/asset.repository.js';

describe('Type-Safe Repositories & Invariants', () => {
  let db: DbClient;
  let eventRepo: EventRepository;
  let budgetRepo: BudgetRepository;
  let scheduleRepo: ScheduleRepository;
  let quoteRepo: QuoteRepository;
  let checklistRepo: ChecklistRepository;
  let contactRepo: ContactRepository;
  let notifRepo: NotificationRepository;
  let assetRepo: AssetRepository;
  let eventId: string;

  beforeEach(async () => {
    db = await createInMemoryTestDb();
    await runMigrations(db);

    eventRepo = new EventRepository(db);
    budgetRepo = new BudgetRepository(db);
    scheduleRepo = new ScheduleRepository(db);
    quoteRepo = new QuoteRepository(db);
    checklistRepo = new ChecklistRepository(db);
    contactRepo = new ContactRepository(db);
    notifRepo = new NotificationRepository(db);
    assetRepo = new AssetRepository(db);

    const event = await eventRepo.create({
      name: 'Repository Test Event',
      eventType: 'wedding',
      location: 'Jaipur',
      eventDate: '2026-10-30',
      guestCount: 200,
      totalBudgetMinor: 300000000,
      currency: 'INR',
      accessTokenHash: 'test-hash-1234567890',
    });
    eventId = event.id;
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('BudgetRepository maintains append-only ledger history', async () => {
    await budgetRepo.setCategories(eventId, [
      { categoryId: 'venue', label: 'Venue', weight: 0.4, allocatedMinor: 120000000 },
      { categoryId: 'catering', label: 'Catering', weight: 0.3, allocatedMinor: 90000000 },
    ]);

    const categories = await budgetRepo.getCategories(eventId);
    expect(categories).toHaveLength(2);

    // Append to ledger
    await budgetRepo.appendLedgerEntry(eventId, {
      categoryId: 'venue',
      previousMinor: 120000000,
      newMinor: 100000000,
      reason: 'Rebalance: Reallocated 20000 INR to decor',
    });

    await budgetRepo.appendLedgerEntry(eventId, {
      categoryId: 'venue',
      previousMinor: 100000000,
      newMinor: 110000000,
      reason: 'Quote renegotiation discount',
    });

    const ledger = await budgetRepo.getLedger(eventId);
    expect(ledger).toHaveLength(2);
    expect(ledger[0]!.category_id).toBe('venue');
    expect(Number(ledger[0]!.previous_minor)).toBe(120000000);
    expect(Number(ledger[0]!.new_minor)).toBe(100000000);
    expect(ledger[1]!.reason).toBe('Quote renegotiation discount');
  });

  it('ScheduleRepository persists items and DAG dependencies', async () => {
    const item1Id = 'item-baraat-001';
    const item2Id = 'item-varmala-002';

    await scheduleRepo.setItems(eventId, [
      {
        id: item1Id,
        label: 'Baraat Arrival',
        startMin: 600,
        durationMin: 60,
        fixed: true,
        bufferMin: 15,
        vendor: 'Brass Band',
        guestVisible: true,
        priority: 5,
      },
      {
        id: item2Id,
        label: 'Varmala Ceremony',
        startMin: 675,
        durationMin: 30,
        fixed: false,
        bufferMin: 10,
        vendor: 'Pandit Ji',
        guestVisible: true,
        priority: 5,
        dependsOn: [item1Id],
      },
    ]);

    const items = await scheduleRepo.getItems(eventId);
    expect(items).toHaveLength(2);

    const varmala = items.find((i) => i.id === item2Id);
    expect(varmala).toBeDefined();
    expect(varmala?.depends_on).toContain(item1Id);
  });

  it('NotificationRepository enforces idempotency deduplication', async () => {
    const notif1 = await notifRepo.create(eventId, {
      channel: 'whatsapp',
      recipient: '+919876543210',
      body: 'Welcome to Udaipur Wedding!',
      idempotencyKey: 'msg-seed-welcome-001',
    });
    expect(notif1.id).toBeDefined();
    expect(notif1.status).toBe('draft');

    // Duplicate submission with the same idempotency key
    const notif2 = await notifRepo.create(eventId, {
      channel: 'whatsapp',
      recipient: '+919876543210',
      body: 'Welcome to Udaipur Wedding! (duplicate call)',
      idempotencyKey: 'msg-seed-welcome-001',
    });

    // Must return original existing notification without adding a new row
    expect(notif2.id).toBe(notif1.id);

    const allNotifs = await notifRepo.getNotifications(eventId);
    expect(allNotifs).toHaveLength(1);
  });

  it('QuoteRepository persists quotes, line items, and flags', async () => {
    const quote = await quoteRepo.create(eventId, {
      vendorName: 'Royal Catering Services',
      category: 'catering',
      currency: 'INR',
      status: 'analyzed',
      statedTotalMinor: 85000000,
      rawStoragePath: '/uploads/quotes/dummy.pdf',
      contentHash: 'hash-quote-001',
      lineItems: [
        {
          description: 'Buffet Dinner (250 pax)',
          quantity: 250,
          unit: 'plate',
          unitPriceMinor: 300000,
          totalMinor: 75000000,
          taxIncluded: false,
        },
      ],
      flags: [
        {
          ruleId: 'TAX_EXCLUDED',
          severity: 'warning',
          message: 'Taxes are excluded from per-plate price',
          explanation: 'GST 18% will be added on final invoice',
        },
      ],
    });

    expect(quote.id).toBeDefined();

    const quotes = await quoteRepo.getQuotes(eventId, 'catering');
    expect(quotes).toHaveLength(1);
    expect(quotes[0]!.vendor_name).toBe('Royal Catering Services');
    expect(quotes[0]!.line_items).toHaveLength(1);
    expect(quotes[0]!.line_items[0]!.description).toBe('Buffet Dinner (250 pax)');
    expect(quotes[0]!.flags).toHaveLength(1);
    expect(quotes[0]!.flags[0]!.rule_id).toBe('TAX_EXCLUDED');
  });

  it('ChecklistRepository creates and updates task items', async () => {
    const items = await checklistRepo.setItems(eventId, [
      {
        category: 'catering',
        title: 'Finalize menu tasting',
        description: 'Taste food samples and finalize starter options',
        daysBeforeEvent: 30,
        priority: 'high',
        role: 'Catering Lead',
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe('needed');

    const updated = await checklistRepo.updateItem(eventId, items[0]!.id, {
      status: 'booked',
    });

    expect(updated?.status).toBe('booked');
  });

  it('ContactRepository stores and retrieves vendor/organizer contacts', async () => {
    await contactRepo.setContacts(eventId, [
      {
        name: 'Rajesh Sharma',
        role: 'Pandit Ji',
        phone: '+919876543211',
        preferredChannel: 'call',
      },
    ]);

    const contacts = await contactRepo.getContacts(eventId);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.name).toBe('Rajesh Sharma');
    expect(contacts[0]!.preferred_channel).toBe('call');
  });

  it('AssetRepository stores asset records with content hashes', async () => {
    const asset = await assetRepo.create(eventId, {
      originalFilename: 'stage-design.jpg',
      storagePath: '/uploads/inspiration/stage-design.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 102400,
      contentHash: 'asset-hash-12345',
      altText: 'Royal Stage Concept',
    });

    expect(asset.id).toBeDefined();

    const assets = await assetRepo.getAssets(eventId);
    expect(assets).toHaveLength(1);
    expect(assets[0]!.content_hash).toBe('asset-hash-12345');
  });
});
