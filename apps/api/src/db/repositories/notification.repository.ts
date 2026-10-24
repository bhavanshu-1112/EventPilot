import type { DbClient } from '../client.js';
import type { NotificationRow, NotifyChannel, NotifyStatus } from '../schema.js';

export interface CreateNotificationInput {
  id?: string;
  contactId?: string | null;
  channel: NotifyChannel;
  recipient: string;
  body: string;
  status?: NotifyStatus;
  idempotencyKey: string;
}

export class NotificationRepository {
  constructor(private readonly db: DbClient) {}

  async create(eventId: string, input: CreateNotificationInput): Promise<NotificationRow> {
    // If idempotency_key exists, return existing
    const existing = await this.db
      .selectFrom('notifications')
      .selectAll()
      .where('idempotency_key', '=', input.idempotencyKey)
      .executeTakeFirst();

    if (existing) {
      return existing;
    }

    return this.db
      .insertInto('notifications')
      .values({
        id: input.id ?? crypto.randomUUID(),
        event_id: eventId,
        contact_id: input.contactId ?? null,
        channel: input.channel,
        recipient: input.recipient,
        body: input.body,
        status: input.status ?? 'draft',
        idempotency_key: input.idempotencyKey,
        sent_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async getNotifications(eventId: string): Promise<NotificationRow[]> {
    return this.db
      .selectFrom('notifications')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async updateStatus(id: string, status: NotifyStatus, sentAt?: Date): Promise<boolean> {
    const result = await this.db
      .updateTable('notifications')
      .set({
        status,
        sent_at: sentAt ?? (status === 'sent' ? new Date() : null),
      })
      .where('id', '=', id)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }
}
