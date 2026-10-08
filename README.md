# Action Inbox

Action Inbox is a browser-first course project that turns actionable Gmail messages into evidence-backed suggestions. A user reviews every suggestion before the app creates a task or Google Calendar event. Reminder delivery is pending a product decision; stored in-app due metadata is not a delivered notification.

## Status

The repository is local-only. Do not add a remote or publish it without the project owner's approval. The first implementation milestone is a browser-to-API health slice. P0 contracts are specified in `docs/architecture/api-contract.md`; a specified endpoint is not a claim of implementation.

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

## Quality checks

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
```

No real OAuth credentials, tokens, raw private emails, or non-anonymized test data belong in this repository or the shared Drive folder.
