# Assumptions

> Sensible defaults chosen where the prompt did not specify. Updated as decisions are made.

| #   | Assumption                | Default                                                               | Decided |
| --- | ------------------------- | --------------------------------------------------------------------- | ------- |
| A1  | Node.js version           | 24.x (user confirmed)                                                 | Phase 0 |
| A2  | Postgres/Redis management | User manages manually (no Docker Desktop required)                    | Phase 0 |
| A3  | Notification mode         | dry-run only; Twilio adapter built but untested with real credentials | Phase 0 |
| A4  | LLM mode for development  | fixture mode (no API key needed)                                      | Phase 0 |
| A5  | Package manager           | pnpm 10.x                                                             | Phase 0 |
| A6  | File storage              | Local `uploads/` directory, not S3                                    | Phase 0 |
| A7  | Default currency          | INR (paise = minor unit), configurable per event                      | Phase 0 |
| A8  | Price data                | Synthetic, clearly labeled "SAMPLE DATA"                              | Phase 0 |
| A9  | Docker Compose            | Provided for convenience but optional                                 | Phase 0 |
