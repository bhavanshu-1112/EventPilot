# CLAUDE.md — EventPilot Context File

> This file holds the commands, architecture rules and quality bars from the project prompt.
> It survives context resets. Update it whenever a convention changes.

## Quick Commands

```bash
# Install
pnpm install

# Dev
pnpm dev          # Run API + Web concurrently
pnpm dev:api      # API only
pnpm dev:web      # Web only

# Quality
pnpm lint         # ESLint (strict TS + jsx-a11y, complexity <= 10)
pnpm typecheck    # TypeScript strict, noUncheckedIndexedAccess
pnpm test         # All test suites
pnpm test:e2e     # Playwright e2e tests

# Build & seed
pnpm build        # Production build
pnpm seed         # Load seed data into Postgres

# Infrastructure
docker compose up -d  # Start Postgres + Redis (optional — configure via .env)
```

## Architecture Rules

1. **Layering**: routes (HTTP only) → services (use cases) → repositories (SQL only). Engines are pure and import nothing from I/O layers.
2. **Dependency injection**: Everything external (LLM, Twilio, clock, Redis) sits behind an interface and is injected. Every service is testable without network access.
3. **Validation at every boundary**: zod for HTTP input, LLM output, env vars, DB rows where cheap.
4. **Integer money**: Money is an integer in minor units (paise). No floats anywhere in money code. Format only at the UI edge. Default currency INR.
5. **Typed errors**: `AppError` with code, HTTP status, safe message. No swallowed exceptions. No `any`. No non-null assertions without a comment.
6. **LLM boundary**: The AI proposes, deterministic code verifies. All money math, scheduling math and constraint checks happen in pure, tested TypeScript. The LLM extracts, explains, ranks and drafts. It never does arithmetic that the user relies on.
7. **No scope creep**: If an idea is not in PROMPT.md, put it in docs/BACKLOG.md.

## Quality Bars

| Parameter        | Target                                                           |
| ---------------- | ---------------------------------------------------------------- |
| TypeScript       | strict + noUncheckedIndexedAccess, no any, no @ts-ignore         |
| ESLint           | complexity ≤ 10, typescript-eslint strict, jsx-a11y              |
| Engine coverage  | ≥ 95% line coverage                                              |
| Overall coverage | ≥ 80%                                                            |
| A11y             | WCAG 2.2 AA, Lighthouse ≥ 95, zero axe violations                |
| Bundle size      | < 200 KB gzipped initial JS                                      |
| Performance      | Ripple: 500 items < 50ms, Budget: 200 categories < 10ms          |
| Security         | IDOR tests on every route, injection tests, no secrets committed |

## Commit Convention

One conventional commit per phase: `feat:`, `test:`, `fix:`, `docs:`, `chore:`.

## Monorepo Layout

```
apps/api        — Fastify backend
apps/web        — React + Vite frontend
packages/shared — zod schemas, types, money utils
packages/engines — PURE logic (budget, schedule, quote-flags) — NO I/O
samples/        — seed data, synthetic PDFs, LLM fixtures
docs/           — architecture, security, testing, a11y, scorecard
```
