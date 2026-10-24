import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  proposeRebalanceSchema,
  type BudgetCategory,
  type ProposeRebalancePayload,
} from '@eventpilot/shared';
import { rebalanceBudget, type RebalanceConfig } from '@eventpilot/engines';
import { BudgetRepository } from '../db/repositories/budget.repository.js';
import { QuoteRepository } from '../db/repositories/quote.repository.js';
import { ChecklistRepository } from '../db/repositories/checklist.repository.js';
import { createAuthHook, getAuthEvent } from '../auth/middleware.js';
import { createLlmClient } from '../llm/client-factory.js';
import type { LlmClient } from '../llm/types.js';
import type { DbClient } from '../db/client.js';

const CategoryInputSchema = z.object({
  categoryId: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().nonnegative(),
  locked: z.boolean().default(false),
  floorPercent: z.number().nonnegative().default(0),
  priority: z.number().int().default(3),
  allocatedMinor: z.number().int().nonnegative(),
  spentMinor: z.number().int().nonnegative().default(0),
});

const PutBudgetSchema = z.object({
  categories: z.array(CategoryInputSchema).min(1),
});

const ProposalInputSchema = z.object({
  overrunMinor: z.number().int().positive(),
  overrunCategoryId: z.string().min(1),
  maxCutPercent: z.number().min(1).max(100).default(50),
  contingencyFloorPercent: z.number().min(0).max(100).default(5),
});

const ApplyCutSchema = z.object({
  categoryId: z.string().min(1),
  reduceByMinor: z.number().int().positive(),
  reason: z.string().min(1),
});

const ApplyRebalanceSchema = z.object({
  cuts: z.array(ApplyCutSchema).min(1),
  overrunCategoryId: z.string().min(1),
  overrunMinor: z.number().int().positive(),
  quoteId: z.string().optional(),
});

interface BudgetHandlersContext {
  budgetRepo: BudgetRepository;
  quoteRepo: QuoteRepository;
  checklistRepo: ChecklistRepository;
  llmClient: LlmClient;
}

function mapToDomainCategories(
  categories: Array<{
    category_id: string;
    label: string;
    weight: number | string;
    locked: boolean;
    floor_percent: number | string;
    priority: number | string;
    allocated_minor: number | string;
    spent_minor: number | string;
  }>,
): BudgetCategory[] {
  return categories.map((c) => ({
    id: c.category_id,
    label: c.label,
    weight: Number(c.weight),
    locked: Boolean(c.locked),
    floorPercent: Number(c.floor_percent),
    priority: Number(c.priority),
    allocatedMinor: Number(c.allocated_minor),
    spentMinor: Number(c.spent_minor),
  }));
}

async function handleGetBudget(
  request: FastifyRequest,
  reply: FastifyReply,
  budgetRepo: BudgetRepository,
) {
  const { eventId, event } = getAuthEvent(request);
  const categories = await budgetRepo.getCategories(eventId);

  const totalMinor = Number(event.total_budget_minor);
  const allocatedMinor = categories.reduce((sum, c) => sum + Number(c.allocated_minor), 0);
  const spentMinor = categories.reduce((sum, c) => sum + Number(c.spent_minor), 0);
  const remainingMinor = totalMinor - spentMinor;
  const contingencyCat = categories.find((c) => c.category_id === 'contingency');
  const contingencyMinor = contingencyCat ? Number(contingencyCat.allocated_minor) : 0;

  return reply.send({
    summary: {
      totalMinor,
      allocatedMinor,
      spentMinor,
      remainingMinor,
      contingencyMinor,
      unallocatedMinor: totalMinor - allocatedMinor,
    },
    categories: categories.map((c) => ({
      id: c.category_id,
      label: c.label,
      weight: Number(c.weight),
      locked: Boolean(c.locked),
      floorPercent: Number(c.floor_percent),
      priority: Number(c.priority),
      allocatedMinor: Number(c.allocated_minor),
      spentMinor: Number(c.spent_minor),
    })),
  });
}

async function handleRebalanceProposal(
  request: FastifyRequest,
  reply: FastifyReply,
  budgetRepo: BudgetRepository,
  llmClient: LlmClient,
) {
  const parsed = ProposalInputSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join(', '),
        requestId: request.id,
      },
    });
  }

  const { eventId, event } = getAuthEvent(request);
  const rawCategories = await budgetRepo.getCategories(eventId);
  const domainCategories = mapToDomainCategories(rawCategories);
  const { overrunMinor, overrunCategoryId, maxCutPercent, contingencyFloorPercent } = parsed.data;

  const config: RebalanceConfig = {
    categories: domainCategories,
    overrunMinor,
    overrunCategoryId,
    totalMinor: Number(event.total_budget_minor),
    maxCutPercent,
    contingencyFloorPercent,
  };

  let proposedCuts: ProposeRebalancePayload['cuts'] | undefined;
  try {
    const llmRes = await llmClient.callTool<ProposeRebalancePayload>({
      systemPrompt:
        'You are an event financial planner. Suggest realistic budget cuts across flexible categories to absorb a vendor booking overrun while fully respecting mandatory reserves.',
      userPrompt: `Overrun of ${String(overrunMinor)} paise in ${overrunCategoryId}. Categories: ${JSON.stringify(domainCategories)}.`,
      tool: {
        name: 'propose_rebalance',
        description: 'Propose budget cuts to absorb category overrun',
        schema: proposeRebalanceSchema,
      },
      purpose: 'propose_rebalance',
      eventId,
    });
    proposedCuts = llmRes.data.cuts;
  } catch {
    // If LLM fails or is in null mode, rebalanceBudget falls back to deterministic
  }

  const result = rebalanceBudget(config, proposedCuts);
  return reply.send({
    cuts: result.cuts,
    summary: result.summary,
    isFallback: result.isFallback,
  });
}

async function handleApplyRebalance(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: BudgetHandlersContext,
) {
  const parsed = ApplyRebalanceSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join(', '),
        requestId: request.id,
      },
    });
  }

  const { eventId } = getAuthEvent(request);
  const { cuts, overrunCategoryId, overrunMinor, quoteId } = parsed.data;
  const totalCuts = cuts.reduce((sum, c) => sum + c.reduceByMinor, 0);

  if (totalCuts !== overrunMinor) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Sum of cuts (${String(totalCuts)}) must equal overrun (${String(overrunMinor)})`,
        requestId: request.id,
      },
    });
  }

  const currentCategories = await ctx.budgetRepo.getCategories(eventId);
  const catMap = new Map(currentCategories.map((c) => [c.category_id, c]));

  // Apply cuts in memory to verify non-negative
  for (const cut of cuts) {
    const target = catMap.get(cut.categoryId);
    if (!target || Number(target.allocated_minor) < cut.reduceByMinor) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Category ${cut.categoryId} has insufficient allocation for cut`,
          requestId: request.id,
        },
      });
    }
  }

  // Persist each cut and ledger entry
  for (const cut of cuts) {
    const target = catMap.get(cut.categoryId);
    if (!target) continue;
    const prevMinor = Number(target.allocated_minor);
    const newMinor = prevMinor - cut.reduceByMinor;
    await ctx.budgetRepo.updateCategory(eventId, cut.categoryId, { allocated_minor: newMinor });
    await ctx.budgetRepo.appendLedgerEntry(eventId, {
      categoryId: cut.categoryId,
      previousMinor: prevMinor,
      newMinor,
      reason: cut.reason,
    });
  }

  // Absorb into overrunning category
  const overCat = catMap.get(overrunCategoryId);
  if (overCat) {
    const prevMinor = Number(overCat.allocated_minor);
    const newMinor = prevMinor + overrunMinor;
    await ctx.budgetRepo.updateCategory(eventId, overrunCategoryId, { allocated_minor: newMinor });
    await ctx.budgetRepo.appendLedgerEntry(eventId, {
      categoryId: overrunCategoryId,
      previousMinor: prevMinor,
      newMinor,
      reason: `Rebalance absorption of ${String(overrunMinor)} paise`,
    });
  }

  // If quoteId was booked
  if (quoteId) {
    await ctx.quoteRepo.updateStatus(eventId, quoteId, 'booked');
    await ctx.checklistRepo.updateCategoryStatus(eventId, overrunCategoryId, 'booked');
  }

  const updated = await ctx.budgetRepo.getCategories(eventId);
  return reply.send({ success: true, categories: updated });
}

export function createBudgetRoutes(db: DbClient, customLlmClient?: LlmClient): FastifyPluginAsync {
  const budgetRepo = new BudgetRepository(db);
  const quoteRepo = new QuoteRepository(db);
  const checklistRepo = new ChecklistRepository(db);
  const requireAuth = createAuthHook(db);
  const llmClient = customLlmClient ?? createLlmClient({ db });
  const ctx: BudgetHandlersContext = { budgetRepo, quoteRepo, checklistRepo, llmClient };

  return async function (app: FastifyInstance): Promise<void> {
    app.get('/api/v1/events/:id/budget', { preHandler: [requireAuth] }, async (req, rep) =>
      handleGetBudget(req, rep, budgetRepo),
    );

    app.put('/api/v1/events/:id/budget', { preHandler: [requireAuth] }, async (req, rep) => {
      const parsed = PutBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return rep.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
            requestId: req.id,
          },
        });
      }
      const { eventId } = getAuthEvent(req);
      const updated = await budgetRepo.setCategories(eventId, parsed.data.categories);
      return rep.send({ categories: updated });
    });

    app.get('/api/v1/events/:id/budget/ledger', { preHandler: [requireAuth] }, async (req, rep) => {
      const { eventId } = getAuthEvent(req);
      const ledger = await budgetRepo.getLedger(eventId);
      return rep.send({ entries: ledger });
    });

    app.post(
      '/api/v1/events/:id/budget/rebalance/proposal',
      { preHandler: [requireAuth] },
      async (req, rep) => handleRebalanceProposal(req, rep, budgetRepo, llmClient),
    );

    app.post(
      '/api/v1/events/:id/budget/rebalance/apply',
      { preHandler: [requireAuth] },
      async (req, rep) => handleApplyRebalance(req, rep, ctx),
    );
  };
}
