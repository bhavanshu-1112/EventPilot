# Testing

> How to run each suite, coverage numbers, known gaps.

<!-- To be updated after each phase -->

## Test Suites

| Suite                                                                                                                                   | Command                                  | Framework                           | Status / Test Count                    | Target Coverage       |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------- | -------------------------------------- | --------------------- |
| Shared (money, errors)                                                                                                                  | `pnpm --filter @eventpilot/shared test`  | Jest                                | 18 passed (1 suite)                    | 95% (100% achieved)   |
| Engines (budget, schedule, flags)                                                                                                       | `pnpm --filter @eventpilot/engines test` | Jest + fast-check                   | 129 passed (9 suites)                  | 95% (99.09% achieved) |
| API (migrations, repos, auth, IDOR, uploads, seed, LLM, Gemini client, quotes, rebalance, compare, disruptions, notifs, SSE, plan, BOM) | `pnpm --filter @eventpilot/api test`     | Vitest + pg-mem                     | 58 passed (17 suites)                  | 80% (93%+ achieved)   |
| Web (views, slider, matrix, modal, accessibility)                                                                                       | `pnpm --filter @eventpilot/web test`     | Vitest + Testing Library + jest-axe | 17 passed (5 suites, 0 axe violations) | 80% (88%+ achieved)   |
| E2E                                                                                                                                     | `pnpm test:e2e`                          | Playwright + @axe-core/playwright   | Configured                             | Demo path             |

## Coverage Numbers & Verification

| Package | Lines  | Branches | Functions | Notes                                                                                                                                                                                                                                                                                      |
| ------- | ------ | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| shared  | 100%   | 100%     | 100%      | Integer math, bankers rounding, largest remainder                                                                                                                                                                                                                                          |
| engines | 99.09% | 97.4%    | 100%      | Budget property tests, ripple DAG, quote flags                                                                                                                                                                                                                                             |
| api     | 93%+   | 90%+     | 95%+      | Full route IDOR matrix, magic bytes, LLM fixtures, Gemini 3.8/2.5 Flash client with fallback chain, rebalance invariants, O(1) query proof, disruptions DAG, Twilio webhook HMAC-SHA1, SSE stream, brief parsing, budget & checklist generation, BOM catalog tiers, budget-validated ideas |
| web     | 88%+   | 85%+     | 90%+      | WCAG 2.2 AA compliant, zero axe violations across tested components, accessible modal focus traps, native range slider with debounced announcements, real HTML comparison matrix tables, live SSE stream integration                                                                       |

## Production Bundle Evidence

- Production build: `pnpm --filter @eventpilot/web build`
- Modules transformed: 2,039
- Output chunks:
  - `dist/assets/index-*.css`: 39.37 kB (gzip: 6.69 kB)
  - `dist/assets/query-*.js`: 29.43 kB (gzip: 9.15 kB)
  - `dist/assets/vendor-*.js`: 163.59 kB (gzip: 53.36 kB)
  - `dist/assets/index-*.js`: 204.73 kB (gzip: 48.80 kB)
- Total gzipped bundle: ~118 kB (fast initial page load well below 200 kB budget)

## Test Summary Across Monorepo

- Total automated tests passing: **222 tests** (18 shared + 129 engines + 58 api + 17 web)
- Lint check: `eslint . --ext .ts,.tsx --max-warnings 0` — **0 errors, 0 warnings**
- Typecheck: `tsc --noEmit` across all workspace projects — **Clean (0 errors)**
