import { allocateBudget, type BudgetCategory } from '../src/budget/allocate.js';

describe('allocateBudget', () => {
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

  it('allocates budget so sum equals total exactly', () => {
    const total = 15_00_000_00; // ₹15,00,000 in paise
    const result = allocateBudget(total, defaultCategories);
    const sum = result.reduce((s, c) => s + c.allocatedMinor, 0);
    expect(sum).toBe(total);
  });

  it('produces no negative allocations', () => {
    const result = allocateBudget(100_000, defaultCategories);
    for (const cat of result) {
      expect(cat.allocatedMinor).toBeGreaterThanOrEqual(0);
    }
  });

  it('enforces contingency floor', () => {
    const total = 100_000;
    const result = allocateBudget(total, defaultCategories, { contingencyFloorPercent: 10 });
    const contingency = result.find((c) => c.id === 'contingency');
    expect(contingency).toBeDefined();
    expect(contingency?.allocatedMinor).toBeGreaterThanOrEqual(Math.ceil(total * 0.1));
  });

  it('throws on empty categories', () => {
    expect(() => allocateBudget(100_000, [])).toThrow('must not be empty');
  });

  it('throws on negative total', () => {
    expect(() => allocateBudget(-1, defaultCategories)).toThrow('non-negative');
  });
});
