import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EventRepository } from '../db/repositories/event.repository.js';
import { CeremonyRepository } from '../db/repositories/ceremony.repository.js';
import { generateEventToken, hashEventToken } from '../auth/tokens.js';
import { createAuthHook, getAuthEvent } from '../auth/middleware.js';
import { initializeEventPlan } from '../services/plan.service.js';
import { parseBriefSchema, type ParseBriefPayload } from '@eventpilot/shared';
import { wrapUntrustedData } from '../llm/injection-defense.js';
import type { LlmClient } from '../llm/types.js';
import type { DbClient } from '../db/client.js';

const CeremonyInputSchema = z.object({
  name: z.string().min(1),
  date: z.string().optional(),
  startTime: z.string().optional(),
  durationMin: z.number().int().positive().optional(),
  venue: z.string().optional(),
});

const CreateEventSchema = z.object({
  name: z.string().min(1).max(255),
  eventType: z.enum(['wedding', 'birthday', 'community']),
  location: z.string().min(1).max(255),
  eventDate: z.string().min(1),
  guestCount: z.number().int().positive(),
  totalBudgetMinor: z.number().int().nonnegative(),
  currency: z.string().max(8).default('INR'),
  brief: z.record(z.unknown()).optional(),
  ceremonies: z.array(CeremonyInputSchema).optional(),
});

const PatchEventSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  location: z.string().min(1).max(255).optional(),
  guestCount: z.number().int().positive().optional(),
  totalBudgetMinor: z.number().int().nonnegative().optional(),
});

const ParseBriefBodySchema = z.object({
  brief: z.string().min(10),
});

export function createEventsRoutes(db: DbClient, llmClient?: LlmClient): FastifyPluginAsync {
  const eventRepo = new EventRepository(db);
  const ceremonyRepo = new CeremonyRepository(db);
  const requireAuth = createAuthHook(db);

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/v1/events/parse-brief - Parse free-text brief into structured fields
    app.post('/api/v1/events/parse-brief', async (request, reply) => {
      const parsed = ParseBriefBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
            requestId: request.id,
          },
        });
      }

      if (llmClient) {
        const llmRes = await llmClient.callTool<ParseBriefPayload>({
          systemPrompt:
            'You are an expert event planning architect. Parse free-text celebration briefs into comprehensive structured parameters.',
          userPrompt: wrapUntrustedData(parsed.data.brief),
          tool: {
            name: 'parse_brief',
            description: 'Parse free-text event brief',
            schema: parseBriefSchema,
          },
          purpose: 'parse_brief',
        });
        return reply.send({ brief: llmRes.data });
      }

      return reply.send({
        brief: {
          eventType: 'wedding',
          dates: ['2026-11-20'],
          city: 'Udaipur',
          guestCount: 300,
          budgetMinor: 150000000,
          currency: 'INR',
          vibe: ['royal'],
          mustHaves: [],
          dietary: [],
          accessibility: [],
          languages: ['English', 'Hindi'],
          ceremonies: [],
        },
      });
    });

    // POST /api/v1/events - Create new event, generate token, auto-seed budget and checklist
    app.post('/api/v1/events', async (request, reply) => {
      const parsed = CreateEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
            requestId: request.id,
          },
        });
      }

      const rawToken = generateEventToken();
      const accessTokenHash = hashEventToken(rawToken);

      const event = await eventRepo.create({
        name: parsed.data.name,
        eventType: parsed.data.eventType,
        location: parsed.data.location,
        eventDate: parsed.data.eventDate,
        guestCount: parsed.data.guestCount,
        totalBudgetMinor: parsed.data.totalBudgetMinor,
        currency: parsed.data.currency,
        accessTokenHash,
        briefJson: JSON.stringify(parsed.data.brief ?? {}),
      });

      // Save ceremonies if provided
      if (parsed.data.ceremonies && parsed.data.ceremonies.length > 0) {
        await ceremonyRepo.createCeremonies(
          event.id,
          parsed.data.ceremonies.map((c) => ({
            name: c.name,
            ceremonyDate: c.date,
            startTime: c.startTime,
            durationMin: c.durationMin,
            venue: c.venue,
          })),
        );
      }

      // Auto-initialize budget categories and checklist from templates
      const plan = await initializeEventPlan(
        db,
        event.id,
        event.event_type,
        event.event_date,
        Number(event.total_budget_minor),
      );

      return reply.status(201).send({
        event: {
          id: event.id,
          name: event.name,
          eventType: event.event_type,
          location: event.location,
          eventDate: event.event_date,
          guestCount: event.guest_count,
          totalBudgetMinor: Number(event.total_budget_minor),
          currency: event.currency,
          createdAt: event.created_at,
        },
        accessToken: rawToken,
        budget: plan.budgetCategories,
        checklist: plan.checklistItems,
      });
    });

    // GET /api/v1/events/:id - Get event details (scoped by token)
    app.get('/api/v1/events/:id', { preHandler: [requireAuth] }, async (request, reply) => {
      const event = request.event;
      if (!event) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Event not found', requestId: request.id },
        });
      }

      const ceremonies = await ceremonyRepo.getCeremonies(event.id);

      return reply.send({
        event: {
          id: event.id,
          name: event.name,
          eventType: event.event_type,
          location: event.location,
          eventDate: event.event_date,
          guestCount: event.guest_count,
          totalBudgetMinor: Number(event.total_budget_minor),
          currency: event.currency,
          brief: JSON.parse(event.brief_json || '{}'),
          ceremonies,
          createdAt: event.created_at,
          updatedAt: event.updated_at,
        },
      });
    });

    // PATCH /api/v1/events/:id - Update event details
    app.patch('/api/v1/events/:id', { preHandler: [requireAuth] }, async (request, reply) => {
      const parsed = PatchEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
            requestId: request.id,
          },
        });
      }

      const { eventId } = getAuthEvent(request);
      const updated = await eventRepo.update(eventId, {
        name: parsed.data.name,
        location: parsed.data.location,
        guest_count: parsed.data.guestCount,
        total_budget_minor: parsed.data.totalBudgetMinor,
      });

      return reply.send({ event: updated });
    });
  };
}
