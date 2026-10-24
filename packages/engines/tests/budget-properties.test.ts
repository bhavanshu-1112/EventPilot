import fc from 'fast-check';
import { allocateBudget, type BudgetCategory } from '../src/budget/allocate.js';

// ── Property-based tests ───────────────────────────────────────────────

describe('allocateBudget property-based tests', () => {
  const arbTotal = fc.integer({ min: 0, max: 100_000_000 });

  const defaultCategories: BudgetCategory[] = [
    { id: 'venue', name: 'Venue', weight: 25 },
    { id: 'catering', name: 'Catering', weight: 30 },
    { id: 'decor', name: 'Decor', weight: 15 },
    { id: 'photography', name: 'Photography', weight: 10 },
    { id: 'entertainment', name: 'Entertainment', weight: 5 },
    { id: 'logistics', name: 'Logistics', weight: 5 },
    { id: 'contingency', name: 'Contingency', weight: 5 },
    { id: 'other', name: 'Other', weight: 5 },
  ];

  it('sum of allocations always equals total', () => {
    fc.assert(
      fc.property(arbTotal, (total) => {
        const result = allocateBudget(total, defaultCategories);
        const sum = result.reduce((s, c) => s + c.allocatedMinor, 0);
        expect(sum).toBe(total);
      }),
    );
  });

  it('no allocation is negative', () => {
    fc.assert(
      fc.property(arbTotal, (total) => {
        const result = allocateBudget(total, defaultCategories);
        for (const cat of result) {
          expect(cat.allocatedMinor).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it('contingency floor is respected', () => {
    fc.assert(
      fc.property(arbTotal, (total) => {
        const result = allocateBudget(total, defaultCategories, {
          contingencyFloorPercent: 5,
        });
        const contingency = result.find((c) => c.id === 'contingency');
        if (contingency && total > 0) {
          const minContingency = Math.ceil(total * 0.05);
          expect(contingency.allocatedMinor).toBeGreaterThanOrEqual(minContingency);
        }
      }),
    );
  });

  it('output has same number of categories as input', () => {
    fc.assert(
      fc.property(arbTotal, (total) => {
        const result = allocateBudget(total, defaultCategories);
        expect(result).toHaveLength(defaultCategories.length);
      }),
    );
  });

  it('category IDs are preserved', () => {
    fc.assert(
      fc.property(arbTotal, (total) => {
        const result = allocateBudget(total, defaultCategories);
        expect(result.map((c) => c.id)).toEqual(defaultCategories.map((c) => c.id));
      }),
    );
  });
});

// ── Performance benchmark ──────────────────────────────────────────────

describe('allocateBudget performance', () => {
  it('handles 200 categories in under 10ms', () => {
    const categories: BudgetCategory[] = [];
    for (let i = 0; i < 200; i++) {
      categories.push({
        id: `cat-${String(i)}`,
        name: `Category ${String(i)}`,
        weight: Math.floor(Math.random() * 20) + 1,
      });
    }
    // Add contingency
    categories.push({ id: 'contingency', name: 'Contingency', weight: 10 });

    const total = 50_000_000_00; // ₹5 crore in paise
    const start = performance.now();
    const result = allocateBudget(total, categories);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10);
    const sum = result.reduce((s, c) => s + c.allocatedMinor, 0);
    expect(sum).toBe(total);
  });
});
