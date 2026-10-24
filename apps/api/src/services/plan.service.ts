import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EventType } from '@eventpilot/shared';
import { allocateBudget } from '@eventpilot/engines';
import type { DbClient } from '../db/client.js';
import { BudgetRepository } from '../db/repositories/budget.repository.js';
import { ChecklistRepository } from '../db/repositories/checklist.repository.js';
import type { BudgetCategoryRow, ChecklistItemRow } from '../db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLES_DIR = path.resolve(__dirname, '../../../../samples');

interface BudgetTemplateCategory {
  id: string;
  label: string;
  weight: number;
  locked: boolean;
  floorPercent: number;
  priority: number;
}

interface BudgetWeightsFile {
  templates: Record<
    EventType,
    {
      name: string;
      categories: BudgetTemplateCategory[];
    }
  >;
}

interface ChecklistTemplateItem {
  id: string;
  category: string;
  title: string;
  description: string;
  daysBeforeEvent: number;
  priority: string;
  defaultStatus: string;
  role?: string;
}

interface ChecklistTemplateFile {
  items: ChecklistTemplateItem[];
}

export function loadBudgetWeights(): BudgetWeightsFile {
  const filePath = path.join(SAMPLES_DIR, 'budget-weights.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BudgetWeightsFile;
}

export function loadChecklistTemplate(eventType: EventType): ChecklistTemplateFile {
  const filePath = path.join(SAMPLES_DIR, 'checklist-templates', `${eventType}.json`);
  if (!fs.existsSync(filePath)) {
    return { items: [] };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ChecklistTemplateFile;
}

export function calculateRelativeDueDate(eventDateStr: string, daysBeforeEvent: number): string {
  try {
    const eventDate = new Date(eventDateStr);
    if (isNaN(eventDate.getTime())) return eventDateStr;

    const dueDateMs = eventDate.getTime() - daysBeforeEvent * 24 * 60 * 60 * 1000;
    return new Date(dueDateMs).toISOString().split('T')[0] ?? eventDateStr;
  } catch {
    return eventDateStr;
  }
}

export async function initializeEventPlan(
  db: DbClient,
  eventId: string,
  eventType: EventType,
  eventDate: string,
  totalBudgetMinor: number,
): Promise<{ budgetCategories: BudgetCategoryRow[]; checklistItems: ChecklistItemRow[] }> {
  const budgetRepo = new BudgetRepository(db);
  const checklistRepo = new ChecklistRepository(db);

  // 1. Initialize Budget Categories with Deterministic Allocation
  const weightsFile = loadBudgetWeights();
  const template = weightsFile.templates[eventType] ?? weightsFile.templates['wedding'];
  const categoriesConfig = template.categories;

  const engineInput = categoriesConfig.map((c) => ({
    id: c.id,
    name: c.label,
    weight: c.weight,
  }));

  const allocated = allocateBudget(totalBudgetMinor, engineInput, { contingencyFloorPercent: 5 });
  const allocatedMap = new Map(allocated.map((a) => [a.id, a.allocatedMinor]));

  const categoryRowsToSet = categoriesConfig.map((c) => ({
    categoryId: c.id,
    label: c.label,
    weight: c.weight,
    locked: c.locked,
    floorPercent: c.floorPercent,
    priority: c.priority,
    allocatedMinor: allocatedMap.get(c.id) ?? 0,
    spentMinor: 0,
  }));

  const savedCategories = await budgetRepo.setCategories(eventId, categoryRowsToSet);

  // 2. Initialize Checklist Items from Template
  const checklistFile = loadChecklistTemplate(eventType);
  const checklistItemsToSet = checklistFile.items.map((it) => ({
    id: crypto.randomUUID(),
    category: it.category,
    title: it.title,
    description: it.description,
    daysBeforeEvent: it.daysBeforeEvent,
    dueDate: calculateRelativeDueDate(eventDate, it.daysBeforeEvent),
    priority: it.priority,
    status: (it.defaultStatus as 'needed') || 'needed',
    role: it.role ?? null,
  }));

  const savedChecklist = await checklistRepo.setItems(eventId, checklistItemsToSet);

  return {
    budgetCategories: savedCategories,
    checklistItems: savedChecklist,
  };
}
