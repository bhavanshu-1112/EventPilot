/**
 * Budget allocation engine — PURE logic, no I/O.
 *
 * Allocates a total budget across categories using configurable weights.
 * All amounts are in minor units (paise). No floats.
 */

import { allocateProportional } from '@eventpilot/shared';

export interface BudgetCategory {
  /** Unique category identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Weight for proportional allocation (higher = more budget) */
  readonly weight: number;
}

export interface AllocatedCategory {
  readonly id: string;
  readonly name: string;
  readonly allocatedMinor: number;
}

export interface AllocationConfig {
  /** Minimum contingency percentage (0-100). Default: 5 */
  readonly contingencyFloorPercent: number;
}

const DEFAULT_CONFIG: AllocationConfig = {
  contingencyFloorPercent: 5,
};

/**
 * Allocate a total budget across categories by weight.
 * Guarantees: sum of allocations === totalMinor, no negatives.
 */
export function allocateBudget(
  totalMinor: number,
  categories: readonly BudgetCategory[],
  config: AllocationConfig = DEFAULT_CONFIG,
): AllocatedCategory[] {
  if (categories.length === 0) {
    throw new Error('allocateBudget: categories must not be empty');
  }

  if (totalMinor < 0) {
    throw new Error('allocateBudget: totalMinor must be non-negative');
  }

  // Ensure contingency floor
  const contingencyCat = categories.find((c) => c.id === 'contingency');
  if (contingencyCat) {
    const minContingency = Math.ceil((totalMinor * config.contingencyFloorPercent) / 100);
    const weights = categories.map((c) => c.weight);
    const rawAllocations = allocateProportional(totalMinor, weights);

    // Check if contingency allocation meets the floor
    const contingencyIdx = categories.indexOf(contingencyCat);
    const contingencyAlloc = rawAllocations[contingencyIdx] ?? 0;

    if (contingencyAlloc < minContingency) {
      // Boost contingency to floor, redistribute the rest
      const remaining = totalMinor - minContingency;
      const otherCategories = categories.filter((c) => c.id !== 'contingency');
      const otherWeights = otherCategories.map((c) => c.weight);
      const otherAllocations = allocateProportional(remaining, otherWeights);

      const result: AllocatedCategory[] = [];
      let otherIdx = 0;
      for (const cat of categories) {
        if (cat.id === 'contingency') {
          result.push({ id: cat.id, name: cat.name, allocatedMinor: minContingency });
        } else {
          result.push({
            id: cat.id,
            name: cat.name,
            allocatedMinor: otherAllocations[otherIdx++] ?? 0,
          });
        }
      }
      return result;
    }
  }

  // Standard allocation
  const weights = categories.map((c) => c.weight);
  const allocations = allocateProportional(totalMinor, weights);

  return categories.map((cat, i) => ({
    id: cat.id,
    name: cat.name,
    allocatedMinor: allocations[i] ?? 0,
  }));
}
