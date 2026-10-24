/**
 * Database migration runner using Kysely Migrator.
 */
import { Migrator, type Kysely, type Migration, type MigrationProvider } from 'kysely';
import * as initialSchema from './migrations/001_initial_schema.js';

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '001_initial_schema': initialSchema,
    };
  }
}

export async function runMigrations(db: Kysely<unknown>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      // migration succeeded
    } else if (it.status === 'Error') {
      console.error(`Migration "${it.migrationName}" failed`);
    }
  });

  if (error) {
    throw error;
  }
}

export async function rollbackMigrations(db: Kysely<unknown>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(),
  });

  const { error } = await migrator.migrateDown();
  if (error) {
    throw error;
  }
}
