import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  type ScheduleItem,
  type ScheduleFixOption,
  type ScheduleFixOperation,
  type ProposeScheduleFixesPayload,
  type DraftNotificationsPayload,
  type RippleResult,
  parseDisruptionSchema,
  proposeScheduleFixesSchema,
  draftNotificationsSchema,
} from '@eventpilot/shared';
import { computeRipple, rankFixOptions } from '@eventpilot/engines';
import { ScheduleRepository } from '../db/repositories/schedule.repository.js';
import { NotificationRepository } from '../db/repositories/notification.repository.js';
import { createAuthHook, getAuthEvent, authenticateToken } from '../auth/middleware.js';
import { validationError, notFoundError, unauthorizedError } from '@eventpilot/shared';
import { wrapUntrustedData } from '../llm/injection-defense.js';
import type { LlmClient } from '../llm/types.js';
import type { DbClient } from '../db/client.js';
import { liveStateService } from '../services/live-state.service.js';

interface DisruptionBody {
  transcript?: string;
  itemId?: string;
  delayMin?: number;
  reason?: string;
}

interface ApplyFixBody {
  operations: ScheduleFixOperation[];
  notify?: boolean;
  notifications?: Array<{
    contactId?: string;
    recipient: string;
    channel: 'sms' | 'whatsapp' | 'email';
    body: string;
  }>;
}

function findAffectedItemId(items: ScheduleItem[], target?: string): string {
  if (!target) return items[0]?.id ?? '';
  const exact = items.find((i) => i.id === target);
  if (exact) return exact.id;

  const lower = target.toLowerCase();
  const matched = items.find(
    (i) =>
      i.label.toLowerCase().includes(lower) || (i.vendor && i.vendor.toLowerCase().includes(lower)),
  );
  return matched?.id ?? items[0]?.id ?? '';
}

function buildDeterministicOptions(
  items: ScheduleItem[],
  affectedItemId: string,
  delayMin: number,
): ScheduleFixOption[] {
  const options: ScheduleFixOption[] = [
    {
      label: `Shift affected schedule item by ${delayMin} minutes`,
      operations: [{ op: 'shift', itemId: affectedItemId, minutes: delayMin }],
      rationale: 'Shifts subsequent dependent items downstream while maintaining order.',
      score: { fixedConflicts: 0, guestVisibleChanges: 0, totalMinutesMoved: 0 },
    },
  ];

  const affected = items.find((i) => i.id === affectedItemId);
  if (affected && !affected.fixed) {
    const swappable = items.find(
      (i) =>
        i.id !== affectedItemId && !i.fixed && Math.abs(i.durationMin - affected.durationMin) <= 30,
    );
    if (swappable) {
      options.push({
        label: `Swap ${affected.label} with ${swappable.label}`,
        operations: [{ op: 'swap', itemId: affectedItemId, swapWithId: swappable.id }],
        rationale: `Swaps time slot with ${swappable.label} to avoid cascading delays to key events.`,
        score: { fixedConflicts: 0, guestVisibleChanges: 0, totalMinutesMoved: 0 },
      });
    }
  }

  return options;
}

async function resolveDisruptionInput(
  body: DisruptionBody,
  llmClient: LlmClient | undefined,
  eventId: string,
): Promise<{
  delayMin: number;
  targetId?: string;
  reason: string;
  needsClarification: boolean;
  clarifyingQuestion?: string;
}> {
  let delayMin = body.delayMin ?? 60;
  let targetId = body.itemId;
  let reason = body.reason ?? 'Vendor arrival delayed';
  let needsClarification = false;
  let clarifyingQuestion: string | undefined;

  if (body.transcript && llmClient) {
    const llmRes = await llmClient.callTool({
      systemPrompt: 'Parse disruption reports into structured schedule delay parameters.',
      userPrompt: wrapUntrustedData(body.transcript),
      tool: {
        name: 'parse_disruption',
        description: 'Extract disruption delay parameters',
        schema: parseDisruptionSchema,
      },
      purpose: 'parse_disruption',
      eventId,
    });
    delayMin = llmRes.data.delayMin || 60;
    targetId = targetId ?? llmRes.data.itemId;
    reason = llmRes.data.reason;
    needsClarification = Boolean(llmRes.data.needsClarification);
    clarifyingQuestion = llmRes.data.clarifyingQuestion ?? undefined;
  }

  return { delayMin, targetId, reason, needsClarification, clarifyingQuestion };
}

async function fetchDomainScheduleItems(
  scheduleRepo: ScheduleRepository,
  eventId: string,
): Promise<ScheduleItem[]> {
  const rawItems = await scheduleRepo.getItems(eventId);
  if (rawItems.length === 0) {
    throw notFoundError('No schedule items found for this event');
  }

  return rawItems.map((i) => ({
    id: i.id,
    label: i.label,
    startMin: i.start_min,
    durationMin: i.duration_min,
    fixed: Boolean(i.fixed),
    bufferMin: i.buffer_min,
    vendor: i.vendor ?? undefined,
    guestVisible: Boolean(i.guest_visible),
    priority: i.priority,
    dependsOn: i.depends_on,
  }));
}

async function buildAndRankFixOptions(
  domainItems: ScheduleItem[],
  affectedItemId: string,
  delayMin: number,
  ripple: RippleResult,
  llmClient: LlmClient | undefined,
  eventId: string,
): Promise<ScheduleFixOption[]> {
  const candidateOptions = buildDeterministicOptions(domainItems, affectedItemId, delayMin);

  if (llmClient) {
    try {
      const llmFixes = await llmClient.callTool<ProposeScheduleFixesPayload>({
        systemPrompt: 'Propose viable fix options for delays.',
        userPrompt: wrapUntrustedData(
          JSON.stringify({ affectedItemId, delayMin, conflicts: ripple.conflicts }),
        ),
        tool: {
          name: 'propose_schedule_fixes',
          description: 'Propose candidate fix options',
          schema: proposeScheduleFixesSchema,
        },
        purpose: 'propose_schedule_fixes',
        eventId,
      });

      for (const opt of llmFixes.data.options) {
        candidateOptions.unshift({
          label: opt.label,
          operations: opt.operations.map((op) => ({
            op: op.op,
            itemId: findAffectedItemId(domainItems, op.itemId),
            minutes: op.minutes,
            swapWithId: op.swapWithId ? findAffectedItemId(domainItems, op.swapWithId) : undefined,
          })),
          rationale: opt.rationale,
          score: { fixedConflicts: 0, guestVisibleChanges: 0, totalMinutesMoved: 0 },
        });
      }
    } catch {
      // Retain deterministic options
    }
  }

  return rankFixOptions(domainItems, candidateOptions);
}

async function generateScheduleNotifications(
  reason: string,
  delayMin: number,
  affectedItemId: string,
  llmClient: LlmClient | undefined,
  eventId: string,
): Promise<Array<{ recipient: string; recipientName?: string; channel: string; body: string }>> {
  if (llmClient) {
    try {
      const drafted = await llmClient.callTool<DraftNotificationsPayload>({
        systemPrompt: 'Draft concise notifications for schedule changes.',
        userPrompt: wrapUntrustedData(JSON.stringify({ reason, delayMin, affectedItemId })),
        tool: {
          name: 'draft_notifications',
          description: 'Draft schedule delay broadcasts',
          schema: draftNotificationsSchema,
        },
        purpose: 'draft_notifications',
        eventId,
      });
      return drafted.data.messages;
    } catch {
      // Fallback below
    }
  }

  return [
    {
      recipient: '+919876543210',
      recipientName: 'Key Vendors & Staff',
      channel: 'whatsapp',
      body: `Timeline adjustment: ${reason}. Affected activities adjusted by ${delayMin} mins.`,
    },
  ];
}

async function applySingleOperation(
  trx: DbClient,
  eventId: string,
  op: ScheduleFixOperation,
): Promise<void> {
  if (op.op === 'shift' && op.minutes) {
    const item = await trx
      .selectFrom('schedule_items')
      .selectAll()
      .where('event_id', '=', eventId)
      .where('id', '=', op.itemId)
      .executeTakeFirst();
    if (item) {
      await trx
        .updateTable('schedule_items')
        .set({ start_min: item.start_min + op.minutes, updated_at: new Date() })
        .where('id', '=', op.itemId)
        .execute();
    }
  } else if (op.op === 'swap' && op.swapWithId) {
    const itemA = await trx
      .selectFrom('schedule_items')
      .selectAll()
      .where('event_id', '=', eventId)
      .where('id', '=', op.itemId)
      .executeTakeFirst();
    const itemB = await trx
      .selectFrom('schedule_items')
      .selectAll()
      .where('event_id', '=', eventId)
      .where('id', '=', op.swapWithId)
      .executeTakeFirst();
    if (itemA && itemB) {
      await trx
        .updateTable('schedule_items')
        .set({ start_min: itemB.start_min, updated_at: new Date() })
        .where('id', '=', itemA.id)
        .execute();
      await trx
        .updateTable('schedule_items')
        .set({ start_min: itemA.start_min, updated_at: new Date() })
        .where('id', '=', itemB.id)
        .execute();
    }
  } else if (op.op === 'cancel_optional') {
    await trx
      .deleteFrom('schedule_items')
      .where('event_id', '=', eventId)
      .where('id', '=', op.itemId)
      .execute();
  }
}

async function applyOperationsToDb(
  db: DbClient,
  eventId: string,
  operations: ScheduleFixOperation[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    for (const op of operations) {
      await applySingleOperation(trx as DbClient, eventId, op);
    }
  });
}

export function createScheduleRoutes(db: DbClient, llmClient?: LlmClient): FastifyPluginAsync {
  const scheduleRepo = new ScheduleRepository(db);
  const notifRepo = new NotificationRepository(db);
  const requireAuth = createAuthHook(db);

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/v1/events/:id/schedule - List timeline schedule items with dependencies
    app.get(
      '/api/v1/events/:id/schedule',
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const { eventId } = getAuthEvent(request);
        const items = await scheduleRepo.getItems(eventId);

        return reply.send({
          items: items.map((i) => ({
            id: i.id,
            label: i.label,
            startMin: i.start_min,
            durationMin: i.duration_min,
            fixed: Boolean(i.fixed),
            bufferMin: i.buffer_min,
            vendor: i.vendor,
            guestVisible: Boolean(i.guest_visible),
            priority: i.priority,
            dependsOn: i.depends_on,
          })),
        });
      },
    );

    // POST /api/v1/events/:id/disruptions - Parse disruption, compute ripple, propose & score fixes
    app.post(
      '/api/v1/events/:id/disruptions',
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const { eventId } = getAuthEvent(request);
        const body = (request.body ?? {}) as DisruptionBody;

        const resolved = await resolveDisruptionInput(body, llmClient, eventId);
        const domainItems = await fetchDomainScheduleItems(scheduleRepo, eventId);

        const affectedItemId = findAffectedItemId(domainItems, resolved.targetId);
        const ripple = computeRipple(domainItems, affectedItemId, resolved.delayMin);

        const rankedFixOptions = await buildAndRankFixOptions(
          domainItems,
          affectedItemId,
          resolved.delayMin,
          ripple,
          llmClient,
          eventId,
        );

        const draftNotifications = await generateScheduleNotifications(
          resolved.reason,
          resolved.delayMin,
          affectedItemId,
          llmClient,
          eventId,
        );

        const responsePayload = {
          disruption: {
            itemId: affectedItemId,
            delayMin: resolved.delayMin,
            reason: resolved.reason,
            needsClarification: resolved.needsClarification,
            clarifyingQuestion: resolved.clarifyingQuestion,
          },
          ripple,
          fixOptions: rankedFixOptions,
          draftNotifications,
        };

        liveStateService.broadcast(eventId, 'disruption_reported', responsePayload);
        return reply.send(responsePayload);
      },
    );

    // Handler for apply-fix
    const handleApplyFix = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const { eventId } = getAuthEvent(request);
      const body = (request.body ?? {}) as ApplyFixBody;

      if (!body.operations || !Array.isArray(body.operations) || body.operations.length === 0) {
        throw validationError('operations must be a non-empty array of fix actions');
      }

      await applyOperationsToDb(db, eventId, body.operations);

      if (body.notify && body.notifications && body.notifications.length > 0) {
        for (const notif of body.notifications) {
          await notifRepo.create(eventId, {
            contactId: notif.contactId ?? null,
            channel: notif.channel,
            recipient: notif.recipient,
            body: notif.body,
            status: 'draft',
            idempotencyKey: `${eventId}:${notif.recipient}:${notif.body.slice(0, 32)}`,
          });
        }
      }

      const updatedItems = await scheduleRepo.getItems(eventId);
      const result = {
        success: true,
        updatedItems: updatedItems.map((i) => ({
          id: i.id,
          label: i.label,
          startMin: i.start_min,
          durationMin: i.duration_min,
          fixed: Boolean(i.fixed),
          dependsOn: i.depends_on,
        })),
      };

      liveStateService.broadcast(eventId, 'schedule_updated', result);
      return reply.send(result);
    };

    app.post(
      '/api/v1/events/:id/disruptions/:fixId/apply-fix',
      { preHandler: [requireAuth] },
      handleApplyFix,
    );
    app.post(
      '/api/v1/events/:id/disruptions/apply-fix',
      { preHandler: [requireAuth] },
      handleApplyFix,
    );

    // GET /api/v1/events/:id/stream - SSE real-time updates for timeline and notifications
    app.get('/api/v1/events/:id/stream', async (request, reply) => {
      const { id: eventId } = request.params as { id: string };
      const query = request.query as { token?: string };
      const authHeader = request.headers.authorization;
      const rawToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : query.token;

      if (!rawToken) {
        throw unauthorizedError('Missing access token for SSE stream');
      }

      const authenticatedEvent = await authenticateToken(db, rawToken);
      if (!authenticatedEvent || authenticatedEvent.id !== eventId) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
      }

      liveStateService.registerClient(eventId, reply);
    });
  };
}
