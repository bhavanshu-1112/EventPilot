/**
 * Database Seed Script for EventPilot.
 * Loads sample seeds (wedding-udaipur, birthday, community) and checklist templates
 * into the database, generating known dev tokens for each event.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDbClient } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { EventRepository } from '../src/db/repositories/event.repository.js';
import { BudgetRepository } from '../src/db/repositories/budget.repository.js';
import { ScheduleRepository } from '../src/db/repositories/schedule.repository.js';
import { ChecklistRepository } from '../src/db/repositories/checklist.repository.js';
import { ContactRepository } from '../src/db/repositories/contact.repository.js';
import { hashEventToken } from '../src/auth/tokens.js';
import type { EventType } from '../src/db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLES_DIR = path.resolve(__dirname, '../../../samples');

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
      break;
    } catch {
      // ignore
    }
  }
}

interface SeedCategory {
  id: string;
  label: string;
  weight: number;
  locked?: boolean;
  floorPercent?: number;
  priority?: number;
  allocatedMinor: number;
  spentMinor?: number;
}

interface SeedTimelineItem {
  id: string;
  label: string;
  startMin: number;
  durationMin: number;
  fixed?: boolean;
  bufferMin?: number;
  vendor?: string | null;
  guestVisible?: boolean;
  priority?: number;
  dependsOn?: string[];
}

interface SeedContact {
  id?: string;
  name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  preferredChannel?: 'sms' | 'whatsapp' | 'email' | 'call';
}

interface ChecklistTemplateItem {
  id: string;
  category: string;
  title: string;
  description: string;
  daysBeforeEvent: number;
  priority?: string;
  defaultStatus?: 'needed' | 'shortlisted' | 'quoted' | 'booked';
  role?: string | null;
}

interface SeedData {
  event: {
    id: string;
    name: string;
    eventType: EventType;
    location: string;
    eventDate: string;
    guestCount: number;
    totalBudgetMinor: number;
    currency?: string;
    brief?: Record<string, unknown>;
    categories?: SeedCategory[];
    timeline?: SeedTimelineItem[];
    contacts?: SeedContact[];
  };
}

async function seedChecklistFromTemplate(
  checklistRepo: ChecklistRepository,
  eventId: string,
  eventType: string,
  checklistDir: string,
): Promise<void> {
  const templatePath = path.join(checklistDir, `${eventType}.json`);
  if (!fs.existsSync(templatePath)) return;
  const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf-8')) as {
    items?: ChecklistTemplateItem[];
  };
  if (!templateData.items || templateData.items.length === 0) return;

  await checklistRepo.setItems(
    eventId,
    templateData.items.map((it) => ({
      id: `${eventId}-${it.id}`,
      category: it.category,
      title: it.title,
      description: it.description,
      daysBeforeEvent: it.daysBeforeEvent,
      priority: it.priority,
      status: it.defaultStatus ?? 'needed',
      role: it.role,
    })),
  );
}

async function seedEventDetails(
  db: ReturnType<typeof createDbClient>,
  event: SeedData['event'],
  checklistDir: string,
): Promise<void> {
  const budgetRepo = new BudgetRepository(db);
  const scheduleRepo = new ScheduleRepository(db);
  const checklistRepo = new ChecklistRepository(db);
  const contactRepo = new ContactRepository(db);

  if (event.categories && event.categories.length > 0) {
    await budgetRepo.setCategories(
      event.id,
      event.categories.map((c) => ({
        categoryId: c.id,
        label: c.label,
        weight: c.weight,
        locked: c.locked,
        floorPercent: c.floorPercent,
        priority: c.priority,
        allocatedMinor: c.allocatedMinor,
        spentMinor: c.spentMinor,
      })),
    );
  }

  if (event.timeline && event.timeline.length > 0) {
    await scheduleRepo.setItems(
      event.id,
      event.timeline.map((t) => ({
        id: t.id,
        label: t.label,
        startMin: t.startMin,
        durationMin: t.durationMin,
        fixed: t.fixed,
        bufferMin: t.bufferMin,
        vendor: t.vendor,
        guestVisible: t.guestVisible,
        priority: t.priority,
        dependsOn: t.dependsOn,
      })),
    );
  }

  if (event.contacts && event.contacts.length > 0) {
    await contactRepo.setContacts(
      event.id,
      event.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        phone: c.phone,
        email: c.email,
        preferredChannel: c.preferredChannel,
      })),
    );
  }

  await seedChecklistFromTemplate(checklistRepo, event.id, event.eventType, checklistDir);
}

async function seedSingleFile(
  db: ReturnType<typeof createDbClient>,
  seedsDir: string,
  checklistDir: string,
  seedFile: { file: string; token: string },
): Promise<{ id: string; name: string; token: string } | null> {
  const filePath = path.join(seedsDir, seedFile.file);
  if (!fs.existsSync(filePath)) return null;

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SeedData;
  const { event } = data;
  const eventRepo = new EventRepository(db);

  await eventRepo.delete(event.id);

  const createdEvent = await eventRepo.create({
    id: event.id,
    name: event.name,
    eventType: event.eventType,
    location: event.location,
    eventDate: event.eventDate,
    guestCount: event.guestCount,
    totalBudgetMinor: event.totalBudgetMinor,
    currency: event.currency ?? 'INR',
    accessTokenHash: hashEventToken(seedFile.token),
    briefJson: JSON.stringify(event.brief ?? {}),
  });

  await seedEventDetails(db, event, checklistDir);

  return { id: createdEvent.id, name: createdEvent.name, token: seedFile.token };
}

export interface SeedRunnerOptions {
  dbClient?: ReturnType<typeof createDbClient>;
  log?: boolean;
}

export async function runSeed(
  options: SeedRunnerOptions = {},
): Promise<Array<{ id: string; name: string; token: string }>> {
  const db = options.dbClient ?? createDbClient();
  const shouldLog = options.log ?? true;

  await runMigrations(db);

  const seedsDir = path.join(SAMPLES_DIR, 'seeds');
  const checklistDir = path.join(SAMPLES_DIR, 'checklist-templates');

  const seedFiles = [
    { file: 'wedding-udaipur.json', token: 'token-wedding-udaipur-secret-128' },
    { file: 'birthday.json', token: 'token-birthday-kabir-secret-128' },
    { file: 'community.json', token: 'token-community-mewar-secret-128' },
  ];

  const seededEvents: Array<{ id: string; name: string; token: string }> = [];

  for (const sf of seedFiles) {
    const res = await seedSingleFile(db, seedsDir, checklistDir, sf);
    if (res) {
      seededEvents.push(res);
    }
  }

  if (shouldLog) {
    console.warn('\n✅ EventPilot Database Seed Completed Successfully!');
    console.warn('─'.repeat(80));
    console.warn('Seeded Events and Development Access Tokens:');
    for (const e of seededEvents) {
      console.warn(`  • [${e.id}] ${e.name}`);
      console.warn(`    Bearer Token: ${e.token}`);
    }
    console.warn('─'.repeat(80));
  }

  return seededEvents;
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isMain) {
  const db = createDbClient();
  runSeed({ dbClient: db })
    .then(async () => {
      await db.destroy();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await db.destroy();
      process.exit(1);
    });
}
