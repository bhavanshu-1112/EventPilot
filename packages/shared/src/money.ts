/**
 * Integer-only money arithmetic in minor units (paise for INR).
 * No floats anywhere in money code. Format only at the UI edge.
 */

/** Supported currency codes */
export type CurrencyCode = 'INR' | 'USD';

/** Minor unit divisors per currency */
const MINOR_UNIT_DIVISOR: Record<CurrencyCode, number> = {
  INR: 100,
  USD: 100,
};

/** Currency symbols for formatting */
const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
};

/**
 * Add two money values in minor units.
 * Both must be integers; throws if not.
 */
export function addMoney(a: number, b: number): number {
  assertInteger(a, 'addMoney.a');
  assertInteger(b, 'addMoney.b');
  return a + b;
}

/**
 * Subtract b from a in minor units.
 * Both must be integers; throws if not.
 */
export function subtractMoney(a: number, b: number): number {
  assertInteger(a, 'subtractMoney.a');
  assertInteger(b, 'subtractMoney.b');
  return a - b;
}

/**
 * Multiply a minor-unit amount by an integer multiplier.
 * For fractional multipliers (e.g. percentages), use multiplyMoneyByFraction.
 */
export function multiplyMoney(amount: number, multiplier: number): number {
  assertInteger(amount, 'multiplyMoney.amount');
  assertInteger(multiplier, 'multiplyMoney.multiplier');
  return amount * multiplier;
}

/**
 * Multiply a minor-unit amount by a fractional value (e.g., 1.5 for 150%).
 * Result is rounded to the nearest integer using banker's rounding.
 */
export function multiplyMoneyByFraction(amount: number, fraction: number): number {
  assertInteger(amount, 'multiplyMoneyByFraction.amount');
  return bankersRound(amount * fraction);
}

/**
 * Allocate a total proportionally across buckets defined by weights.
 * Uses largest-remainder method to guarantee the sum equals the total exactly.
 * All weights must be non-negative. At least one weight must be positive.
 */
export function allocateProportional(total: number, weights: readonly number[]): number[] {
  assertInteger(total, 'allocateProportional.total');

  if (weights.length === 0) {
    throw new Error('allocateProportional: weights must not be empty');
  }

  const sumWeights = weights.reduce((s, w) => s + w, 0);
  if (sumWeights <= 0) {
    throw new Error('allocateProportional: sum of weights must be positive');
  }

  for (const [i, w] of weights.entries()) {
    if (w < 0) {
      throw new Error(`allocateProportional: weight at index ${i} is negative`);
    }
  }

  // Compute raw allocations and floor them
  const raw = weights.map((w) => (total * w) / sumWeights);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = total - floored.reduce((s, f) => s + f, 0);

  // Distribute remainder by largest fractional part (largest-remainder method)
  const fractionals = raw.map((r, i) => ({ index: i, frac: r - Math.floor(r) }));
  fractionals.sort((a, b) => b.frac - a.frac);

  for (const { index } of fractionals) {
    if (remainder <= 0) break;
    const current = floored[index];
    if (current !== undefined) {
      floored[index] = current + 1;
      remainder -= 1;
    }
  }

  return floored;
}

/**
 * Format a minor-unit amount for display.
 * Only call this at the UI edge — never use for computation.
 */
export function formatMoney(amountMinor: number, currency: CurrencyCode = 'INR'): string {
  assertInteger(amountMinor, 'formatMoney.amountMinor');

  const divisor = MINOR_UNIT_DIVISOR[currency];
  const symbol = CURRENCY_SYMBOLS[currency];
  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / divisor);
  const minor = abs % divisor;

  // Format with Indian/international grouping
  const majorStr = currency === 'INR' ? formatIndianGrouping(major) : major.toLocaleString('en-US');

  const formatted = `${symbol}${majorStr}.${String(minor).padStart(2, '0')}`;
  return isNegative ? `-${formatted}` : formatted;
}

/** Format a number with Indian grouping (e.g. 15,00,000) */
function formatIndianGrouping(n: number): string {
  const str = String(n);
  if (str.length <= 3) return str;

  const lastThree = str.slice(-3);
  const remaining = str.slice(0, -3);
  const grouped = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${grouped},${lastThree}`;
}

/** Banker's rounding (round half to even) */
function bankersRound(n: number): number {
  const floor = Math.floor(n);
  const decimal = n - floor;

  if (Math.abs(decimal - 0.5) < Number.EPSILON) {
    // Round to even
    return floor % 2 === 0 ? floor : floor + 1;
  }

  return Math.round(n);
}

/** Assert that a value is a safe integer */
function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer, got ${value}`);
  }
}
