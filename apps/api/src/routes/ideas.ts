import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IdeaRepository } from '../db/repositories/idea.repository.js';
import { createAuthHook, getAuthEvent } from '../auth/middleware.js';
import { generateBudgetValidatedIdeas } from '../services/ideas.service.js';
import { notFoundError } from '@eventpilot/shared';
import type { LlmClient } from '../llm/types.js';
import type { DbClient } from '../db/client.js';

export function createIdeasRoutes(db: DbClient, llmClient?: LlmClient): FastifyPluginAsync {
  const ideaRepo = new IdeaRepository(db);
  const requireAuth = createAuthHook(db);

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/v1/events/:id/ideas - Generate personalized ideas with budget validation
    app.post('/api/v1/events/:id/ideas', { preHandler: [requireAuth] }, async (request, reply) => {
      const { eventId, event } = getAuthEvent(request);

      let ideas = [];
      if (llmClient) {
        const brief = JSON.parse(event.brief_json || '{}') as { vibe?: string[] };
        ideas = await generateBudgetValidatedIdeas(db, llmClient, eventId, {
          eventType: event.event_type,
          vibe: brief.vibe ?? ['festive'],
          city: event.location,
          guestCount: event.guest_count,
          totalBudgetMinor: Number(event.total_budget_minor),
        });
      } else {
        ideas = await ideaRepo.getIdeas(eventId);
      }

      return reply.status(201).send({
        ideas: ideas.map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          category: i.category,
          estimatedCostMinor: Number(i.estimated_cost_minor),
          whyFits: i.why_fits,
          status: i.status,
          createdAt: i.created_at,
        })),
      });
    });

    // GET /api/v1/events/:id/ideas - List ideas
    app.get('/api/v1/events/:id/ideas', { preHandler: [requireAuth] }, async (request, reply) => {
      const { eventId } = getAuthEvent(request);
      const ideas = await ideaRepo.getIdeas(eventId);

      return reply.send({
        ideas: ideas.map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          category: i.category,
          estimatedCostMinor: Number(i.estimated_cost_minor),
          whyFits: i.why_fits,
          status: i.status,
          createdAt: i.created_at,
        })),
      });
    });

    // POST /api/v1/events/:id/ideas/:ideaId/accept - Accept an idea into plan
    app.post(
      '/api/v1/events/:id/ideas/:ideaId/accept',
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const { eventId } = getAuthEvent(request);
        const { ideaId } = request.params as { ideaId: string };

        const updated = await ideaRepo.updateStatus(eventId, ideaId, 'accepted');
        if (!updated) {
          throw notFoundError(`Idea ${ideaId} not found`);
        }

        return reply.send({
          success: true,
          idea: {
            id: updated.id,
            title: updated.title,
            status: updated.status,
          },
        });
      },
    );
  };
}
