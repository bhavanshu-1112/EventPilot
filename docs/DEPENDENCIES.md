# Dependencies

> One-line justification per dependency. No dependency is added without a reason.

| Package                    | Justification                                                     |
| -------------------------- | ----------------------------------------------------------------- |
| fastify                    | Spec-mandated backend framework — fast, schema-based              |
| @fastify/cors              | CORS handling as required by spec §9.2                            |
| @fastify/helmet            | HTTP security headers (CSP) as required by spec §9.2              |
| @fastify/multipart         | File upload handling for quotes and inspiration images            |
| @fastify/rate-limit        | Redis-backed rate limiting as required by spec §9.2               |
| zod                        | Spec-mandated validation at every boundary                        |
| kysely                     | Spec-mandated type-safe SQL query builder                         |
| pg                         | PostgreSQL driver (required by kysely)                            |
| ioredis                    | Spec-mandated Redis client for live state, pub/sub, caching       |
| pino                       | Spec-mandated structured logger with redaction support            |
| react / react-dom          | Spec-mandated frontend framework                                  |
| vite                       | Spec-mandated build tool                                          |
| @vitejs/plugin-react       | Vite plugin for React JSX transform                               |
| tailwindcss                | Spec-mandated CSS framework                                       |
| @tanstack/react-query      | Spec-mandated data fetching and cache management                  |
| react-router-dom           | Spec-mandated client-side routing                                 |
| typescript                 | Spec-mandated type system                                         |
| eslint + typescript-eslint | Spec-mandated linting with strict mode                            |
| eslint-plugin-jsx-a11y     | Spec-mandated accessibility linting                               |
| prettier                   | Spec-mandated code formatting                                     |
| jest + ts-jest             | Spec-mandated backend + shared testing                            |
| fast-check                 | Spec-mandated property-based testing                              |
| vitest                     | Spec-mandated frontend testing                                    |
| @testing-library/react     | Spec-mandated component testing                                   |
| jest-axe                   | Spec-mandated accessibility assertion library                     |
| playwright                 | Spec-mandated e2e testing                                         |
| @axe-core/playwright       | Spec-mandated e2e accessibility testing                           |
| tsx                        | Dev-time TypeScript execution for API (replaces ts-node, lighter) |
| husky                      | Spec-mandated pre-commit hook runner                              |
| lint-staged                | Spec-mandated staged file linting                                 |
