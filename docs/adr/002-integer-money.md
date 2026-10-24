# ADR 002: Integer Money (Minor Units)

## Status

Accepted

## Context

Financial calculations with floating-point numbers lead to rounding errors (e.g., `0.1 + 0.2 !== 0.3`). EventPilot manages event budgets up to ₹15,00,000+ and must ensure that budget allocations sum exactly to the total.

## Decision

All money values are stored and computed as integers in minor units (paise for INR, cents for USD). The `allocateProportional` function uses the largest-remainder method to guarantee exact sums. Formatting to human-readable strings happens only at the UI edge.

## Consequences

- No floating-point arithmetic in money code paths
- `allocateProportional` guarantees `sum(allocations) === total`
- Database columns use `BIGINT` for money amounts
- The `formatMoney` function is the only place where division occurs (for display)
- All APIs accept and return amounts in minor units with clear field naming (`*Minor`)
