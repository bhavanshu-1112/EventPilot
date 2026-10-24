import type { DbClient } from '../client.js';
import type { BomItemRow, BomItemTierRow, TierLevel } from '../schema.js';

export interface CreateBomTierInput {
  tier: TierLevel;
  name: string;
  priceMinor: number;
  description: string;
}

export interface CreateBomItemInput {
  id?: string;
  catalogKey: string;
  category: string;
  label: string;
  quantity: number;
  unit: string;
  selectedTier?: TierLevel;
  tiers: CreateBomTierInput[];
}

export interface BomItemWithTiers extends BomItemRow {
  tiers: BomItemTierRow[];
}

export class BomRepository {
  constructor(private readonly db: DbClient) {}

  async getBomItems(eventId: string): Promise<BomItemWithTiers[]> {
    const items = await this.db
      .selectFrom('bom_items')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('created_at', 'asc')
      .execute();

    if (items.length === 0) return [];

    const itemIds = items.map((i) => i.id);
    const tiers = await this.db
      .selectFrom('bom_item_tiers')
      .selectAll()
      .where('bom_item_id', 'in', itemIds)
      .execute();

    const tierMap = new Map<string, BomItemTierRow[]>();
    for (const t of tiers) {
      const arr = tierMap.get(t.bom_item_id) ?? [];
      arr.push(t);
      tierMap.set(t.bom_item_id, arr);
    }

    return items.map((item) => ({
      ...item,
      tiers: tierMap.get(item.id) ?? [],
    }));
  }

  async setBomItems(eventId: string, items: CreateBomItemInput[]): Promise<BomItemWithTiers[]> {
    return this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('bom_items').where('event_id', '=', eventId).execute();

      if (items.length === 0) return [];

      const createdItems: BomItemWithTiers[] = [];

      for (const input of items) {
        const itemId = input.id ?? crypto.randomUUID();
        const itemRow = await trx
          .insertInto('bom_items')
          .values({
            id: itemId,
            event_id: eventId,
            catalog_key: input.catalogKey,
            category: input.category,
            label: input.label,
            quantity: input.quantity,
            unit: input.unit,
            selected_tier: input.selectedTier ?? 'standard',
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        const tierRows: BomItemTierRow[] = [];
        if (input.tiers.length > 0) {
          const insertedTiers = await trx
            .insertInto('bom_item_tiers')
            .values(
              input.tiers.map((t) => ({
                id: crypto.randomUUID(),
                bom_item_id: itemId,
                tier: t.tier,
                name: t.name,
                price_minor: t.priceMinor,
                description: t.description,
              })),
            )
            .returningAll()
            .execute();
          tierRows.push(...insertedTiers);
        }

        createdItems.push({
          ...itemRow,
          tiers: tierRows,
        });
      }

      return createdItems;
    });
  }

  async updateSelectedTier(
    eventId: string,
    itemId: string,
    tier: TierLevel,
  ): Promise<BomItemRow | undefined> {
    return this.db
      .updateTable('bom_items')
      .set({ selected_tier: tier })
      .where('event_id', '=', eventId)
      .where('id', '=', itemId)
      .returningAll()
      .executeTakeFirst();
  }
}
