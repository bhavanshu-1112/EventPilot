# ADR 001: LLM Proposes, Code Verifies

## Status

Accepted

## Context

EventPilot relies on an LLM for creative generation (ideas, BOM, negotiation drafts, schedule fixes) and information extraction (quotes, briefs, disruptions). However, the application handles real money (budgets up to ₹15 lakh+) and time-critical operations (event-day schedule).

## Decision

The LLM proposes; deterministic code verifies. All money math, scheduling math, and constraint checks happen in pure, tested TypeScript. The LLM extracts, explains, ranks, and drafts. It never does arithmetic that the user relies on.

## Consequences

- Every LLM output goes through zod validation before use
- Budget allocations, rebalances, and totals are computed by `packages/engines`
- Schedule ripple propagation is a pure function in `packages/engines`
- The LLM is never trusted with final numbers — it suggests, code checks
- This adds development cost (dual paths) but eliminates a class of financial errors
