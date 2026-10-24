import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runSeed } from '../scripts/seed.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { BudgetRepository } from '../src/db/repositories/budget.repository.js';
import { ScheduleRepository } from '../src/db/repositories/schedule.repository.js';
import { ChecklistRepository } from '../src/db/repositories/checklist.repository.js';
import { ContactRepository } from '../src/db/repositories/contact.repository.js';
import { hashEventToken } from '../src/auth/tokens.js';

describe('Database Seed Runner', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createInMemoryTestDb();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('populates sample seeds and checklist templates for all three event types', async () => {
    const seeded = await runSeed({ dbClient: db, log: false });

    expect(seeded).toHaveLength(3);
    const eventIds = seeded.map((s) => s.id);
    expect(eventIds).toContain('evt-wedding-udaipur-01');
    expect(eventIds).toContain('evt-birthday-01');
    expect(eventIds).toContain('evt-community-01');

    const eventRepo = new EventRepository(db);
    const budgetRepo = new BudgetRepository(db);
    const scheduleRepo = new ScheduleRepository(db);
    const checklistRepo = new ChecklistRepository(db);
    const contactRepo = new ContactRepository(db);

    // Verify Wedding Udaipur
    const weddingTokenHash = hashEventToken('token-wedding-udaipur-secret-128');
    const weddingEvent = await eventRepo.findByTokenHash(weddingTokenHash);
    expect(weddingEvent).toBeDefined();
    expect(weddingEvent?.name).toBe('Aarav & Ananya Royal Udaipur Wedding');
    expect(weddingEvent?.event_type).toBe('wedding');
    expect(weddingEvent?.guest_count).toBe(350);
    expect(Number(weddingEvent?.total_budget_minor)).toBe(350000000);

    // Verify Budget categories seeded
    const weddingCategories = await budgetRepo.getCategories('evt-wedding-udaipur-01');
    expect(weddingCategories.length).toBeGreaterThan(0);
    const venueCat = weddingCategories.find((c) => c.category_id === 'venue');
    expect(venueCat).toBeDefined();
    expect(Boolean(venueCat?.locked)).toBe(true);

    // Verify Timeline seeded
    const weddingSchedule = await scheduleRepo.getItems('evt-wedding-udaipur-01');
    expect(weddingSchedule.length).toBeGreaterThan(0);
    const baraat = weddingSchedule.find((s) => s.id === 'item-baraat');
    expect(baraat).toBeDefined();
    expect(baraat?.depends_on).toContain('item-safabandhi');

    // Verify Checklist seeded from wedding template
    const weddingChecklist = await checklistRepo.getItems('evt-wedding-udaipur-01');
    expect(weddingChecklist.length).toBeGreaterThan(0);

    // Verify Contacts seeded
    const weddingContacts = await contactRepo.getContacts('evt-wedding-udaipur-01');
    expect(weddingContacts.length).toBeGreaterThan(0);

    // Verify Birthday
    const bdayTokenHash = hashEventToken('token-birthday-kabir-secret-128');
    const bdayEvent = await eventRepo.findByTokenHash(bdayTokenHash);
    expect(bdayEvent).toBeDefined();
    expect(bdayEvent?.event_type).toBe('birthday');

    // Verify Community
    const commTokenHash = hashEventToken('token-community-mewar-secret-128');
    const commEvent = await eventRepo.findByTokenHash(commTokenHash);
    expect(commEvent).toBeDefined();
    expect(commEvent?.event_type).toBe('community');
  });

  it('is idempotent and can be executed multiple times without error', async () => {
    await runSeed({ dbClient: db, log: false });
    const secondRun = await runSeed({ dbClient: db, log: false });

    expect(secondRun).toHaveLength(3);
    const eventRepo = new EventRepository(db);
    const wedding = await eventRepo.findById('evt-wedding-udaipur-01');
    expect(wedding).toBeDefined();
  });
});
