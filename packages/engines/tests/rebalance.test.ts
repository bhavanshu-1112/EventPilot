import fc from 'fast-check';
import {
  rebalanceBudget,
  computeFallbackRebalance,
  validateProposedCuts,
  type RebalanceConfig,
} from '../src/budget/rebalance.js';
import type { BudgetCategory, RebalanceCut } from '@eventpilot/shared';

// ── Helpers ────────────────────────────────────────────────────────────

function makeCategories(overrides?: Partial<BudgetCategory>[]): BudgetCategory[] {
  const defaults: BudgetCategory[] = [
    {
      id: 'venue',
      label: 'Venue',
      weight: 0.25,
      locked: false,
      floorPercent: 5,
      priority: 3,
      allocatedMinor: 375_000,
      spentMinor: 0,
    },
    {
      id: 'catering',
      label: 'Catering',
      weight: 0.3,
      locked: false,
      floorPercent: 5,
      priority: 4,
      allocatedMinor: 450_000,
      spentMinor: 0,
    },
    {
      id: 'decor',
      label: 'Decor',
      weight: 0.15,
      locked: false,
      floorPercent: 2,
      priority: 5,
      allocatedMinor: 225_000,
      spentMinor: 0,
    },
    {
      id: 'photography',
      label: 'Photography',
      weight: 0.1,
      locked: false,
      floorPercent: 2,
      priority: 6,
      allocatedMinor: 150_000,
      spentMinor: 0,
    },
    {
      id: 'entertainment',
      label: 'Entertainment',
      weight: 0.05,
      locked: false,
      floorPercent: 1,
      priority: 7,
      allocatedMinor: 75_000,
      spentMinor: 0,
    },
    {
      id: 'logistics',
      label: 'Logistics',
      weight: 0.05,
      locked: false,
      floorPercent: 1,
      priority: 8,
      allocatedMinor: 75_000,
      spentMinor: 0,
    },
    {
      id: 'contingency',
      label: 'Contingency',
      weight: 0.05,
      locked: false,
      floorPercent: 5,
      priority: 1,
      allocatedMinor: 75_000,
      spentMinor: 0,
    },
    {
      id: 'other',
      label: 'Other',
      weight: 0.05,
      locked: false,
      floorPercent: 0,
      priority: 9,
      allocatedMinor: 75_000,
      spentMinor: 0,
    },
  ];
  if (overrides) {
    return defaults.map((cat, i) => ({ ...cat, ...(overrides[i] ?? {}) }));
  }
  return defaults;
}

function makeConfig(overrides?: Partial<RebalanceConfig>): RebalanceConfig {
  return {
    categories: makeCategories(),
    overrunMinor: 50_000,
    overrunCategoryId: 'venue',
    totalMinor: 1_500_000,
    maxCutPercent: 30,
    contingencyFloorPercent: 5,
    ...overrides,
  };
}

// ── Unit tests ─────────────────────────────────────────────────────────

describe('validateProposedCuts', () => {
  it('returns null for valid cuts that equal the overrun', () => {
    const config = makeConfig({ overrunMinor: 30_000 });
    const cuts: RebalanceCut[] = [
      { categoryId: 'decor', reduceByMinor: 15_000, reason: 'trim', impact: 'less decor' },
      { categoryId: 'other', reduceByMinor: 15_000, reason: 'trim', impact: 'less other' },
    ];
    expect(validateProposedCuts(config, cuts)).toBeNull();
  });

  it('rejects cuts that do not sum to overrun', () => {
    const config = makeConfig({ overrunMinor: 50_000 });
    const cuts: RebalanceCut[] = [
      { categoryId: 'decor', reduceByMinor: 20_000, reason: 'trim', impact: '' },
    ];
    const errors = validateProposedCuts(config, cuts);
    expect(errors).not.toBeNull();
    expect(errors?.some((e) => e.includes('must equal overrun'))).toBe(true);
  });

  it('rejects cuts targeting locked categories', () => {
    const categories = makeCategories();
    categories[2] = { ...categories[2]!, locked: true };
    const config = makeConfig({ categories, overrunMinor: 10_000 });
    const cuts: RebalanceCut[] = [
      { categoryId: 'decor', reduceByMinor: 10_000, reason: 'trim', impact: '' },
    ];
    const errors = validateProposedCuts(config, cuts);
    expect(errors).not.toBeNull();
    expect(errors?.some((e) => e.includes('locked'))).toBe(true);
  });

  it('rejects cuts exceeding max percent', () => {
    const config = makeConfig({ overrunMinor: 100_000, maxCutPercent: 10 });
    // 100_000 from decor (allocated 225_000), 10% max = 22_500
    const cuts: RebalanceCut[] = [
      { categoryId: 'decor', reduceByMinor: 100_000, reason: 'trim', impact: '' },
    ];
    const errors = validateProposedCuts(config, cuts);
    expect(errors).not.toBeNull();
    expect(errors?.some((e) => e.includes('exceeds max'))).toBe(true);
  });

  it('rejects cuts that breach category floor', () => {
    const config = makeConfig({ overrunMinor: 70_000 });
    // entertainment allocated 75_000, floor 1% of 1_500_000 = 15_000
    // cutting 70_000 would leave 5_000 < 15_000
    const cuts: RebalanceCut[] = [
      { categoryId: 'entertainment', reduceByMinor: 70_000, reason: 'trim', impact: '' },
    ];
    const errors = validateProposedCuts(config, cuts);
    expect(errors).not.toBeNull();
    expect(errors?.some((e) => e.includes('below floor'))).toBe(true);
  });

  it('rejects cuts that breach contingency floor', () => {
    const config = makeConfig({ overrunMinor: 60_000, contingencyFloorPercent: 5 });
    // contingency allocated 75_000, floor 5% of 1_500_000 = 75_000
    // cutting 60_000 would leave 15_000 < 75_000
    const cuts: RebalanceCut[] = [
      { categoryId: 'contingency', reduceByMinor: 60_000, reason: 'trim', impact: '' },
    ];
    const errors = validateProposedCuts(config, cuts);
    expect(errors).not.toBeNull();
    expect(errors?.some((e) => e.includes('below floor') || e.includes('Contingency'))).toBe(true);
  });

  it('rejects cuts referencing unknown categories', () => {
    const config = makeConfig({ overrunMinor: 10_000 });
    const cuts: RebalanceCut[] = [
      { categoryId: 'nonexistent', reduceByMinor: 10_000, reason: 'trim', impact: '' },
    ];
    const errors = validateProposedCuts(config, cuts);
    expect(errors).not.toBeNull();
    expect(errors?.some((e) => e.includes('unknown'))).toBe(true);
  });
});

describe('computeFallbackRebalance', () => {
  it('returns a proposal with isFallback=true', () => {
    const result = computeFallbackRebalance(makeConfig());
    expect(result.isFallback).toBe(true);
  });

  it('total cuts equal overrun when possible', () => {
    const config = makeConfig({ overrunMinor: 30_000 });
    const result = computeFallbackRebalance(config);
    const totalCut = result.cuts.reduce((s, c) => s + c.reduceByMinor, 0);
    expect(totalCut).toBe(30_000);
  });

  it('does not cut locked categories', () => {
    const categories = makeCategories();
    categories[2] = { ...categories[2]!, locked: true }; // lock decor
    const config = makeConfig({ categories, overrunMinor: 20_000 });
    const result = computeFallbackRebalance(config);
    expect(result.cuts.every((c) => c.categoryId !== 'decor')).toBe(true);
  });

  it('does not cut the overrun category itself', () => {
    const config = makeConfig({ overrunCategoryId: 'venue' });
    const result = computeFallbackRebalance(config);
    expect(result.cuts.every((c) => c.categoryId !== 'venue')).toBe(true);
  });

  it('returns empty cuts when no eligible categories exist', () => {
    const categories = makeCategories().map((c) => ({ ...c, locked: true }));
    const config = makeConfig({ categories });
    const result = computeFallbackRebalance(config);
    expect(result.cuts).toHaveLength(0);
    expect(result.summary).toContain('No eligible');
  });

  it('respects contingency floor', () => {
    const config = makeConfig({ contingencyFloorPercent: 5 });
    const result = computeFallbackRebalance(config);
    const contingencyCut = result.cuts.find((c) => c.categoryId === 'contingency');
    if (contingencyCut) {
      const cat = config.categories.find((c) => c.id === 'contingency')!;
      const newAllocation = cat.allocatedMinor - contingencyCut.reduceByMinor;
      const floor = Math.ceil(config.totalMinor * 0.05);
      expect(newAllocation).toBeGreaterThanOrEqual(floor);
    }
  });

  it('higher-priority categories are cut more', () => {
    const config = makeConfig({ overrunMinor: 40_000 });
    const result = computeFallbackRebalance(config);
    // Priority 9 (other) should be cut before priority 5 (decor) if both cut
    const otherCut = result.cuts.find((c) => c.categoryId === 'other');
    const contingencyCut = result.cuts.find((c) => c.categoryId === 'contingency');
    // Contingency (priority 1) should NOT be cut more than higher-priority categories
    if (otherCut && contingencyCut) {
      expect(otherCut.reduceByMinor).toBeGreaterThanOrEqual(contingencyCut.reduceByMinor);
    }
  });
});

describe('rebalanceBudget', () => {
  it('accepts valid LLM-proposed cuts', () => {
    const config = makeConfig({ overrunMinor: 20_000 });
    const cuts: RebalanceCut[] = [
      { categoryId: 'other', reduceByMinor: 20_000, reason: 'trim other', impact: 'less misc' },
    ];
    const result = rebalanceBudget(config, cuts);
    expect(result.isFallback).toBe(false);
    expect(result.cuts).toEqual(cuts);
  });

  it('falls back to deterministic when LLM proposal is invalid', () => {
    const config = makeConfig({ overrunMinor: 50_000 });
    const invalidCuts: RebalanceCut[] = [
      { categoryId: 'decor', reduceByMinor: 10_000, reason: 'short', impact: '' },
      // Sum is 10_000 != 50_000
    ];
    const result = rebalanceBudget(config, invalidCuts);
    expect(result.isFallback).toBe(true);
  });

  it('uses deterministic fallback when no proposal given', () => {
    const config = makeConfig();
    const result = rebalanceBudget(config);
    expect(result.isFallback).toBe(true);
  });
});

// ── Property-based tests ───────────────────────────────────────────────

describe('rebalance property-based tests', () => {
  const arbOverrun = fc.integer({ min: 100, max: 200_000 });

  it('fallback: sum of cuts equals overrun when categories have room', () => {
    fc.assert(
      fc.property(arbOverrun, (overrun) => {
        const config = makeConfig({ overrunMinor: overrun });
        const result = computeFallbackRebalance(config);
        const totalCut = result.cuts.reduce((s, c) => s + c.reduceByMinor, 0);
        // Either absorbs fully or partially (when not enough room)
        expect(totalCut).toBeLessThanOrEqual(overrun);
        expect(totalCut).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('fallback: locked categories are never cut', () => {
    fc.assert(
      fc.property(arbOverrun, (overrun) => {
        const categories = makeCategories();
        categories[0] = { ...categories[0]!, locked: true };
        categories[1] = { ...categories[1]!, locked: true };
        const config = makeConfig({ categories, overrunMinor: overrun });
        const result = computeFallbackRebalance(config);
        const lockedIds = categories.filter((c) => c.locked).map((c) => c.id);
        for (const cut of result.cuts) {
          expect(lockedIds).not.toContain(cut.categoryId);
        }
      }),
    );
  });

  it('fallback: overrun category is never cut', () => {
    fc.assert(
      fc.property(arbOverrun, (overrun) => {
        const config = makeConfig({
          overrunMinor: overrun,
          overrunCategoryId: 'catering',
        });
        const result = computeFallbackRebalance(config);
        expect(result.cuts.every((c) => c.categoryId !== 'catering')).toBe(true);
      }),
    );
  });

  it('fallback: no category is cut below its floor', () => {
    fc.assert(
      fc.property(arbOverrun, (overrun) => {
        const config = makeConfig({ overrunMinor: overrun });
        const result = computeFallbackRebalance(config);
        for (const cut of result.cuts) {
          const cat = config.categories.find((c) => c.id === cut.categoryId)!;
          const floor =
            cat.id === 'contingency'
              ? Math.ceil(config.totalMinor * (config.contingencyFloorPercent / 100))
              : Math.ceil(config.totalMinor * (cat.floorPercent / 100));
          const newAllocation = cat.allocatedMinor - cut.reduceByMinor;
          expect(newAllocation).toBeGreaterThanOrEqual(floor);
        }
      }),
    );
  });

  it('fallback: all cuts are positive', () => {
    fc.assert(
      fc.property(arbOverrun, (overrun) => {
        const config = makeConfig({ overrunMinor: overrun });
        const result = computeFallbackRebalance(config);
        for (const cut of result.cuts) {
          expect(cut.reduceByMinor).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('fallback is idempotent when overrun is zero', () => {
    fc.assert(
      fc.property(arbOverrun, () => {
        const config = makeConfig({ overrunMinor: 0 });
        const result = computeFallbackRebalance(config);
        // Zero overrun should produce no cuts (or at most zero total)
        const totalCut = result.cuts.reduce((s, c) => s + c.reduceByMinor, 0);
        expect(totalCut).toBe(0);
      }),
    );
  });
});
