import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInMemoryTestDb, type DbClient } from '../src/db/client.js';
import { runMigrations, rollbackMigrations } from '../src/db/migrator.js';

describe('Database migrations', () => {
  let db: DbClient;

  beforeEach(async () => {
    db = await createInMemoryTestDb();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('runs initial schema migration from scratch successfully', async () => {
    await runMigrations(db);

    // Verify all primary tables exist by selecting from them
    const tables = [
      'events',
      'ceremonies',
      'budget_categories',
      'budget_ledger',
      'inspiration_assets',
      'bom_items',
      'bom_item_tiers',
      'checklist_items',
      'ideas',
      'vendors',
      'quotes',
      'quote_line_items',
      'quote_flags',
      'schedule_items',
      'schedule_dependencies',
      'contacts',
      'notifications',
      'llm_usage',
    ] as const;

    for (const table of tables) {
      const result = await db.selectFrom(table).selectAll().execute();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    }
  });

  it('supports rolling back migrations cleanly', async () => {
    await runMigrations(db);
    await rollbackMigrations(db);

    // After rollback, table should no longer exist
    await expect(db.selectFrom('events').selectAll().execute()).rejects.toThrow();
  });
});
