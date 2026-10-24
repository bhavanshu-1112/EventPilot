import crypto from 'node:crypto';
import type { DbClient } from '../db/client.js';
import { NotificationRepository } from '../db/repositories/notification.repository.js';
import type { NotificationRow, NotifyStatus } from '../db/schema.js';
import type { Env } from '../config/env.js';

export interface SendResult {
  notificationId: string;
  status: NotifyStatus;
  mode: 'dry-run' | 'twilio';
  error?: string;
  messageSid?: string;
}

/**
 * Validates a Twilio webhook signature according to Twilio's security documentation.
 * HMAC-SHA1 of (URL + sorted_params_keys_and_values) with authToken as secret.
 */
export function validateTwilioWebhookSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
  authToken: string,
): boolean {
  if (!signature || !authToken) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += `${key}${params[key] ?? ''}`;
  }

  const expectedHmac = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  try {
    const sigBuf = Buffer.from(signature, 'utf-8');
    const expectedBuf = Buffer.from(expectedHmac, 'utf-8');
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

export class NotificationService {
  private readonly notifRepo: NotificationRepository;

  constructor(
    private readonly db: DbClient,
    private readonly env: Env,
  ) {
    this.notifRepo = new NotificationRepository(db);
  }

  private isAllowedRecipient(recipient: string): boolean {
    const allowlist = this.env.NOTIFY_ALLOWLIST.split(',')
      .map((num) => num.trim().replace(/\s+/g, ''))
      .filter(Boolean);

    if (allowlist.length === 0) return false;
    const cleanRecipient = recipient.trim().replace(/\s+/g, '');
    return allowlist.includes(cleanRecipient);
  }

  async send(notification: NotificationRow): Promise<SendResult> {
    const mode = this.env.NOTIFY_MODE;

    if (mode === 'dry-run') {
      await this.notifRepo.updateStatus(notification.id, 'sent', new Date());
      return {
        notificationId: notification.id,
        status: 'sent',
        mode: 'dry-run',
      };
    }

    // Twilio mode
    if (!this.isAllowedRecipient(notification.recipient)) {
      await this.notifRepo.updateStatus(notification.id, 'draft');
      return {
        notificationId: notification.id,
        status: 'draft',
        mode: 'twilio',
        error: `RECIPIENT_NOT_IN_ALLOWLIST: ${notification.recipient} is not in NOTIFY_ALLOWLIST`,
      };
    }

    if (
      !this.env.TWILIO_ACCOUNT_SID ||
      !this.env.TWILIO_AUTH_TOKEN ||
      !this.env.TWILIO_FROM_NUMBER
    ) {
      await this.notifRepo.updateStatus(notification.id, 'failed');
      return {
        notificationId: notification.id,
        status: 'failed',
        mode: 'twilio',
        error: 'TWILIO_CONFIG_MISSING: Missing Account SID, Auth Token, or From Number',
      };
    }

    try {
      const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${this.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      const authHeader = Buffer.from(
        `${this.env.TWILIO_ACCOUNT_SID}:${this.env.TWILIO_AUTH_TOKEN}`,
      ).toString('base64');

      const bodyParams = new URLSearchParams({
        To: notification.recipient,
        From: this.env.TWILIO_FROM_NUMBER,
        Body: notification.body,
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await this.notifRepo.updateStatus(notification.id, 'failed');
        return {
          notificationId: notification.id,
          status: 'failed',
          mode: 'twilio',
          error: `Twilio API error: ${response.status} ${errorText}`,
        };
      }

      const resJson = (await response.json()) as { sid?: string };
      await this.notifRepo.updateStatus(notification.id, 'sent', new Date());

      return {
        notificationId: notification.id,
        status: 'sent',
        mode: 'twilio',
        messageSid: resJson.sid,
      };
    } catch (err) {
      await this.notifRepo.updateStatus(notification.id, 'failed');
      return {
        notificationId: notification.id,
        status: 'failed',
        mode: 'twilio',
        error: err instanceof Error ? err.message : 'Unknown Twilio error',
      };
    }
  }
}
