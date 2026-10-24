import type { DbClient } from '../db/client.js';
import { IdeaRepository } from '../db/repositories/idea.repository.js';
import { BudgetRepository } from '../db/repositories/budget.repository.js';
import type { LlmClient } from '../llm/types.js';
import { generateIdeasSchema, type GenerateIdeasPayload } from '@eventpilot/shared';
import { wrapUntrustedData } from '../llm/injection-defense.js';
import type { IdeaRow } from '../db/schema.js';

export async function generateBudgetValidatedIdeas(
  db: DbClient,
  llmClient: LlmClient,
  eventId: string,
  eventContext: {
    eventType: string;
    vibe: string[];
    city: string;
    guestCount: number;
    totalBudgetMinor: number;
  },
): Promise<IdeaRow[]> {
  const budgetRepo = new BudgetRepository(db);
  const ideaRepo = new IdeaRepository(db);

  // 1. Calculate remaining unspent budget
  const categories = await budgetRepo.getCategories(eventId);
  const spentMinor = categories.reduce((sum, c) => sum + Number(c.spent_minor), 0);
  const remainingBudgetMinor = eventContext.totalBudgetMinor - spentMinor;

  // 2. Call LLM for personalized ideas
  const promptContext = {
    ...eventContext,
    remainingBudgetMinor,
  };

  const llmRes = await llmClient.callTool<GenerateIdeasPayload>({
    systemPrompt:
      'You are a bespoke event experience designer. Propose personalized ideas that strictly respect the client remaining budget.',
    userPrompt: wrapUntrustedData(JSON.stringify(promptContext)),
    tool: {
      name: 'generate_ideas',
      description: 'Generate personalized event ideas within budget constraints',
      schema: generateIdeasSchema,
    },
    purpose: 'generate_ideas',
    eventId,
  });

  // 3. Strict budget validation: Filter out any ideas exceeding remaining budget
  const validIdeas = llmRes.data.ideas.filter((idea) => idea.estCostMinor <= remainingBudgetMinor);

  // 4. Persist to database
  const created = await ideaRepo.createIdeas(
    eventId,
    validIdeas.map((i) => ({
      title: i.title,
      description: i.description,
      category: i.category,
      estimatedCostMinor: i.estCostMinor,
      whyFits: i.whyItFits,
      status: 'suggested',
    })),
  );

  return created;
}
