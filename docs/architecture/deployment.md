# Local and deployment configuration

The API runs health-only without `DATABASE_URL`; this is not a simulated P0 backend. With PostgreSQL configured, startup applies checksum-tracked migrations before constructing sessions, domain routes, and the durable worker. Use PostgreSQL 16 or newer. A production database account needs permissions for application migrations and pg-boss schema creation; migrations can be run separately with `npm run db:migrate`.

## Configured local preview

The genuine application is configured at **http://127.0.0.1:5173/**, with the API at `http://127.0.0.1:3000`. Ordinary users only click **Connect Google account** and sign in through Arc; they do not need to configure Google Cloud. Local Web-client setup evidence is recorded separately in `docs/testing/google-setup-evidence.md`. The setup smoke observed anonymous session and authorization-URL creation. Subsequently, the user's screenshot reported successful real sign-in and Gmail import in progress; this was user-performed, not an agent-performed mailbox inspection or paid-model test.

The application uses a separate persistent Docker container `action-inbox-postgres` and named volume `action-inbox-postgres-data`. PostgreSQL listens only at `127.0.0.1:55432`, uses a generated password and SCRAM host authentication, and has all six application migrations applied, including the independent Canvas subscription table. Existing unrelated containers/databases were not replaced or modified. Do not delete the named volume unless intentionally deleting application data.

Private local settings are in ignored mode-0600 `.env`, `apps/web/.env`, `.env.google-web`, and `.local-preview/postgres.env`. The generated AES key is preserved in `.env`; replacing it makes previously encrypted provider tokens unreadable. Do not publish, paste, or commit these files. `OPENAI_ENABLED=false` remains set: this local preview does not enable paid model calls or paid cloud infrastructure.

User-session launchd agents `com.action-inbox.api` and `com.action-inbox.web` run the real API and a **verified production Vite preview** independently of the chat process and restart if their process exits. The user-facing web process serves the built application, not the development/HMR server: unfinished source edits are no longer exposed automatically. Their private plist/log files are under ignored `.local-preview/`. Docker must remain running. The agents survive the end of this chat; because their plists remain project-local, start them again after logging out/rebooting using the commands below.

From the repository directory, restart already-loaded services after verified changes. Do not restart the API while a queued/running import is active; inspect only safe status/count metadata first, never message content or credentials:

```bash
launchctl kickstart -k gui/$(id -u)/com.action-inbox.api
launchctl kickstart -k gui/$(id -u)/com.action-inbox.web
```

Stop without deleting data:

```bash
launchctl bootout gui/$(id -u)/com.action-inbox.web
launchctl bootout gui/$(id -u)/com.action-inbox.api
docker stop action-inbox-postgres
```

Start again after stopping or a new login:

```bash
docker start action-inbox-postgres
launchctl bootstrap gui/$(id -u) .local-preview/api.plist
launchctl bootstrap gui/$(id -u) .local-preview/web.plist
```

Do not run another `npm run dev:api` or `npm run dev:web` on the same ports while these agents are loaded. Preview data starts empty: no synthetic providers, fabricated signed-in state, or demonstration-data fallback are used in these services.

### Updating the stable user preview

Develop and rehearse on separate ports/database, not the live preview. After centralized checks and synthetic browser review, build the user configuration explicitly:

```bash
VITE_API_URL=http://127.0.0.1:3000 npm run build --workspace @action-inbox/web
launchctl kickstart -k gui/$(id -u)/com.action-inbox.web
```

The private web launch command is `vite preview --host 127.0.0.1 --port 5173 --strictPort`. A changed launchd plist requires `bootout` then `bootstrap` rather than only `kickstart`. Keep the same origin so existing user cookies/sessions continue to work. The isolated smoke build uses API 3002 instead; never deploy that configuration as the user preview.

The final cutover observed **zero active imports**, restarted only the application API agent, and loaded the verified web build on 5173. A new isolated anonymous browser confirmed the sign-in control, a hashed production asset, and no Vite HMR client. No real user session or mailbox was opened; no login, Gmail sync, or external Calendar write was initiated. Existing persistent storage, credentials, and the disabled paid-model flag were retained.

## Browser boundary

Set `WEB_ORIGIN` to one exact HTTP(S) origin without a trailing slash or path. Production requires HTTPS and same-site web/API hosting for SameSite=Lax cookies; same-origin deployment is simplest. Unrelated cross-site domains are not a supported cookie topology. Set the browser's `VITE_API_URL` before building Vite. Browser requests include HttpOnly cookies and a session-bound `X-CSRF-Token` for every mutation, including Google login initiation. Request IDs are generated server-side. Application logs intentionally omit request URL, headers, bodies, tokens, prompts, and raw provider errors; configure hosting/proxy logs to do the same.

## Google

Use a Google **Web application** OAuth client, a registered `/v1/auth/google/callback` backend URL, and an explicit comma-separated `GOOGLE_ALLOWED_EMAILS` list of approved test accounts. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `TOKEN_ENCRYPTION_KEY` must be supplied locally/deployment-side. The encryption key is canonical base64 of 32 cryptographically random bytes. Do not use Desktop OAuth credentials or embed credentials in the browser build. Backend validates identity token issuer, audience, nonce and verified email; authorization remains per authenticated user on every data operation.

Scopes and cookie decisions are in ADR-003. Production provider endpoints are pinned; local sanitized provider tests supply alternate URLs directly to the runtime configuration, not through public request parameters. No provider token is returned to the browser.

The existing Google Cloud project is **Action Inbox MSCS2101** (`action-inbox-mscs2101-2026`). Historical setup recorded **External / Testing** consent with one test account; personal account identifiers must not appear in shared documentation. This historical configuration does not authorize using the owner's personal account for development or QA. Use synthetic providers for development/CI; any real-provider acceptance account requires separate explicit approval and private configuration in both Google consent testing and `GOOGLE_ALLOWED_EMAILS`. Additional account addresses remain unconfirmed. Documentation redaction does not change the existing Cloud-console configuration, local allowlist, or user sessions.

For the current local preview, Gmail and Google Calendar APIs are enabled and the dedicated **Web application** client **Action Inbox Local Web** has been created. Its credentials were merged privately into the local API configuration; the existing Desktop client was not reused. The registered development callback is exactly `http://127.0.0.1:3000/v1/auth/google/callback`, with browser origin `http://127.0.0.1:5173`. Actual setup smoke returned HTTP 200 for session bootstrap and authorization-URL creation, with Google authorization host, PKCE S256, and the expected callback. The later user-provided screenshot, rather than additional agent access to private mail, establishes that real sign-in and Gmail import succeeded.

A future hosted deployment still needs its chosen HTTPS callback, such as `https://api.your-domain.example/v1/auth/google/callback`, registered on the Web client and configured as `GOOGLE_REDIRECT_URI`. Supply `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_EMAILS`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`, and `WEB_ORIGIN` through private deployment configuration, and set `VITE_API_URL` at browser build time. The example hostname is illustrative; no public hosting or paid infrastructure was provisioned.

## Canvas calendar feed

The user-approved Sofia integration is a read-only private calendar subscription, not institutional Canvas OAuth. It needs no developer key and does not use OpenAI, but the user must paste their real Calendar Feed link into the authenticated app's secure Connections input. Never ask for that full URL in chat or include it in logs/screenshots. A visible Calendar Feed control establishes availability, not that this application's first read succeeded.

The server accepts only `https://sofia.instructure.com/feeds/calendars/user_<opaque>.ics` with no credentials, custom port, query, fragment, or redirects. Public DNS answers are checked and the HTTPS connection is pinned to a validated address while retaining hostname certificate verification. There is no environment variable or public parameter to bypass this production destination policy. Existing `TOKEN_ENCRYPTION_KEY` encrypts the URL with user/connection-bound AES-GCM; preserve it alongside the database. Account deletion cascades the subscription/snapshot; Canvas disconnect removes local content without pretending to revoke the provider's feed URL. Google disconnect does not remove Canvas.

Initial connect and explicit manual Refresh are the only reads. The bounded importer accepts UTF-8 `text/calendar`, identity encoding, at most 2 MiB and 1,000 events, and a 15-second total network deadline. Unsupported or incomplete data fails safely without replacing the last successful snapshot. Event recurrence rules/exclusions/duration and floating/unknown timezones are not silently expanded or guessed; component-local ordinary embedded timezones and native date-only/UTC timestamps are supported. These deliberate parser limits are not claims about all possible iCalendar producers.

Canvas limits the source's date window and result set independently of this app. Imported snapshot removal means only that an item is no longer in the current feed, not that coursework was completed or cancelled. Date-only assignments do not supply an exact due time. Grades, submissions and completion state are not imported. No external task/calendar write or notification delivery is triggered. Source descriptions are inert plain text and returned links cannot expose a feed URL.

The HTTPS reader identifies itself as `ActionInbox/0.1 (Canvas calendar subscription)`. Sofia's public endpoint returned CloudFront 403 to an otherwise identical unidentified GET and a normal 302 login response to the identified client. Do not remove that header or impersonate a browser. After this correction was loaded, the user reported their real feed import working; no private course items were inspected. See `../testing/canvas-subscription-evidence.md` for the exact public diagnostic, focused regression and user-reported-success distinction.

## OpenAI cost boundary

`OPENAI_ENABLED` defaults to `false`. Merely inheriting an `OPENAI_API_KEY` does not activate paid calls. Set `OPENAI_ENABLED=true` and provide a key only after the account owner explicitly approves usage and cost. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Disabled/missing provider configuration produces a visible safe extraction failure, not fabricated suggestions. Local provider-contract tests use synthetic HTTP responses and do not prove real model accuracy. The versioned evaluation harness must disclose which provider/predictions were actually evaluated.

The user reported a running sync with 94 imported messages, 0 processed, and “AI extraction is not configured.” This is consistent with the explicitly disabled model flag: the extractor fails before any OpenAI network request, not because of an observed billing rejection. A ChatGPT subscription does not automatically configure or authorize separately billed API usage for this application. No ambient key is enabled automatically.

The earlier visibility defect is fixed: inbox data now refreshes when imported/processed progress changes, not only at terminal status; the bounded polling pause is labelled explicitly and can be resumed with a read-only check. A synthetic real-browser import displayed its first message while the run was still active, then all six readable messages with zero processed and a clear unconfigured-extraction explanation. The 94-import/zero-processed case and 60-update pause are covered by browser-component regressions, not an inspection of the user's real mailbox. The backend continues to include imported messages even when extraction failed. **Refresh inbox** and **Check sync progress** read persisted data; they do not start Gmail synchronization or paid-model calls.

Successful new Google consent now atomically queues one initial import of at most 100 messages from the latest 14 days; a queued/running run is reused. Queue failure rolls back connection/session changes rather than claiming import started. The internal Planner displays existing proposals, approved/manual tasks, and read-only Calendar times with source links and explicit loaded-page bounds. Due urgency is not inferred personal importance or an AI score. Displaying a proposal never creates an approved task or external Calendar event.

## Reminders and retained data

Reminder endpoints store in-app due metadata only. They do not schedule or deliver notifications and must never be presented as doing so. AC-09 remains pending a delivery decision. Google disconnect/account deletion performs real Google revocation when a live Google connection exists; only definitive, bounded `invalid_token` evidence counts as already revoked. Unknown provider failures remain visible and preserve data for retry. Gmail workers require the original running sync and connection identity before every persistence step. Canvas refresh similarly requires its original connection and operation generation, preventing stale pre-disconnect responses from restoring deleted content after reconnect.

Reminder options requiring an explicit user decision:

- Replace the native-delivery criterion with in-app due metadata only, accepting that a closed browser does not notify.
- Use separately approved Google Calendar events and the user's Calendar notification settings; this is Calendar delivery, not an Action Inbox notification guarantee.
- Approve a distinct Web Push service-worker/subscription/server-delivery scope for reliable closed-browser notifications where browser/platform support permits. This infrastructure is not currently implemented and must not be silently added.

## Verification separation

Routine tests require `TEST_DATABASE_URL` for actual database tests; without it those tests are explicitly skipped, not considered passing database evidence. Local HTTP-provider tests exercise real adapters against sanitized servers; they are not live Google authorization or paid OpenAI evidence. Only approved test accounts and an explicitly approved paid-model run can establish those external acceptance criteria.

### Isolated browser rehearsal

Never point `TEST_DATABASE_URL` or the synthetic browser harness at the persistent preview database on port 55432. Use a separate disposable PostgreSQL container on loopback 55433; keep test-suite data in `action_inbox_test` and browser-fixture data in `action_inbox_smoke`. The harness rejects the live preview port and requires the latter database name.

`npm run smoke:local-providers` uses API port **3002**, callback `http://127.0.0.1:3002/v1/auth/google/callback`, and web origin **http://127.0.0.1:5174**. Run the separate web build/preview with `VITE_API_URL=http://127.0.0.1:3002` and port 5174. This does not replace or restart the live launchd services on 3000/5173.

Now that the user preview serves `apps/web/dist`, future isolated builds must use a separate output directory so they cannot replace its assets:

```bash
VITE_API_URL=http://127.0.0.1:3002 npm run build --workspace @action-inbox/web -- --outDir ../../.local-preview/smoke-dist
npm run preview --workspace @action-inbox/web -- --outDir ../../.local-preview/smoke-dist --port 5174 --strictPort
```

The redesign rehearsal preceded the stable user preview. Subsequent Canvas rehearsals use this separate output directory rather than overwriting the live application.

The harness serves six delayed synthetic messages so incremental import is observable. Extraction is disabled by default, reproducing the local preview's no-paid-model behavior. `SMOKE_EXTRACTION=synthetic` explicitly enables only the harness's loopback synthetic HTTP response provider; it never enables real OpenAI access. Both modes use synthetic OAuth/Gmail/Calendar endpoints and a fresh browser profile. Do not attach this rehearsal to the user's private browser session or capture screenshots of their real mailbox.

The Canvas browser fixture is also a real local HTTP response, parsed by the same importer and persisted through the real authenticated routes. Only the explicit test harness injects that reader; production always uses pinned Sofia HTTPS. Synthetic mode controls under `/__smoke/` exist only in `testing/browser-smoke.ts`, never in `server.ts`. The fixture can change dates/remove items or return an outage to exercise manual refresh and last-success retention. Transport DNS/TLS policy is covered separately by focused adapter tests; a loopback fixture is not proof of live Sofia access.
