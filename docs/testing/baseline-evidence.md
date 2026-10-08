# Baseline evidence — 2026-10-07 Pacific / 2026-10-08 UTC

## Implemented boundary

React/Vite browser health screen -> real Fastify `GET /v1/health`, unchanged shared health schema. App construction is separate from listening startup. Explicit credentialed CORS allows the configured web origin. PostgreSQL identity/OAuth tables and transactional migrations are implemented; the health endpoint deliberately does not claim database/provider readiness. Shared P0 endpoint schemas and browser security architecture are specified, not yet implemented P0 behavior.

## Actual centralized checks

- One centralized dependency installation after the parallel edits. Initial resolution failed because React DOM types selected minor 19.3 while React types were pinned to 19.2; aligned both type packages to 19.2 and installation completed.
- Initial audit detected vulnerable Drizzle, Vitest mocker, and tinypool dependencies. A necessary centralized corrective installation upgraded Drizzle to the patched 0.45 line and Vitest to 4.1.11. No worker ran a duplicate installation. Final `npm audit --audit-level=moderate`: **0 vulnerabilities**.
- Initial strict TypeScript found an unknown Fastify error-handler value; fixed using runtime narrowing. Removed redundant deprecated request-logging option; logging remains disabled.
- Final `npm run typecheck`: passed all three workspaces.
- Final `npm run lint`: passed.
- Final `TEST_DATABASE_URL=… npm test`: **42 passed** (26 browser transport/controller tests, 7 API/database tests, 9 shared-contract tests), no skipped database tests.
- `npm run format:check`: passed after centralized formatting.
- `VITE_API_URL=http://127.0.0.1:3000 npm run build --workspace @action-inbox/web`: passed. Vite reports two upstream Zod comment-annotation warnings; no application build error. npm also reported unapproved optional install scripts; the installed platform binaries successfully built and tested without approving extra scripts.
- Credential-pattern scan across 38 source/config/document files, excluding dependencies, local credentials, build output, and binary screenshots: no matches for private-key headers, Google API/client-secret patterns, or OpenAI-key patterns. This is a limited local scan, not a comprehensive security audit.

## Actual PostgreSQL evidence

An already available Docker `postgres:16-alpine` image ran an ephemeral PostgreSQL 16.14 container, bound only to `127.0.0.1:55432`, with no private data. The temporary test instance uses trust authentication and is not a deployment configuration.

Database tests applied the checked-in migration twice (second application safely skipped through checksum tracking). Observed constraints reject non-normalized/duplicate email, plaintext token fields, and invalid OAuth expiry. User deletion cascades connection deletion. Two concurrent conditional consumes of one OAuth state returned row counts `[0, 1]`. SQL constraints validate envelope shape, not cryptographic correctness; actual AES-GCM encryption and OAuth services remain P0 work.

## Actual browser/runtime smoke

The API ran on loopback port 3000; the built Vite application ran on loopback port 5173. Browser tooling opened only local application URLs. Real Chrome rendered the application and made a real cross-origin credentialed request to Fastify. Observed service `action-inbox-api`, status `ok`, version `0.1.0`, and a fresh server timestamp. No Google UI or Workspace writes occurred.

Observed browser states:

1. Build without `VITE_API_URL`: actionable **API address needed**, no fabricated fallback.
2. Configured build: **Connected to Action Inbox** from the real API.
3. Pending transport: **Checking the API connection…**.
4. Browser-only network fault injection: **Connection unavailable**, retry offered.
5. Browser-only HTTP 503 interception: **API request failed**, safe HTTP status explanation.
6. Browser-only malformed 200 response interception: **Unexpected API response**, contract failure shown.
7. Removed interception and clicked retry: restored real **Connected** state.
8. Final production build at 390px viewport: readable responsive layout; measured document scroll width and viewport both 390px (no horizontal overflow). Screenshot: `baseline-web.png`.

Failure injections were confined to the browser test harness, not production adapters or server routes. Initial relay screenshot and low-level interception attempts failed; switched to isolated Chrome and the supported route options. The recorded successful states above were observed after that correction.

## External prerequisites and explicit non-claims

Presence-only configuration inspection found an OpenAI API key in the tool environment, but no Google Web application client ID/secret/redirect URI or token-encryption key. No secret values were printed. Existing key presence does **not** authorize paid model requests; none were made. Desktop OAuth credentials were neither read nor reused. Real Google OAuth/Gmail/Calendar end-to-end smoke requires an approved Web application client and test account; no real-provider success is claimed.

P0 extraction, approval, task lifecycle, calendar idempotency, session/CSRF implementation, provider-contract smoke, accuracy evaluation, and full workflow remain subsequent implementation and verification work. Reminder delivery is explicitly undecided: in-app due metadata is not a delivered notification, and AC-09 is not complete. There is no public repository, remote publication, or Canvas submission in this slice.
