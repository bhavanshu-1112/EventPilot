import type { DbClient } from '../client.js';
import type { ContactRow, NotifyChannel } from '../schema.js';

export interface CreateContactInput {
  id?: string;
  name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  preferredChannel?: NotifyChannel;
}

export class ContactRepository {
  constructor(private readonly db: DbClient) {}

  async getContacts(eventId: string): Promise<ContactRow[]> {
    return this.db
      .selectFrom('contacts')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('name', 'asc')
      .execute();
  }

  async setContacts(eventId: string, contacts: CreateContactInput[]): Promise<ContactRow[]> {
    return this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('contacts').where('event_id', '=', eventId).execute();

      if (contacts.length === 0) return [];

      const rows = contacts.map((c) => ({
        id: c.id ?? crypto.randomUUID(),
        event_id: eventId,
        name: c.name,
        role: c.role,
        phone: c.phone ?? null,
        email: c.email ?? null,
        preferred_channel: c.preferredChannel ?? 'whatsapp',
      }));

      return trx.insertInto('contacts').values(rows).returningAll().execute();
    });
  }
}
