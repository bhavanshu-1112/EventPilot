import {
  validateBudget,
  validateRebalanceProposal,
  applyCuts,
  type RebalanceValidationConfig,
} from '../src/budget/validate.js';
import type { BudgetCategory, RebalanceCut } from '@eventpilot/shared';

function makeCategories(): BudgetCategory[] {
  return [
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
      locked: true,
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
}

const defaultValidationConfig: RebalanceValidationConfig = {
  totalMinor: 1_500_000,
  maxCutPercent: 30,
  contingencyFloorPercent: 5,
};

describe('validateBudget', () => {
  it('returns valid for correct allocations', () => {
    const categories = makeCategories();
    const total = categories.reduce((s, c) => s + c.allocatedMinor, 0);
    const result = validateBudget(categories, total);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects sum mismatch', () => {
    const categories = makeCategories();
    const result = validateBudget(categories, 999_999);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Sum of allocations'))).toBe(true);
  });

  it('detects negative allocations', () => {
    const categories = makeCategories();
    categories[0] = { ...categories[0]!, allocatedMinor: -100 };
    const total = categories.reduce((s, c) => s + c.allocatedMinor, 0);
    const result = validateBudget(categories, total);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('negative allocation'))).toBe(true);
  });

  it('detects both sum mismatch and negative allocations', () => {
    const categories = makeCategories();
    categories[0] = { ...categories[0]!, allocatedMinor: -100 };
    const result = validateBudget(categories, 999_999);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validateRebalanceProposal', () => {
  it('returns valid for acceptable cuts', () => {
    const categories = makeCategories();
    const cuts: RebalanceCut[] = [
      { categoryId: 'other', reduceByMinor: 20_000, reason: 'trim', impact: 'less misc' },
    ];
    const result = validateRebalanceProposal(categories, cuts, defaultValidationConfig);
    expect(result.valid).toBe(true);
  });

  it('rejects zero/negative cut amounts', () => {
    const categories = makeCategories();
    const cuts: RebalanceCut[] = [
      { categoryId: 'other', reduceByMinor: 0, reason: 'nothing', impact: '' },
    ];
    const result = validateRebalanceProposal(categories, cuts, defaultValidationConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be positive'))).toBe(true);
  });

  it('rejects cuts on locked categories', () => {
    const categories = makeCategories();
    const cuts: RebalanceCut[] = [
      { categoryId: 'catering', reduceByMinor: 10_000, reason: 'trim', impact: '' },
    ];
    const result = validateRebalanceProposal(categories, cuts, defaultValidationConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('locked'))).toBe(true);
  });

  it('rejects cuts on unknown categories', () => {
    const categories = makeCategories();
    const cuts: RebalanceCut[] = [
      { categoryId: 'nonexistent', reduceByMinor: 10_000, reason: 'trim', impact: '' },
    ];
    const result = validateRebalanceProposal(categories, cuts, defaultValidationConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown'))).toBe(true);
  });

  it('rejects cuts exceeding maxCutPercent', () => {
    const categories = makeCategories();
    // other has 75_000, maxCutPercent is 30, so max cut is 22_500
    const cuts: RebalanceCut[] = [
      { categoryId: 'other', reduceByMinor: 50_000, reason: 'trim', impact: '' },
    ];
    const result = validateRebalanceProposal(categories, cuts, defaultValidationConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds max'))).toBe(true);
  });

  it('rejects cuts that breach category floor', () => {
    const categories = makeCategories();
    const smallConfig: RebalanceValidationConfig = {
      totalMinor: 1_500_000,
      maxCutPercent: 95, // allow big cuts
      contingencyFloorPercent: 5,
    };
    const bigCuts: RebalanceCut[] = [
      { categoryId: 'entertainment', reduceByMinor: 65_000, reason: 'trim', impact: '' },
    ];
    // floor = 1% of 1_500_000 = 15_000, new = 75_000 - 65_000 = 10_000 < 15_000
    const result = validateRebalanceProposal(categories, bigCuts, smallConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('below floor'))).toBe(true);
  });

  it('rejects cuts that breach contingency floor', () => {
    const categories = makeCategories();
    // contingency: allocated 75_000, floor 5% of 1_500_000 = 75_000
    // Any cut breaches the floor
    const bigConfig: RebalanceValidationConfig = {
      totalMinor: 1_500_000,
      maxCutPercent: 95,
      contingencyFloorPercent: 5,
    };
    const cuts: RebalanceCut[] = [
      { categoryId: 'contingency', reduceByMinor: 1_000, reason: 'trim', impact: '' },
    ];
    const result = validateRebalanceProposal(categories, cuts, bigConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Contingency') || e.includes('below floor'))).toBe(
      true,
    );
  });
});

describe('applyCuts', () => {
  it('reduces cut categories and increases overrun category', () => {
    const categories = makeCategories();
    const cuts: RebalanceCut[] = [
      { categoryId: 'decor', reduceByMinor: 20_000, reason: 'trim', impact: '' },
      { categoryId: 'other', reduceByMinor: 10_000, reason: 'trim', impact: '' },
    ];
    const result = applyCuts(categories, cuts, 'venue', 30_000);

    const venue = result.find((c) => c.id === 'venue')!;
    const decor = result.find((c) => c.id === 'decor')!;
    const other = result.find((c) => c.id === 'other')!;

    expect(venue.allocatedMinor).toBe(375_000 + 30_000);
    expect(decor.allocatedMinor).toBe(225_000 - 20_000);
    expect(other.allocatedMinor).toBe(75_000 - 10_000);
  });

  it('preserves sum of allocations', () => {
    const categories = makeCategories();
    const originalSum = categories.reduce((s, c) => s + c.allocatedMinor, 0);
    const overrun = 30_000;
    const cuts: RebalanceCut[] = [
      { categoryId: 'decor', reduceByMinor: 15_000, reason: '', impact: '' },
      { categoryId: 'other', reduceByMinor: 15_000, reason: '', impact: '' },
    ];
    const result = applyCuts(categories, cuts, 'venue', overrun);
    const newSum = result.reduce((s, c) => s + c.allocatedMinor, 0);
    expect(newSum).toBe(originalSum);
  });

  it('does not modify categories without cuts', () => {
    const categories = makeCategories();
    const cuts: RebalanceCut[] = [
      { categoryId: 'other', reduceByMinor: 10_000, reason: '', impact: '' },
    ];
    const result = applyCuts(categories, cuts, 'venue', 10_000);
    const catering = result.find((c) => c.id === 'catering')!;
    expect(catering.allocatedMinor).toBe(450_000);
  });
});
