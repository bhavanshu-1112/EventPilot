# Security Policy & Threat Model

> **EventPilot enforces security in depth across all tiers: data access, file ingestion, LLM pipelines, and external integrations.**

---

## 🛡️ STRIDE Threat Model & Verified Mitigations

| Asset             | Threat (STRIDE)                       | Implemented Mitigation                                                                                                                                                                                                                                                                                | Verification Status & Proof                                                                                                  |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Event Data**    | **Information Disclosure (IDOR)**     | Per-event cryptographically random access tokens (`ep_live_...`). Fastify auth preHandler strictly checks `event.id == request.params.id`. Any mismatch yields HTTP 403 Forbidden.                                                                                                                    | **Delivered & Verified** (`apps/api/tests/auth-idor.test.ts`: cross-tenant token tests pass on all routes)                   |
| **File Uploads**  | **Tampering, Elevation of Privilege** | Magic-byte file header validation (`%PDF` for quotes, `\xFF\xD8\xFF` / `\x89PNG` for inspiration). Files stored under sanitized random UUIDs outside web root. File size capped at 10 MB (quotes) and 5 MB (images). Non-PDF/images rejected with 400.                                                | **Delivered & Verified** (`apps/api/tests/uploads.test.ts`: PDF & image validation tests pass)                               |
| **LLM Gateway**   | **Spoofing, Prompt Injection**        | Multi-layer injection defense pipeline: heuristic detection regexes, untrusted text wrapped in strict `<untrusted_user_content>` delimiters, forced tool execution (`tool_choice: { type: 'tool' }`), and strict Zod runtime schema validation. Direct free-text LLM execution is barred.             | **Delivered & Verified** (`apps/api/tests/injection-defense.test.ts`: 5 injection tests pass)                                |
| **Notifications** | **Repudiation, Denial of Service**    | Default `NOTIFY_MODE=dry-run` ensures zero external SMS charges in testing. In live mode, outbound SMS/WhatsApp messages are restricted to `NOTIFY_ALLOWLIST`. Duplicate sends blocked by unique idempotency keys in DB. Incoming Twilio status callbacks require valid HMAC-SHA1 request signatures. | **Delivered & Verified** (`apps/api/tests/notifications-delivery.test.ts`: allowlist, idempotency, HMAC tests pass)          |
| **API Endpoints** | **Denial of Service**                 | Rate limiting backed by Redis token bucket algorithm (`@fastify/rate-limit`). Maximum request body size capped at 10 MB. Connection timeouts and query bounds on list queries.                                                                                                                        | **Delivered & Verified** (`apps/api/tests/health.test.ts`, `apps/api/tests/compare-queries.test.ts`: O(1) query count proof) |

---

## 🔒 Defense-in-Depth Implementation Highlights

1. **IDOR Defense on Every Handler**:
   - Every single route under `/api/v1/events/:id/*` executes an authorization guard verifying that the bearer token explicitly belongs to the requested `eventId`.
   - Access tokens are generated with high-entropy cryptographic primitives (`crypto.randomBytes(24).toString('base64url')`).
2. **Deterministic Engine Isolation**:
   - `packages/engines` is completely stateless and has zero dependencies on network or database drivers, preventing any SSRF or unauthorized data exfiltration from calculation code.
3. **Twilio Webhook Integrity**:
   - Incoming delivery receipt webhooks on `/api/v1/notifications/webhooks/twilio` compute `crypto.createHmac('sha1', authToken)` across the full URL and sorted POST parameters, rejecting forged callbacks with 403.
4. **Append-Only Financial Audit Trail**:
   - Budgets are tracked via an append-only ledger (`budget_ledger`). Category rebalances record both debit and credit entries with delta reasons, ensuring full financial traceability.

---

## ⚠️ Known Limitations & Operational Considerations

- **Local Development Secrets**: In local development, mock API keys (`sk-ant-test-placeholder`) and `NOTIFY_MODE=dry-run` are configured by default in `.env.example` to prevent accidental vendor spend.
- **OCR / Scanned PDF Limitations**: The quote parser extracts text using structured PDF stream parsing (`pdf-parse`). High-resolution photographed quotes without an embedded text layer require OCR preprocessing.
