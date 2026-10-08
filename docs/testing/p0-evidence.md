# Local web P0 evidence — 2026-10-07 Pacific / 2026-10-08 UTC

## Earlier candidate: scope and central results

This is a local implementation candidate, **not a completed release**. Production adapters call Google and OpenAI; the earlier verification below used an actual PostgreSQL database, actual listening HTTP servers, and explicitly sanitized local provider fixtures. No real Google authorization, Google console/Workspace write, paid model request, Canvas write, or remote publication occurred in that earlier verification. Later owner-authorized Google setup and the user's own real sign-in/import are documented separately in `google-setup-evidence.md` and the deployment guide; they are not synthetic browser-test evidence.

Earlier centralized commands after the security corrections (these counts do not by themselves verify the subsequent UI redesign):

- `npm run typecheck`: passed all workspaces.
- `npm run lint`: passed.
- `TEST_DATABASE_URL=… npm test`: **157 passed** — 51 web, 97 API/provider/database/evaluation, 9 contracts; PostgreSQL suites were enabled, not skipped.
- `npm audit --audit-level=moderate`: **0 vulnerabilities**.
- `npm run format:check`: passed.
- Limited credential-pattern scan across **82 owned source/document/fixture files**: no private-key, Google-key/client-secret, or OpenAI-key pattern matches. Dependencies, build output, local environment files, unrelated user files, and binary screenshots were excluded; this is not a comprehensive secret-audit claim.
- `VITE_API_URL=http://127.0.0.1:3000 npm run build --workspace @action-inbox/web`: passed; upstream TanStack `use client` and Zod comment-annotation warnings remain non-fatal and are not application build failures.

Dependencies were installed only by the central integration owner after parallel edits. Integration initially found and corrected: exact-optional MIME typing, the evaluation module's ESM boundary, testing-library selector options, type-only imports, intentional ASCII-control normalization lint, UUID/text test binds, and a PostgreSQL regex bound that failed on Calendar insertion. The latter was corrected in new migration `0005_calendar_event_id.sql`, preserving applied migration checksums.

The actual Chrome run then found an `Illegal invocation` from calling native fetch with an ApiClient receiver. The default transport is now bound to the global receiver; a receiver-aware regression was added. Separate initial security review found three lifecycle defects; all were corrected and included in the final 157-test run. Details: `docs/security/local-review.md`.

## Actual isolated-browser workflow

The production Vite build ran at `http://127.0.0.1:5173`; the actual Fastify API ran at loopback port 3000 with PostgreSQL 16.14 on loopback 55432. Test-only OAuth/Gmail/OpenAI/Calendar HTTP servers supplied synthetic data. The final workflow used a dedicated Chrome profile after an earlier shared-browser tab behaved unpredictably.

Observed steps, using browser forms/buttons and actual API/database requests:

1. Anonymous session bootstrap succeeded. A real local authorization-code/PKCE/JWT/nonce flow rotated the browser session and displayed the synthetic approved identity.
2. Sync imported one synthetic email and processed one structured extraction through the local HTTP Responses adapter; pg-boss reported `Succeeded`.
3. The source view showed the persisted normalized body, separate matching action/deadline quotes, offsets-backed verification, confidence disclaimer, and exact proposed due timestamp.
4. A suggestion edit advanced version 0 to 1. Explicit approval created a task; approval alone created no Calendar event.
5. Edited the task title and moved it to `Waiting for Reply`. Created a separate manual task and moved it to `Completed`.
6. Saved and cancelled in-app due metadata. The UI explicitly said no notification/email/push/background delivery was configured; no delivery claim was made.
7. The Calendar-create control remained disabled without explicit confirmation. After checking confirmation, the local provider created an event and the task displayed its Google event ID. Upcoming events displayed its title/start/end.
8. A browser-only HTTP 503 fault injection produced a safe `GOOGLE_UNAVAILABLE` message while preserving the successful event and fetch timestamp. Removing the interception and refreshing recovered successfully. Server-side provider failure/cache behavior was separately exercised by real local HTTP integration tests.
9. Repeated sync twice more: zero additional imports/processing, one stored email/suggestion, no reopened review or duplicate task.
10. Confirmed disconnect: provider revocation and purge completed, the browser cleared private state, and reconnect showed an empty inbox with no previous sync timestamp. The manually created task survived; the extracted task/content did not.
11. After reconnect, re-confirming identical event content for the retained manual task returned the **same** deterministic event ID despite a replacement client UUID. The original local provider event was reconciled rather than duplicated.
12. A fresh sync produced a proposal, which was explicitly rejected. The source view displayed `Rejected`, version 1, with original evidence intact. Screenshot: `p0-evidence-review.png` (visually inspected).
13. Confirmed permanent account-data deletion: browser returned to anonymous state. An actual SQL count for the synthetic demo account returned **0** remaining users.

### Local OAuth test limitation

The production browser correctly rejects authorization URLs outside Google's allowlist, including the sanitized provider's loopback URL. The test harness did not weaken that check. For the synthetic OAuth smoke only, browser-side test orchestration called the real session/start endpoints with cookie/CSRF, then navigated directly to the returned **local test provider** URL. Callback, PKCE, state, identity verification, session issuance, and subsequent UI were real application code. This is not a claim that the user-facing Connect button completed live Google authorization. No Google site was accessed; an attempted intercepted navigation was blocked by the browser allowlist.

## Evaluation and limits

The checked-in `anonymized-v1` dataset contains exactly **50** synthetic labelled messages. `npm run evaluate -- saved-predictions.json` computes action-required recall, explicit-deadline precision, evidence validity, and misses from versioned saved outputs while recording provenance. Arithmetic/boundary tests passed; **no real model accuracy run was performed** and AC-10 is not passed. The conservative deadline policy requires a full source-backed ISO timestamp with explicit offset; relative/date-only/ambiguous deadlines require review.

## Requirement traceability

| Acceptance                 | Implementation/test evidence                                                                          | Remaining acceptance                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| AC-01 connection           | auth integration: state/PKCE/nonce/identity/session/refresh; local browser OAuth                      | All four real approved Google users and deployed callback                       |
| AC-02 bounded sync         | Gmail provider, worker, route/persistence tests; actual browser sync                                  | Live Gmail mailbox                                                              |
| AC-03 duplicate prevention | PostgreSQL unique/transaction/retry tests; three browser syncs                                        | Rehearsal with real provider data                                               |
| AC-04 human approval       | domain approval tests; browser edit/approve and disabled event confirmation                           | Team usability review                                                           |
| AC-05 evidence             | extractor quote/offset tests; actual source screenshot                                                | Live model output evaluation                                                    |
| AC-06 deadline safety      | conservative exact-date/uncertain/invalid evidence tests                                              | Precision assessment on saved model outputs                                     |
| AC-07 task lifecycle       | domain/web workflow tests; manual/edit/wait/complete/reject browser actions                           | Designated deployment/browser rehearsal                                         |
| AC-08 event once           | deterministic intent/concurrency/lost response/reconnect tests; same browser event ID                 | Live Calendar retry proof                                                       |
| AC-09 reminders            | Metadata-only create/edit/cancel tested and labelled                                                  | **Delivery decision pending; not complete**                                     |
| AC-10 accuracy             | Versioned 50 cases and tested offline evaluator                                                       | Approved paid-model run; thresholds unmeasured                                  |
| AC-11 security             | initial review + remediation regressions; encrypted tokens, redacted errors, cross-user/session tests | Deployment/infrastructure log review and independent post-fix assessment        |
| AC-12 resilience           | provider/cache/retry tests; visible browser outage with retained data                                 | Real-provider failure rehearsal                                                 |
| AC-13 performance          | Responsive baseline browser observation only                                                          | Designated browser/device with 100 populated messages, measured 2-second target |
| AC-14 traceability         | This table links P0 acceptance to tests and evidence                                                  | Final course report sections and non-author review                              |

All-user Google acceptance, an approved paid-model account/run, HTTPS same-site hosting, reminder delivery, full performance measurement, and final team/course review remain explicit release gates. The local Web client is configured; that does not complete those wider gates.

## Redesign inspection and safety boundary

The user's reported real preview contained 94 imported messages, zero processed, disabled AI extraction, and an apparently empty inbox. That report is accepted as ground truth; no agent inspected the user's stored message content or re-ran their Gmail sync to reproduce it.

The redesign rehearsal used a separate disposable PostgreSQL container on loopback 55433, test database `action_inbox_test`, browser database `action_inbox_smoke`, synthetic API 3002, and a built production web preview on 5174. Persistent user data on PostgreSQL volume/port 55432 was not used for tests. The browser used a new dedicated profile and only a synthetic `demo@example.test` identity. The default rehearsal explicitly disabled extraction; no real Google, Calendar, or paid-model request was needed.

An immediate intermediate browser inspection identified a concrete visual defect while files were being edited: new navigation/dashboard markup was being served alongside the previous stylesheet. The resulting unbounded, black-filled SVG logo, missing sidebar layout, and concatenated card content appeared at desktop and 390px widths. Temporary diagnostic screenshots were `/tmp/action-inbox-current-desktop.png` and `/tmp/action-inbox-current-390.png`; these are defect evidence, not final UI acceptance screenshots.

The separate one-case ordinary ChatGPT website experiment is recorded in `subscription-experiment.md`. Its correct source quotes and deadline are not application-schema or API-integration evidence; its returned category does not match the application enum. API extraction remains disabled.

### Final centralized redesign results

- `npm run typecheck`: passed all workspaces.
- `npm run lint`: passed. Private `.local-preview` browser-profile artifacts are now excluded from ESLint and Prettier; they are not application source.
- Focused web regressions: **21 passed**; focused OAuth/pipeline PostgreSQL regressions: **17 passed**. The initially failing paused-poll test had garbage-collected its unobserved seeded cache; its fixture lifecycle was corrected rather than weakening the runtime pause condition.
- Final `TEST_DATABASE_URL=… npm test`: **169 passed** — 62 web, 98 API/provider/database/evaluation, 9 contracts. All PostgreSQL suites used the separate disposable database; none were skipped.
- `npm run format:check`: passed. Both isolated (`VITE_API_URL=http://127.0.0.1:3002`) and user (`http://127.0.0.1:3000`) production builds passed. The same upstream TanStack/Zod non-fatal bundler warnings remain.
- Explicit `git check-ignore` confirmed root/web environment files, Google credentials, and private preview configuration are ignored. Only explicitly named source/docs/synthetic screenshots were staged; unrelated `.Rhistory` and private browser/session files were excluded. The earlier credential-pattern scan is not presented as a new comprehensive audit.

### Actual production-build browser observations

1. A fresh synthetic OAuth callback automatically queued the initial import without pressing Sync. The first readable source appeared at **1 imported / 0 processed while still running**; completion left **6 imported / 0 processed**, with clear disabled-extraction text. Reading original text and Connections preserved the distinction between a successful Google connection and unavailable interpretation.
2. SQL counts in the disposable fixture database after this import were six messages, **zero suggestions, zero tasks, zero created-event links, and one sync run**. No action/date was fabricated and no external write followed consent.
3. A separate explicitly selected loopback synthetic Responses provider produced six structured proposals on reconnect, with no additional imported copies. This is synthetic contract evidence, not paid/live AI or subscription integration.
4. Source detail showed exact matching action and deadline quotations, an unconfirmed due time, and editable review controls. A user-style form edit and explicit approval produced one task; a database count still showed **zero Calendar links**. The task was moved to Waiting for Reply.
5. The Calendar-create button was disabled before its confirmation checkbox. After explicit confirmation, the actual local provider created one event with a different scheduled day from the task's due date. Planner folded that event into its task identity while showing both date meanings. No real Google Calendar was written.
6. Actual forms created a dated manual task and an undated manual task. Planner showed Today, Waiting for reply, Needs review, and Needs a date without inventing importance from confidence or receipt time. Week navigation/day selection and source/task detail actions were exercised.
7. A synthetic `+09:00` event rendered on the correct prior local day in America/Los_Angeles; a date-only event retained its calendar date/all-day label. Browser inspection found and corrected an all-day sorting bug: the sort now uses a local-day presentation key, not UTC midnight, without converting the date-only event into a deadline. A timezone regression was added before the final 169-test run.
8. Browser-only HTTP 503 interception of the synthetic Calendar read produced a readable safe error while retaining prior tasks/events. Removing interception and using Refresh plan recovered. This fault injection is not a live-provider outage claim.
9. Adding 101 explicitly synthetic pagination tasks to the disposable database exercised the real API cursor: the UI disclosed **100 loaded tasks / partial plan**, and Load more tasks reached **104 loaded tasks**. This is pagination coverage, not a 100-message performance benchmark.
10. Desktop (1440px) and mobile (390px) captures were visually inspected. The mobile document width equalled 390px with no horizontal overflow. The earlier HMR stylesheet mismatch and case-insensitive component/helper module collision were corrected; the user preview now serves a built application rather than exposing in-flight HMR edits.

Final synthetic screenshot files:

- `redesign-planner-desktop.png`, `redesign-planner-390.png`
- `redesign-inbox-desktop.png`, `redesign-inbox-390.png`
- `redesign-import-progress.png`
- `redesign-source-desktop.png`, `redesign-source-390.png`
- `redesign-connections-390.png`
- `redesign-planner-error-390.png`

The 60-update polling pause is component-test evidence; the browser run did not wait through 60 real polling intervals. Browser automation's datetime fill produced malformed input once; the rehearsal then set valid native form values and dispatched input/change events before clicking the real confirmation control. No app validation was bypassed.

### Preserved live preview and release limits

After verification, safe live status metadata showed zero active imports and `OPENAI_ENABLED=false`. The API launchd service was restarted to load the verified callback code; the web launchd service was changed to stable `vite preview` on the same 5173 origin. A fresh anonymous profile confirmed an unauthenticated session and valid production rendering with no HMR script. No user-authenticated page, private message content, provider token, or real sync/Calendar operation was accessed. The persistent Docker volume and user sessions/data remain in place; only the owned disposable test container/services/browser profiles were stopped/removed.

At the redesign milestone, Outlook/Canvas, additional calendar views, flight specialization, notification delivery, and optional SMS were **approved Phase 2 plans**. The subsequent, separately approved Canvas calendar-only increment is recorded below; full Outlook/Canvas OAuth and notification channels remain planned. `../requirements/phase-2.md` supplies future acceptance gates. The one-case subscription experiment does not enable the app API. Paid extraction, AC-09 delivery, all-user provider acceptance, and the performance/accuracy release gates remain unresolved.

## Canvas calendar-only increment

The separately approved Canvas subscription's implementation, centralized **304-test** gate, synthetic HTTP/browser evidence, and real-access limitations are recorded in [Canvas subscription evidence](canvas-subscription-evidence.md). This does not convert the original four-user Google, paid-model accuracy, or reminder-delivery blockers into completed acceptance criteria.

## Shared display window and source separation

Implemented on `feature/display-window-and-sources`, based on main `5dd9c75983c05b54f7e349e1fe05b53310d3134f`, on 2026-10-08. This is synthetic local evidence, not a new real-account acceptance run or deployment. All services used disposable ports 3002 / 5174 / 55433, PostgreSQL 16, and a dedicated Chrome profile. The live preview, private content, encryption keys and disabled paid-model setting were untouched.

The fixture import supplied six readable messages with extraction disabled. A throwaway seed changed only disposable receipt dates and added synthetic manual tasks, one previously approved Gmail task and one proposal from an older email. These seeded records do not claim successful model extraction. Matching lists were exercised through the actual authenticated API with page size 2:

| Display days | Matching received mail | Dated manual tasks | Separately undated manual tasks | Original Canvas fixture items |
| ------------ | ---------------------- | ------------------ | ------------------------------- | ----------------------------- |
| 7            | 3                      | 2                  | 1                               | 0                             |
| 30           | 5                      | 4                  | 1                               | 4                             |
| 10           | 4                      | 3                  | 1                               | 3                             |
| 1            | 1                      | 1                  | 1                               | 0                             |

Receipt ages were 0, 1, 6, 7, 29 and 30 local calendar days. Manual due offsets were −1, 0, 6, 7, 29, 30 and null. The old email's upcoming proposal was returned independently by the `suggestionDue` query; source provenance did not depend on loading that email in the recent-mail list. Filtering did not delete any rows or initiate extra provider imports.

Observed browser behavior, including the isolated production build:

- Saved 7-day and custom 10-day settings survived reload; the account preference survived logout/new synthetic login while Planner source selection returned to All.
- Gmail showed readable messages with extraction disabled; Canvas, Google Calendar and manual-task views excluded other sources' entries. Inbox and Tasks used the same saved day count.
- Custom 10 days included the native date-only Canvas reading day but excluded the following day's assignment; 30 days included both. A one-day Calendar view included the cross-timezone event occurring locally today and excluded tomorrow's all-day event.
- Invalid custom zero remained unapplied. A browser-injected HTTP 503 for preference saving displayed the error and preserved the prior 30-day window; retry saved 7 successfully. This is fault injection, not an observed provider outage.
- Moving an owned task's deadline beyond the window left its selected detail and actions accessible but removed it from dated-list counts. Smoke inspection first exposed a missing detail route (404); the implemented owner-scoped `GET /v1/tasks/:id` returned 200 afterward. The database regression also verifies foreign-user 404 and anonymous 401.
- A separately seeded native-date Canvas event spanning yesterday/today appeared in today's grid and agenda, with no entry on its exclusive end day tomorrow. Its source start date was not rewritten.
- Desktop and 390px mobile layouts were visually inspected. At 390px the document width was exactly 390px; source controls wrapped without horizontal overflow.
- Confirmed logout removed private content and the preference control. Browser automation had inconsistent click/date-fill behavior; native input events and programmatic DOM activation were used where needed, without bypassing application validation or replacing API responses except the explicit save-failure injection above.

Centralized regression coverage includes preference ownership/CSRF, source/date filtering before pagination, filter-bound cursors, DST/local-day boundaries and rollover, native event overlap, calendar last-success filtering, and task-detail retention. Local results were 92 web, 233 API/provider/database, and 18 contract tests (343 total), with no database skips. Typechecking, linting and the isolated production build passed; upstream TanStack/Zod bundler warnings remained non-fatal. The PR's required CI check records the final integrated revision.

Migration `0007_display_preferences.sql` was applied only to disposable databases. No real Google/Canvas operation, paid extraction, external Calendar write, notification send, or stable-preview cutover was performed. Gmail's existing 14-day/100-message ingestion cap, Canvas feed coverage and Calendar's 100-event bound remain distinct from the display setting.
