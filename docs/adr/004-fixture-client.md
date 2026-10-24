# ADR 004: Fixture Client for LLM

## Status

Accepted

## Context

LLM calls are expensive, slow, and non-deterministic. Tests and demos must be reliable, fast, and offline-capable.

## Decision

Implement three `LlmClient` implementations behind a single interface:

1. **AnthropicClient** — real API calls (LLM_MODE=live)
2. **FixtureClient** — replays recorded responses keyed by prompt hash (LLM_MODE=fixture)
3. **NullClient** — throws a clear error (catches misconfiguration)

## Consequences

- All tests run with FixtureClient — no API key needed, deterministic, fast
- The demo runs in fixture mode by default — works offline, instant
- `pnpm record-fixtures` captures live responses for the fixture library
- Contract tests validate fixture responses against zod schemas
- CI never hits the real API — no cost, no flakiness, no rate limiting
- Live eval (`pnpm eval:extract`) is optional and never blocks CI
