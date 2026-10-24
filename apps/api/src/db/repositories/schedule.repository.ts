import type { DbClient } from '../client.js';
import type { ScheduleItemRow } from '../schema.js';

export interface CreateScheduleItemInput {
  id?: string;
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

export interface ScheduleItemWithDeps extends ScheduleItemRow {
  depends_on: string[];
}

function buildDependencyRows(
  items: CreateScheduleItemInput[],
  createdItems: ScheduleItemRow[],
): Array<{ item_id: string; depends_on_item_id: string }> {
  const depRows: Array<{ item_id: string; depends_on_item_id: string }> = [];
  for (const it of items) {
    const itemId = it.id ?? createdItems.find((ci) => ci.label === it.label)?.id;
    if (!itemId || !it.dependsOn) continue;
    for (const depId of it.dependsOn) {
      depRows.push({ item_id: itemId, depends_on_item_id: depId });
    }
  }
  return depRows;
}

export class ScheduleRepository {
  constructor(private readonly db: DbClient) {}

  async getItems(eventId: string): Promise<ScheduleItemWithDeps[]> {
    const items = await this.db
      .selectFrom('schedule_items')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('start_min', 'asc')
      .execute();

    if (items.length === 0) return [];

    const itemIds = items.map((i) => i.id);
    const deps = await this.db
      .selectFrom('schedule_dependencies')
      .selectAll()
      .where('item_id', 'in', itemIds)
      .execute();

    const depMap = new Map<string, string[]>();
    for (const dep of deps) {
      const arr = depMap.get(dep.item_id) ?? [];
      arr.push(dep.depends_on_item_id);
      depMap.set(dep.item_id, arr);
    }

    return items.map((item) => ({
      ...item,
      depends_on: depMap.get(item.id) ?? [],
    }));
  }

  async setItems(
    eventId: string,
    items: CreateScheduleItemInput[],
  ): Promise<ScheduleItemWithDeps[]> {
    return this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('schedule_items').where('event_id', '=', eventId).execute();

      if (items.length === 0) return [];

      const rows = items.map((it) => ({
        id: it.id ?? crypto.randomUUID(),
        event_id: eventId,
        label: it.label,
        start_min: it.startMin,
        duration_min: it.durationMin,
        fixed: it.fixed ?? false,
        buffer_min: it.bufferMin ?? 0,
        vendor: it.vendor ?? null,
        guest_visible: it.guestVisible ?? true,
        priority: it.priority ?? 3,
      }));

      const createdItems = await trx
        .insertInto('schedule_items')
        .values(rows)
        .returningAll()
        .execute();

      const depRows = buildDependencyRows(items, createdItems);

      if (depRows.length > 0) {
        await trx.insertInto('schedule_dependencies').values(depRows).execute();
      }

      const depMap = new Map<string, string[]>();
      for (const dep of depRows) {
        const arr = depMap.get(dep.item_id) ?? [];
        arr.push(dep.depends_on_item_id);
        depMap.set(dep.item_id, arr);
      }

      return createdItems.map((ci) => ({
        ...ci,
        depends_on: depMap.get(ci.id) ?? [],
      }));
    });
  }

  async updateItem(
    eventId: string,
    itemId: string,
    patch: Partial<Pick<ScheduleItemRow, 'start_min' | 'duration_min' | 'fixed' | 'label'>>,
  ): Promise<ScheduleItemRow | undefined> {
    return this.db
      .updateTable('schedule_items')
      .set({
        ...patch,
        updated_at: new Date(),
      })
      .where('event_id', '=', eventId)
      .where('id', '=', itemId)
      .returningAll()
      .executeTakeFirst();
  }
}
