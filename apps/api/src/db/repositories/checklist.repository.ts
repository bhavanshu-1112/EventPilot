import type { DbClient } from '../client.js';
import type { ChecklistItemRow, ChecklistStatus } from '../schema.js';

export interface CreateChecklistItemInput {
  id?: string;
  category: string;
  title: string;
  description: string;
  dueDate?: string | null;
  daysBeforeEvent: number;
  priority?: string;
  status?: ChecklistStatus;
  role?: string | null;
}

export class ChecklistRepository {
  constructor(private readonly db: DbClient) {}

  async getItems(eventId: string): Promise<ChecklistItemRow[]> {
    return this.db
      .selectFrom('checklist_items')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('days_before_event', 'desc')
      .execute();
  }

  async setItems(eventId: string, items: CreateChecklistItemInput[]): Promise<ChecklistItemRow[]> {
    return this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('checklist_items').where('event_id', '=', eventId).execute();

      if (items.length === 0) return [];

      const rows = items.map((it) => ({
        id: it.id ?? crypto.randomUUID(),
        event_id: eventId,
        category: it.category,
        title: it.title,
        description: it.description,
        due_date: it.dueDate ?? null,
        days_before_event: it.daysBeforeEvent,
        priority: it.priority ?? 'medium',
        status: it.status ?? 'needed',
        role: it.role ?? null,
      }));

      return trx.insertInto('checklist_items').values(rows).returningAll().execute();
    });
  }

  async updateItem(
    eventId: string,
    itemId: string,
    patch: Partial<Pick<ChecklistItemRow, 'status' | 'due_date' | 'priority' | 'role'>>,
  ): Promise<ChecklistItemRow | undefined> {
    return this.db
      .updateTable('checklist_items')
      .set({
        ...patch,
        updated_at: new Date(),
      })
      .where('event_id', '=', eventId)
      .where('id', '=', itemId)
      .returningAll()
      .executeTakeFirst();
  }

  async updateCategoryStatus(
    eventId: string,
    category: string,
    status: ChecklistStatus,
  ): Promise<void> {
    await this.db
      .updateTable('checklist_items')
      .set({
        status,
        updated_at: new Date(),
      })
      .where('event_id', '=', eventId)
      .where('category', '=', category)
      .execute();
  }
}
