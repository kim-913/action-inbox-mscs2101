# Action Inbox

Action Inbox is a browser-first course project that turns actionable Gmail messages into evidence-backed suggestions. A user reviews every suggestion before the app creates a task or Google Calendar event. Reminder delivery is pending a product decision; stored in-app due metadata is not a delivered notification.

## Status

The repository is local-only. Do not add a remote or publish it without the project owner's approval. The browser/API implementation includes cookie-based Google login, durable Gmail synchronization, evidence-backed review, tasks, calendar approval, and retention controls. The application uses real provider adapters; local sanitized provider smoke is not live Google or paid-model acceptance. Google Web-client/test-account configuration, approved paid-model evaluation, and the reminder-delivery decision remain external gates. See `docs/architecture/api-contract.md` and `docs/architecture/deployment.md`.

## Structure

- `apps/web` — React and Vite browser client
- `services/api` — Fastify API and integration boundary
- `packages/contracts` — runtime-validated shared API contracts
- `database/migrations` — reviewable PostgreSQL migrations
- `docs` — engineering and course evidence as it is produced
- `EXECUTION_PLAN.md` — scope, architecture, milestones, and acceptance criteria

## Prerequisites

- Node.js 22.12 or newer
- npm 11 or newer
- PostgreSQL 16 or a compatible managed PostgreSQL database for database-backed milestones
- A current browser for local web testing

## Local setup

```bash
npm install
cp .env.example .env
npm run dev:api
```

In another terminal:

```bash
VITE_API_URL=http://127.0.0.1:3000 npm run dev:web -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173` (matching the API's `WEB_ORIGIN`). Vite reads `VITE_API_URL` from exported shell variables or `apps/web/.env`, not the root `.env`. Set it explicitly to the local API, `http://127.0.0.1:3000`; an absent value produces an actionable configuration error rather than guessing an endpoint. Browser requests include cookie credentials; CORS permits only the configured web origin.

For database-backed work, configure `DATABASE_URL` in root `.env`, then run `npm run db:migrate`. Migrations are transactional, checksum-tracked, and protected by a database advisory lock. `/v1/health` reports process liveness, not database or provider readiness.

`OPENAI_ENABLED=false` is the default even when a key exists in the environment. Enable paid extraction only after explicit account-owner approval. Google login requires an approved Web application OAuth client, an exact registered backend callback, a test-account allowlist, and a 32-byte AES key; see `.env.example` comments and ADR-003.

The browser supports login/logout/session rotation, inbox/source evidence, edit/approve/reject, manual task creation and status updates, retained last-success error states, explicit calendar creation/upcoming events, and disconnect/delete. Create intents live only in memory and private drafts/cache are cleared when authentication ends. Reminder controls store labelled in-app due metadata only, not delivered notifications.

## Quality checks

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
```

For actual PostgreSQL integration, set `TEST_DATABASE_URL` when running tests. Without it, database tests explicitly skip; do not count that run as database evidence.

The versioned 50-message anonymized evaluation set is `test-data/anonymized/v1/cases.json`. `npm run evaluate -- saved-predictions.json` evaluates saved outputs offline and records provenance; it does not call a model and passing deterministic fixtures does not establish real model accuracy.

For reproducible local-only browser workflow smoke, run `TEST_DATABASE_URL=<disposable-local-database> npm run smoke:local-providers`, then the configured web app. This explicit **test harness**, separate from production startup, runs sanitized OAuth/Gmail/OpenAI/Calendar HTTP servers and the real API/database path. It must not be used as a deployment or claimed as live provider evidence.

No real OAuth credentials, tokens, raw private emails, or non-anonymized test data belong in this repository or the shared Drive folder.
