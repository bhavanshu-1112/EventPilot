import type { DbClient } from '../client.js';
import type { EventRow, EventType } from '../schema.js';

export interface CreateEventInput {
  id?: string;
  name: string;
  eventType: EventType;
  location: string;
  eventDate: string;
  guestCount: number;
  totalBudgetMinor: number;
  currency?: string;
  accessTokenHash: string;
  briefJson?: string;
}

export class EventRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: CreateEventInput): Promise<EventRow> {
    const id = input.id ?? crypto.randomUUID();
    const result = await this.db
      .insertInto('events')
      .values({
        id,
        name: input.name,
        event_type: input.eventType,
        location: input.location,
        event_date: input.eventDate,
        guest_count: input.guestCount,
        total_budget_minor: input.totalBudgetMinor,
        currency: input.currency ?? 'INR',
        access_token_hash: input.accessTokenHash,
        brief_json: input.briefJson ?? '{}',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  async findById(id: string): Promise<EventRow | undefined> {
    return this.db.selectFrom('events').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByTokenHash(tokenHash: string): Promise<EventRow | undefined> {
    return this.db
      .selectFrom('events')
      .selectAll()
      .where('access_token_hash', '=', tokenHash)
      .executeTakeFirst();
  }

  async update(
    id: string,
    patch: Partial<Omit<EventRow, 'id' | 'created_at'>>,
  ): Promise<EventRow | undefined> {
    return this.db
      .updateTable('events')
      .set({
        ...patch,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('events').where('id', '=', id).executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }
}
