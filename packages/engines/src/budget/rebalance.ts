/**
 * Budget rebalance engine.
 * When a booking exceeds its category allocation, this engine computes
 * how to redistribute the overrun across other categories.
 *
 * Two modes:
 * 1. LLM-proposed cuts (validated by validateRebalanceProposal)
 * 2. Deterministic fallback (proportional trim by priority weights)
 */
import type { BudgetCategory, RebalanceCut, RebalanceProposal } from '@eventpilot/shared';
import { validateRebalanceProposal, type RebalanceValidationConfig } from './validate.js';

export interface RebalanceConfig extends RebalanceValidationConfig {
  /** Categories to rebalance (current state) */
  readonly categories: readonly BudgetCategory[];
  /** Amount of overrun to absorb in minor units */
  readonly overrunMinor: number;
  /** Category that caused the overrun */
  readonly overrunCategoryId: string;
}

/**
 * Validate an LLM-proposed rebalance. Returns null if valid,
 * or validation errors if invalid.
 */
export function validateProposedCuts(
  config: RebalanceConfig,
  cuts: readonly RebalanceCut[],
): readonly string[] | null {
  const totalCut = cuts.reduce((acc, c) => acc + c.reduceByMinor, 0);
  const errors: string[] = [];

  // Total cuts must exactly equal the overrun
  if (totalCut !== config.overrunMinor) {
    errors.push(
      `Total cuts (${String(totalCut)}) must equal overrun (${String(config.overrunMinor)})`,
    );
  }

  const validation = validateRebalanceProposal(config.categories, cuts, config);
  errors.push(...validation.errors);

  return errors.length > 0 ? errors : null;
}

function computeCategoryMaxCut(
  cat: BudgetCategory,
  totalMinor: number,
  maxCutPercent: number,
  contingencyFloorPercent: number,
): number {
  const floor =
    cat.id === 'contingency'
      ? Math.ceil(totalMinor * (contingencyFloorPercent / 100))
      : Math.ceil(totalMinor * (cat.floorPercent / 100));
  return Math.min(
    Math.floor(cat.allocatedMinor * (maxCutPercent / 100)),
    cat.allocatedMinor - floor,
  );
}

function computeProportionalCuts(
  candidates: readonly { cat: BudgetCategory; maxCut: number }[],
  overrunMinor: number,
): { cuts: RebalanceCut[]; remaining: number } {
  const cuts: RebalanceCut[] = [];
  let remaining = overrunMinor;
  const totalPriority = candidates.reduce((acc, c) => acc + c.cat.priority, 0);

  for (const candidate of candidates) {
    if (remaining <= 0) break;
    const proportion =
      totalPriority > 0 ? candidate.cat.priority / totalPriority : 1 / candidates.length;
    const idealCut = Math.round(overrunMinor * proportion);
    const actualCut = Math.min(idealCut, candidate.maxCut, remaining);

    if (actualCut > 0) {
      cuts.push({
        categoryId: candidate.cat.id,
        reduceByMinor: actualCut,
        reason: `Proportional trim (priority ${String(candidate.cat.priority)})`,
        impact: `Reduced by ₹${String(Math.round(actualCut / 100))} (${String(Math.round((actualCut / candidate.cat.allocatedMinor) * 100))}%)`,
      });
      remaining -= actualCut;
    }
  }

  return { cuts, remaining };
}

function absorbRemainingByPriority(
  cuts: RebalanceCut[],
  candidates: readonly { cat: BudgetCategory; maxCut: number }[],
  remainingInitial: number,
): void {
  let remaining = remainingInitial;

  for (const candidate of candidates) {
    if (remaining <= 0) break;

    const existingCut = cuts.find((c) => c.categoryId === candidate.cat.id);
    const alreadyCut = existingCut?.reduceByMinor ?? 0;
    const additionalRoom = candidate.maxCut - alreadyCut;

    if (additionalRoom > 0) {
      const additionalCut = Math.min(additionalRoom, remaining);
      const totalCutForCat = alreadyCut + additionalCut;
      const impact = `Reduced by ₹${String(Math.round(totalCutForCat / 100))} (${String(Math.round((totalCutForCat / candidate.cat.allocatedMinor) * 100))}%)`;

      if (existingCut) {
        const idx = cuts.indexOf(existingCut);
        cuts[idx] = {
          ...existingCut,
          reduceByMinor: totalCutForCat,
          impact,
        };
      } else {
        cuts.push({
          categoryId: candidate.cat.id,
          reduceByMinor: additionalCut,
          reason: `Additional trim to absorb remaining overrun`,
          impact,
        });
      }
      remaining -= additionalCut;
    }
  }
}

/**
 * Deterministic fallback rebalance.
 * Distributes the overrun proportionally by priority weight across
 * unlocked categories, respecting floors and max cut percent.
 */
export function computeFallbackRebalance(config: RebalanceConfig): RebalanceProposal {
  const { categories, overrunMinor, totalMinor, maxCutPercent, contingencyFloorPercent } = config;

  const candidatesWithRoom = categories
    .filter((cat) => !cat.locked && cat.id !== config.overrunCategoryId)
    .map((cat) => ({
      cat,
      maxCut: computeCategoryMaxCut(cat, totalMinor, maxCutPercent, contingencyFloorPercent),
    }))
    .filter((c) => c.maxCut > 0);

  if (candidatesWithRoom.length === 0) {
    return {
      cuts: [],
      summary: 'No eligible categories to absorb the overrun.',
      isFallback: true,
    };
  }

  candidatesWithRoom.sort((a, b) => b.cat.priority - a.cat.priority);

  const { cuts, remaining } = computeProportionalCuts(candidatesWithRoom, overrunMinor);
  if (remaining > 0) {
    absorbRemainingByPriority(cuts, candidatesWithRoom, remaining);
  }

  const totalCut = cuts.reduce((acc, c) => acc + c.reduceByMinor, 0);
  const summary =
    remaining > 0
      ? `Partially absorbed ₹${String(Math.round(totalCut / 100))} of ₹${String(Math.round(overrunMinor / 100))} overrun. ₹${String(Math.round(remaining / 100))} could not be absorbed.`
      : `Absorbed full ₹${String(Math.round(overrunMinor / 100))} overrun across ${String(cuts.length)} categories.`;

  return { cuts, summary, isFallback: true };
}

/**
 * Attempt to validate LLM-proposed cuts. If invalid, fall back to deterministic.
 */
export function rebalanceBudget(
  config: RebalanceConfig,
  proposedCuts?: readonly RebalanceCut[],
): RebalanceProposal {
  if (proposedCuts) {
    const errors = validateProposedCuts(config, proposedCuts);
    if (!errors) {
      return {
        cuts: proposedCuts,
        summary: `LLM-proposed rebalance accepted: absorbed ₹${String(Math.round(config.overrunMinor / 100))} across ${String(proposedCuts.length)} categories.`,
        isFallback: false,
      };
    }
    // LLM proposal invalid — fall through to deterministic
  }

  return computeFallbackRebalance(config);
}
