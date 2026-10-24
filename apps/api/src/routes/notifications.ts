import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { NotificationRepository } from '../db/repositories/notification.repository.js';
import { createAuthHook, getAuthEvent } from '../auth/middleware.js';
import { notFoundError } from '@eventpilot/shared';
import type { DbClient } from '../db/client.js';
import type { Env } from '../config/env.js';
import {
  NotificationService,
  validateTwilioWebhookSignature,
  type SendResult,
} from '../services/notification.service.js';
import { liveStateService } from '../services/live-state.service.js';
import type { NotifyStatus } from '../db/schema.js';

interface SendNotificationBody {
  notificationId?: string;
  notificationIds?: string[];
}

function mapTwilioStatus(rawStatus: string): NotifyStatus {
  if (rawStatus === 'delivered' || rawStatus === 'sent') return 'sent';
  if (rawStatus === 'failed' || rawStatus === 'undelivered') return 'failed';
  return 'sent';
}

async function updateTwilioNotification(
  db: DbClient,
  rawParams: Record<string, string>,
): Promise<void> {
  const messageSid = rawParams['MessageSid'];
  const rawStatus = rawParams['MessageStatus'] ?? '';
  if (!messageSid || !rawStatus) return;

  const mappedStatus = mapTwilioStatus(rawStatus);
  await db
    .updateTable('notifications')
    .set({ status: mappedStatus })
    .where('recipient', '=', rawParams['To'] ?? '')
    .execute();
}

export function createNotificationsRoutes(db: DbClient, env?: Env): FastifyPluginAsync {
  const notifRepo = new NotificationRepository(db);
  const requireAuth = createAuthHook(db);

  return async function (app: FastifyInstance): Promise<void> {
    const effectiveEnv = env ?? app.env;
    const notifService = new NotificationService(db, effectiveEnv);

    // GET /api/v1/events/:id/notifications - Notification outbox
    app.get(
      '/api/v1/events/:id/notifications',
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const { eventId } = getAuthEvent(request);
        const notifications = await notifRepo.getNotifications(eventId);

        return reply.send({
          notifications: notifications.map((n) => ({
            id: n.id,
            contactId: n.contact_id,
            channel: n.channel,
            recipient: n.recipient,
            body: n.body,
            status: n.status,
            idempotencyKey: n.idempotency_key,
            sentAt: n.sent_at,
            createdAt: n.created_at,
          })),
        });
      },
    );

    // POST /api/v1/events/:id/notifications/send - Send drafted notifications
    app.post(
      '/api/v1/events/:id/notifications/send',
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const { eventId } = getAuthEvent(request);
        const body = (request.body ?? {}) as SendNotificationBody;

        const allNotifications = await notifRepo.getNotifications(eventId);

        let targets = allNotifications;
        if (body.notificationId) {
          targets = allNotifications.filter((n) => n.id === body.notificationId);
          if (targets.length === 0) {
            throw notFoundError(`Notification ${body.notificationId} not found`);
          }
        } else if (body.notificationIds && body.notificationIds.length > 0) {
          const idSet = new Set(body.notificationIds);
          targets = allNotifications.filter((n) => idSet.has(n.id));
        } else {
          // Send all pending/draft notifications
          targets = allNotifications.filter((n) => n.status === 'draft');
        }

        const results: SendResult[] = [];
        for (const notif of targets) {
          const res = await notifService.send(notif);
          results.push(res);
        }

        liveStateService.broadcast(eventId, 'notification_sent', { results });
        return reply.send({ results });
      },
    );

    // POST /api/v1/webhooks/twilio/status - Twilio delivery receipt webhook
    app.post('/api/v1/webhooks/twilio/status', async (request, reply) => {
      const signature = request.headers['x-twilio-signature'] as string | undefined;
      const protocol = request.headers['x-forwarded-proto'] || 'http';
      const host = request.headers.host || 'localhost';
      const fullUrl = `${protocol}://${host}${request.url}`;

      const rawParams = (request.body ?? {}) as Record<string, string>;

      const isValid = validateTwilioWebhookSignature(
        signature,
        fullUrl,
        rawParams,
        effectiveEnv.TWILIO_AUTH_TOKEN,
      );

      if (!isValid) {
        return reply
          .status(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Invalid Twilio webhook signature' } });
      }

      await updateTwilioNotification(db, rawParams);
      return reply.type('text/xml').send('<Response/>');
    });
  };
}
