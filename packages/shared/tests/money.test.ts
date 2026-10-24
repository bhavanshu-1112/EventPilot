import {
  addMoney,
  subtractMoney,
  multiplyMoney,
  multiplyMoneyByFraction,
  allocateProportional,
  formatMoney,
} from '../src/money.js';

describe('money utils', () => {
  describe('addMoney', () => {
    it('adds two integer amounts', () => {
      expect(addMoney(10000, 5000)).toBe(15000);
    });

    it('throws on non-integer input', () => {
      expect(() => addMoney(100.5, 200)).toThrow('safe integer');
    });
  });

  describe('subtractMoney', () => {
    it('subtracts two integer amounts', () => {
      expect(subtractMoney(10000, 3000)).toBe(7000);
    });

    it('allows negative results', () => {
      expect(subtractMoney(3000, 10000)).toBe(-7000);
    });
  });

  describe('multiplyMoney', () => {
    it('multiplies by an integer', () => {
      expect(multiplyMoney(500, 3)).toBe(1500);
    });

    it('throws on fractional multiplier', () => {
      expect(() => multiplyMoney(500, 1.5)).toThrow('safe integer');
    });
  });

  describe('multiplyMoneyByFraction', () => {
    it('multiplies by a fraction and rounds', () => {
      expect(multiplyMoneyByFraction(10000, 0.15)).toBe(1500);
    });

    it('uses bankers rounding for .5 cases', () => {
      // 5 * 0.5 = 2.5 → rounds to 2 (even)
      expect(multiplyMoneyByFraction(5, 0.5)).toBe(2);
      // 7 * 0.5 = 3.5 → rounds to 4 (even)
      expect(multiplyMoneyByFraction(7, 0.5)).toBe(4);
    });
  });

  describe('allocateProportional', () => {
    it('splits total exactly by weights', () => {
      const result = allocateProportional(10000, [50, 30, 20]);
      expect(result).toEqual([5000, 3000, 2000]);
    });

    it('handles remainders using largest-remainder method', () => {
      const result = allocateProportional(100, [1, 1, 1]);
      // 100/3 = 33.33... each, so two get 33 and one gets 34
      expect(result.reduce((s, v) => s + v, 0)).toBe(100);
      expect(result.sort()).toEqual([33, 33, 34]);
    });

    it('sum always equals total regardless of weights', () => {
      const result = allocateProportional(15_00_000, [25, 30, 15, 10, 5, 5, 5, 5]);
      expect(result.reduce((s, v) => s + v, 0)).toBe(15_00_000);
    });

    it('throws on empty weights', () => {
      expect(() => allocateProportional(1000, [])).toThrow('must not be empty');
    });

    it('throws on negative weights', () => {
      expect(() => allocateProportional(1000, [50, -10, 60])).toThrow('negative');
    });
  });

  describe('formatMoney', () => {
    it('formats INR with Indian grouping', () => {
      expect(formatMoney(15_00_000_00)).toBe('₹15,00,000.00');
    });

    it('formats small amounts', () => {
      expect(formatMoney(5075)).toBe('₹50.75');
    });

    it('formats negative amounts', () => {
      expect(formatMoney(-250000)).toBe('-₹2,500.00');
    });

    it('formats USD', () => {
      expect(formatMoney(125099, 'USD')).toBe('$1,250.99');
    });

    it('pads minor units', () => {
      expect(formatMoney(100)).toBe('₹1.00');
    });
  });
});
