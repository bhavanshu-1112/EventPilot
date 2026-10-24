import type { DbClient } from '../client.js';
import type { BudgetCategoryRow, BudgetLedgerRow } from '../schema.js';

export interface CreateCategoryInput {
  categoryId: string;
  label: string;
  weight: number;
  locked?: boolean;
  floorPercent?: number;
  priority?: number;
  allocatedMinor: number;
  spentMinor?: number;
}

export interface AppendLedgerInput {
  categoryId: string;
  previousMinor: number;
  newMinor: number;
  reason: string;
}

export class BudgetRepository {
  constructor(private readonly db: DbClient) {}

  async getCategories(eventId: string): Promise<BudgetCategoryRow[]> {
    return this.db
      .selectFrom('budget_categories')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('priority', 'asc')
      .execute();
  }

  async setCategories(
    eventId: string,
    categories: CreateCategoryInput[],
  ): Promise<BudgetCategoryRow[]> {
    // Replace all categories in transaction
    return this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('budget_categories').where('event_id', '=', eventId).execute();

      if (categories.length === 0) return [];

      const rows = categories.map((c) => ({
        id: crypto.randomUUID(),
        event_id: eventId,
        category_id: c.categoryId,
        label: c.label,
        weight: c.weight,
        locked: c.locked ?? false,
        floor_percent: c.floorPercent ?? 0,
        priority: c.priority ?? 3,
        allocated_minor: c.allocatedMinor,
        spent_minor: c.spentMinor ?? 0,
      }));

      return trx.insertInto('budget_categories').values(rows).returningAll().execute();
    });
  }

  async updateCategory(
    eventId: string,
    categoryId: string,
    patch: Partial<
      Pick<BudgetCategoryRow, 'allocated_minor' | 'spent_minor' | 'locked' | 'weight'>
    >,
  ): Promise<BudgetCategoryRow | undefined> {
    return this.db
      .updateTable('budget_categories')
      .set({
        ...patch,
        updated_at: new Date(),
      })
      .where('event_id', '=', eventId)
      .where('category_id', '=', categoryId)
      .returningAll()
      .executeTakeFirst();
  }

  async appendLedgerEntry(eventId: string, entry: AppendLedgerInput): Promise<BudgetLedgerRow> {
    return this.db
      .insertInto('budget_ledger')
      .values({
        id: crypto.randomUUID(),
        event_id: eventId,
        category_id: entry.categoryId,
        previous_minor: entry.previousMinor,
        new_minor: entry.newMinor,
        reason: entry.reason,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async getLedger(eventId: string): Promise<BudgetLedgerRow[]> {
    return this.db
      .selectFrom('budget_ledger')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('created_at', 'asc')
      .execute();
  }
}
