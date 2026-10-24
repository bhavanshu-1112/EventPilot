import type { DbClient } from '../client.js';
import type { CeremonyRow } from '../schema.js';

export interface CreateCeremonyInput {
  id?: string;
  name: string;
  ceremonyDate?: string;
  startTime?: string;
  durationMin?: number;
  venue?: string | null;
}

export class CeremonyRepository {
  constructor(private readonly db: DbClient) {}

  async getCeremonies(eventId: string): Promise<CeremonyRow[]> {
    return this.db
      .selectFrom('ceremonies')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('ceremony_date', 'asc')
      .execute();
  }

  async createCeremonies(
    eventId: string,
    ceremonies: CreateCeremonyInput[],
  ): Promise<CeremonyRow[]> {
    if (ceremonies.length === 0) return [];

    const rows = ceremonies.map((c) => ({
      id: c.id ?? crypto.randomUUID(),
      event_id: eventId,
      name: c.name,
      ceremony_date: c.ceremonyDate ?? '2026-11-20',
      start_time: c.startTime ?? '18:00',
      duration_min: c.durationMin ?? 180,
      venue: c.venue ?? null,
    }));

    return this.db.insertInto('ceremonies').values(rows).returningAll().execute();
  }
}
