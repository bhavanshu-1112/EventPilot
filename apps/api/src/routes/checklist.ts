import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ChecklistRepository } from '../db/repositories/checklist.repository.js';
import { createAuthHook, getAuthEvent } from '../auth/middleware.js';
import type { DbClient } from '../db/client.js';

const PatchChecklistSchema = z.object({
  status: z.enum(['needed', 'shortlisted', 'quoted', 'booked']).optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  role: z.string().nullable().optional(),
});

export function createChecklistRoutes(db: DbClient): FastifyPluginAsync {
  const checklistRepo = new ChecklistRepository(db);
  const requireAuth = createAuthHook(db);

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/v1/events/:id/checklist - Pre-event vendor checklist
    app.get(
      '/api/v1/events/:id/checklist',
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const { eventId } = getAuthEvent(request);
        const items = await checklistRepo.getItems(eventId);

        return reply.send({
          items: items.map((i) => ({
            id: i.id,
            category: i.category,
            title: i.title,
            description: i.description,
            dueDate: i.due_date,
            daysBeforeEvent: i.days_before_event,
            priority: i.priority,
            status: i.status,
            role: i.role,
          })),
        });
      },
    );

    // PATCH /api/v1/events/:id/checklist/:itemId - Update item status or due date
    app.patch(
      '/api/v1/events/:id/checklist/:itemId',
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const { itemId } = request.params as { itemId: string };
        const parsed = PatchChecklistSchema.safeParse(request.body);

        if (!parsed.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: parsed.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', '),
              requestId: request.id,
            },
          });
        }

        const { eventId } = getAuthEvent(request);
        const updated = await checklistRepo.updateItem(eventId, itemId, {
          status: parsed.data.status,
          due_date: parsed.data.dueDate,
          priority: parsed.data.priority,
          role: parsed.data.role,
        });

        if (!updated) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Checklist item not found',
              requestId: request.id,
            },
          });
        }

        return reply.send({ item: updated });
      },
    );
  };
}
