/**
 * Kysely database client factory.
 * Provides PostgreSQL connection using pg.Pool in production / dev,
 * and an in-memory pg-mem adapter for unit and integration testing.
 */
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

export type DbClient = Kysely<Database>;

export interface DbClientOptions {
  connectionString?: string;
  pool?: pg.Pool;
  isTest?: boolean;
}

export function createDbClient(options: DbClientOptions = {}): DbClient {
  const { connectionString, pool } = options;

  if (pool) {
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  if (connectionString) {
    const pgPool = new pg.Pool({ connectionString, max: 10 });
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool: pgPool }),
    });
  }

  // Fallback to local default connection string
  const defaultUrl =
    process.env['DATABASE_URL'] ?? 'postgresql://eventpilot:eventpilot@localhost:5432/eventpilot';
  const defaultPool = new pg.Pool({ connectionString: defaultUrl, max: 10 });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: defaultPool }),
  });
}

/**
 * Creates an in-memory PostgreSQL instance for zero-dependency testing.
 */
export async function createInMemoryTestDb(): Promise<DbClient> {
  const { newDb, DataType } = await import('pg-mem');
  const mem = newDb();

  // Register CURRENT_TIMESTAMP / now
  mem.public.registerFunction({
    name: 'current_timestamp',
    args: [],
    returns: mem.public.getType(DataType.timestamptz),
    implementation: () => new Date(),
  });

  // Register col_description for Kysely PostgresIntrospector
  mem.public.registerFunction({
    name: 'col_description',
    args: [mem.public.getType(DataType.integer), mem.public.getType(DataType.integer)],
    returns: mem.public.getType(DataType.text),
    implementation: () => null,
  });

  // Register pg_advisory_xact_lock for Kysely migration lock
  mem.public.registerFunction({
    name: 'pg_advisory_xact_lock',
    args: [mem.public.getType(DataType.text)],
    implementation: () => null,
  });

  type BinaryOp = Parameters<typeof mem.public.registerOperator>[0]['operator'];

  // Register regex operators !~ and ~ for Kysely introspector
  mem.public.registerOperator({
    operator: '!~' as BinaryOp,
    left: mem.public.getType(DataType.text),
    right: mem.public.getType(DataType.text),
    returns: mem.public.getType(DataType.bool),
    implementation: (left: string, right: string) => !new RegExp(right).test(left),
  });

  mem.public.registerOperator({
    operator: '~' as BinaryOp,
    left: mem.public.getType(DataType.text),
    right: mem.public.getType(DataType.text),
    returns: mem.public.getType(DataType.bool),
    implementation: (left: string, right: string) => new RegExp(right).test(left),
  });

  // Intercept catalog queries for table introspection
  mem.public.interceptQueries((query: string) => {
    if (query.includes('pg_attribute') && query.includes('pg_class')) {
      const excludeMigrations = query.includes("!= 'kysely_migration'");
      const rows: Array<{
        column: string;
        not_null: boolean;
        has_default: boolean;
        table: string;
        table_type: string;
        schema: string;
        type: string;
        type_schema: string;
        column_description: string | null;
        auto_incrementing: boolean;
      }> = [];

      for (const table of mem.public.listTables()) {
        if (
          excludeMigrations &&
          (table.name === 'kysely_migration' || table.name === 'kysely_migration_lock')
        ) {
          continue;
        }
        for (const col of table.getColumns()) {
          rows.push({
            column: col.name,
            not_null: !col.nullable,
            has_default: col.hasDefault,
            table: table.name,
            table_type: 'r',
            schema: 'public',
            type: String(col.type.primary),
            type_schema: 'pg_catalog',
            column_description: col.comment ?? null,
            auto_incrementing: col.generated,
          });
        }
      }
      return rows;
    }
    return null;
  });

  const adapter = mem.adapters.createPg();
  const pool = new adapter.Pool();

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: pool as unknown as pg.Pool }),
  });
}
