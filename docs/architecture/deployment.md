# Local and deployment configuration

The API runs health-only without `DATABASE_URL`; this is not a simulated P0 backend. With PostgreSQL configured, startup applies checksum-tracked migrations before constructing sessions, domain routes, and the durable worker. Use PostgreSQL 16 or newer. A production database account needs permissions for application migrations and pg-boss schema creation; migrations can be run separately with `npm run db:migrate`.

## Browser boundary

Set `WEB_ORIGIN` to one exact HTTP(S) origin without a trailing slash or path. Production requires HTTPS and same-site web/API hosting for SameSite=Lax cookies; same-origin deployment is simplest. Unrelated cross-site domains are not a supported cookie topology. Set the browser's `VITE_API_URL` before building Vite. Browser requests include HttpOnly cookies and a session-bound `X-CSRF-Token` for every mutation, including Google login initiation. Request IDs are generated server-side. Application logs intentionally omit request URL, headers, bodies, tokens, prompts, and raw provider errors; configure hosting/proxy logs to do the same.

## Google

Use a Google **Web application** OAuth client, a registered `/v1/auth/google/callback` backend URL, and an explicit comma-separated `GOOGLE_ALLOWED_EMAILS` list of approved test accounts. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `TOKEN_ENCRYPTION_KEY` must be supplied locally/deployment-side. The encryption key is canonical base64 of 32 cryptographically random bytes. Do not use Desktop OAuth credentials or embed credentials in the browser build. Backend validates identity token issuer, audience, nonce and verified email; authorization remains per authenticated user on every data operation.

Scopes and cookie decisions are in ADR-003. Production provider endpoints are pinned; local sanitized provider tests supply alternate URLs directly to the runtime configuration, not through public request parameters. No provider token is returned to the browser.

Reuse the existing Google Cloud project **Action Inbox MSCS2101** (`action-inbox-mscs2101-2026`). Per the account owner's supplied configuration, its OAuth consent is already **External / Testing**, with `kziruo@gmail.com` registered as a test user. The other three approved test-account email addresses are not yet known; do not treat them as configured. Add them to consent testing and `GOOGLE_ALLOWED_EMAILS` only after the account owner supplies and approves them.

Remaining setup in that existing project: enable the Gmail and Google Calendar APIs and create a **Web application** OAuth client. Do **not** reuse the existing Desktop client. Register the exact development callback `http://127.0.0.1:3000/v1/auth/google/callback`, or the selected deployment callback such as `https://api.your-domain.example/v1/auth/google/callback`. Set that exact value as `GOOGLE_REDIRECT_URI`; supply the new Web client's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, plus `GOOGLE_ALLOWED_EMAILS`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`, and `WEB_ORIGIN`, through private local/deployment configuration. Set `VITE_API_URL` at browser build time. The example hostname is illustrative, not a provisioned deployment. No console configuration or public hosting was created by this work.

## OpenAI cost boundary

`OPENAI_ENABLED` defaults to `false`. Merely inheriting an `OPENAI_API_KEY` does not activate paid calls. Set `OPENAI_ENABLED=true` and provide a key only after the account owner explicitly approves usage and cost. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Disabled/missing provider configuration produces a visible safe extraction failure, not fabricated suggestions. Local provider-contract tests use synthetic HTTP responses and do not prove real model accuracy. The versioned evaluation harness must disclose which provider/predictions were actually evaluated.

## Reminders and retained data

Reminder endpoints store in-app due metadata only. They do not schedule or deliver notifications and must never be presented as doing so. AC-09 remains pending a delivery decision. Disconnect/delete performs real Google revocation before deletion; only definitive, bounded `invalid_token` evidence counts as already revoked. Unknown provider failures remain visible and preserve data for retry. Workers require the original running sync and connection identity before every persistence step, preventing stale pre-disconnect responses from restoring deleted content after reconnect.

Reminder options requiring an explicit user decision:

- Replace the native-delivery criterion with in-app due metadata only, accepting that a closed browser does not notify.
- Use separately approved Google Calendar events and the user's Calendar notification settings; this is Calendar delivery, not an Action Inbox notification guarantee.
- Approve a distinct Web Push service-worker/subscription/server-delivery scope for reliable closed-browser notifications where browser/platform support permits. This infrastructure is not currently implemented and must not be silently added.

## Verification separation

Routine tests require `TEST_DATABASE_URL` for actual database tests; without it those tests are explicitly skipped, not considered passing database evidence. Local HTTP-provider tests exercise real adapters against sanitized servers; they are not live Google authorization or paid OpenAI evidence. Only approved test accounts and an explicitly approved paid-model run can establish those external acceptance criteria.
