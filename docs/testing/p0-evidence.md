# Local product verification evidence

## Finalization checkpoint — 2026-11-23 UTC

The current candidate follows [SRS v2.0](../requirements/srs-v2.0.md), the submitted SQAP/STP v1.7, and the [CDR/design index](../architecture/cdr/README.md). Earlier dated runs below are historical evidence, not current test counts or blanket acceptance.

**Acceptance boundary:** synthetic local verification does not establish four-user live Google acceptance, a paid frozen-model accuracy result, approved HTTPS deployment, infrastructure log safety, independent non-developer usability, or the team's release decision. Those remain explicit external gates. AC-09 is aligned to SRS FR-17: reminders are create/edit/cancel **metadata only**; email, push, and background notification delivery are not promised.

### Executed centralized checks

Node **22.23.5**, PostgreSQL **16**, Vite **7.3.8**, and Chrome **157.0.8103.79** were used. The final isolated build is `index-CdPtRptf.js` / `index-BBLOoIre.css`, served on loopback 5174 against the synthetic API on 3002. The live preview/database on 5173/3000/55432 was not cut over.

| Check                         | Observed result                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Typecheck                     | All three workspaces passed.                                                                                                                                                         |
| ESLint                        | Passed. The standalone browser driver declares its Node/browser execution globals rather than disabling rules.                                                                       |
| Web tests                     | 102 passed.                                                                                                                                                                          |
| API/provider/PostgreSQL tests | 261 passed, with the disposable database enabled.                                                                                                                                    |
| Contract tests                | 18 passed.                                                                                                                                                                           |
| Total                         | **381 passed; zero skipped.**                                                                                                                                                        |
| Production build              | Passed. Existing upstream TanStack `use client` and Zod annotation warnings remain non-fatal; they were not suppressed.                                                              |
| Security gate                 | Seven pinned Semgrep rules across 48 application files, Gitleaks and all-severity npm audit passed. Known-positive and scanner-failure controls passed; no parser exception remains. |

### Actual synthetic workflow and persistence

The dedicated browser used only the synthetic account and loopback providers. Observed actions:

1. Bootstrap real session/OAuth state/callback handling; import 100 messages and preserve source/evidence.
2. Edit the first proposal to **Submit reviewed registration brief**, save, and explicitly approve. An actual database query then showed one task and **zero Calendar links**.
3. Save **Waiting for Reply**. Create future reminder metadata, observe its explicit no-delivery confirmation, and cancel it.
4. Set an event end time. The creation button remained disabled without the separate confirmation checkbox. Confirm once; the synthetic HTTP Calendar provider returned an event ID, displayed in the task.
5. Save **Completed**. Create **Prepare demo talking points** without a due date; it appears separately under Undated tasks.
6. Connect the synthetic Canvas feed and observe four complete entries. Inject a provider outage, refresh, and observe exactly **one** safe `CANVAS_UNAVAILABLE` alert while the four-entry snapshot and prior success timestamp remain. Restore the provider and refresh: Ready, four entries, no alert.
7. Save a seven-day window and reload: the saved value and exact inclusive range persisted. Restore 30 days.
8. Reopen the completed task in a new browser session: completion, cancelled reminder and event link remain. Enter an unsaved draft, open its source, and return: the draft and selection remain intact.
9. Run three consecutive Gmail syncs. Open source from the Gmail-filtered Planner and return: Gmail remains selected. Returning to Inbox restores keyboard focus to the original source row.
10. Keep a private source and unsaved draft open in one tab; explicitly log out in a second tab sharing the session. Reload the protected source in the first tab. It returns to anonymous onboarding, and DOM inspection finds no old source, draft input value, or signed-in identity—including hidden content. This directly exercises private-view teardown after retaining review context.

After rehearsal, actual sanitized database counts were **100 messages, 100 suggestions, one source-derived task, one manual task, one completed task, one Calendar link, and one cancelled reminder**. Repeated sync did not duplicate the source task or event link. These are local synthetic results, not live Google/Canvas acceptance.

### Whole-app visual and interaction verification

Every tab was exercised at **1440, 390 and 320 CSS pixels**. In all 18 combinations, document scroll width equalled viewport width: no page-level horizontal overflow. The production browser recorded no uncaught page exceptions. A keyboard Tab from New task reached All with a visible solid **3px** focus outline. Reduced-motion mode produced zero active animations. A browser-side aborted Health request showed an actionable error; removing the fault and retrying recovered the live API report.

The design uses native system typography, warm neutral surfaces, a deep-teal Planner header with the actual local date, source-specific accents, clearer calendar selection, and short state transitions. Inbox, Tasks, Calendar, Connections and Health have distinct compositions within the same visual language. Pending feedback is tied to actual requests/import state. Display settings use a native **Change** disclosure while their saved value stays visible; failure/retry notices remain visible. Completed tasks retain readable contrast, and approved proposals are not still labelled unconfirmed.

Retained, sanitized production screenshots:

| Surface         | Screenshot                                                                              |
| --------------- | --------------------------------------------------------------------------------------- |
| Planner         | [Desktop](finalization-planner-desktop.png) · [Mobile](finalization-planner-mobile.png) |
| Inbox           | [Desktop](finalization-inbox-desktop.png)                                               |
| Tasks           | [Desktop](finalization-tasks-desktop.png)                                               |
| Calendar        | [Desktop](finalization-calendar-desktop.png)                                            |
| Connections     | [Desktop](finalization-connections-desktop.png)                                         |
| Health          | [Desktop](finalization-health-desktop.png)                                              |
| Source evidence | [Mobile](finalization-source-mobile.png)                                                |

Additional narrow/error captures and the machine-readable rehearsal report remain in ignored `.local-preview/ui/`. Screenshot inspection also drove a mobile correction: an initially oversized settings form was replaced with the compact disclosure, rather than shrinking text or hiding primary work.

### T31 — measured final production interactions

The final run used this demo laptop (**Apple M1 Pro, MacBookPro18,3; Darwin/arm64**), installed Google Chrome **157.0.8103.79** in headless mode, a **1440×1000** viewport, **America/Los_Angeles**, and the production bundle named above. The account contained **100 synchronized synthetic messages**, an approved/completed source task, one manual undated task and four Canvas entries. The saved display window was 30 days. Normal motion was enabled; finite UI transition completion was included, not disabled to improve the result.

[`scripts/demo-performance.mjs`](../../scripts/demo-performance.mjs) resets in-memory query state on every reload. `t0` is the last required dashboard API JSON payload consumed by the UI. Without an intentional pause, the driver opens **Synthetic registration request 100**, verifies its detail heading, returns to Planner and selects **Gmail**. It waits for the loaded result, verifies the external Calendar fixture entries are absent, and records `t1` after finite transitions and two animation frames. All driver waits are inside the measured interval. Ten-second gaps **between** runs respect the unchanged 120-request/minute limit.

One warm-up was **675.2 ms** and is excluded from the ten measurements:

| Run | Browser HTTP cache | Interaction time (ms) |
| --- | ------------------ | --------------------: |
| 1   | Disabled           |                 400.1 |
| 2   | Disabled           |                 361.0 |
| 3   | Disabled           |                 397.3 |
| 4   | Disabled           |                 402.8 |
| 5   | Disabled           |                 362.3 |
| 6   | Enabled / warm     |                 355.7 |
| 7   | Enabled / warm     |                 354.2 |
| 8   | Enabled / warm     |                 367.4 |
| 9   | Enabled / warm     |                 396.2 |
| 10  | Enabled / warm     |                 353.6 |

**All ten passed the ≤2,000 ms target. Maximum: 402.8 ms; median: 364.9 ms.** Exact values and runtime provenance are retained in [the timing report](finalization-performance.json). The corresponding snapshot, progress/results and Playwright trace remain under ignored `.local-preview/performance/2026-11-23T04-35-43.555Z/`. This measures local post-payload UI interaction, not network/import latency, hosted performance, or a paid model.

Earlier exploratory attempts are not counted as accepted runs: an ambiguous source selector failed after the context-preservation change; then unpaced reloads exhausted the request limit and exposed the incorrect 500 response. The selector was scoped to the visible source heading, the API classification was corrected and exercised over HTTP, and pacing was moved strictly outside the measured interval. A preliminary reduced-motion run is superseded by this final normal-motion capture.

### Defects corrected during finalization

- Held Calendar success/failure responses could write after disconnect, replacement connection, or deletion. Original-connection fencing now protects both persistence paths; nine actual loopback-provider/PostgreSQL lifecycle cases pass.
- Invalid local date input could leave proposal controls permanently busy. Validation now completes before mutation state begins.
- Saving an unchanged task/proposal/reminder timestamp could discard seconds or milliseconds. Unchanged instants now retain their original precision.
- Initial Planner failures could leave permanent loading or incorrectly claim every page was loaded. Loading, failure, retained data, and completeness are now distinct.
- Opening source detail and returning could reset the Planner filter/week or task draft. The active private view remains mounted while source detail is shown; the authentication boundary still destroys private state.
- A 100-message dashboard put a long mail list before its calendar. Calendar now comes first; recent mail previews five rows, with explicit show-all/collapse and bounded, labelled scroll regions. All loaded records remain accessible.
- Canvas could display the same persisted refresh failure twice. Only matching error-code/request-ID duplicates are consolidated; distinct errors remain visible.
- Request throttling incorrectly became `500 INTERNAL_ERROR`. The regression failed with 500 before correction. Actual HTTP now returns `429 RATE_LIMITED` and `Retry-After` after 120 successful requests; the limit is unchanged.
- Final UI review found that disabling Health's pending button removed recovery from a stalled request. The component regression failed before the correction and passed afterward. **Restart check** now uses the controller's existing cancellation behavior. In actual Chrome, a held first Health request was cancelled with `net::ERR_ABORTED`; the second request reached the live local API and rendered its connected report.

Dependency and static-security evidence, scanner limitations, and exact expiring dispositions are documented in [the security review](../security/local-review.md).

### Requirement coverage index — all 50 numbered requirements

This index names implementation-level evidence, not a replacement for STP execution or independent acceptance. API paths below are relative to `services/api/src`; web paths are relative to `apps/web/src`. Shared design references are the [API contract](../architecture/api-contract.md), [OAuth ADR](../adr/003-browser-oauth.md), [processing ADR](../adr/004-p0-processing.md), and [human-approval ADR](../adr/course-0001-human-approval-boundary.md).

| Requirement(s) | Implementation/regression evidence                                                                           | Acceptance boundary                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| UI-01          | `workflows.test.tsx`, `PlannerPage.test.tsx`, `CanvasFeed.test.tsx`; actual synthetic browser flow           | Independent usability is separate.                                       |
| UI-02          | `display-window.test.tsx`; persisted, isolated preferences in `domain/domain.integration.test.ts`            | Browser-local calendar-day semantics, not elapsed 24-hour multiples.     |
| UI-03          | Planner, Canvas, preferences, and workflow loading/error/retained-data regressions                           | Last-success data must remain distinguishable from current failure.      |
| IF-01          | Production HTTPS/callback configuration and Secure-cookie regressions                                        | Deployed transport acceptance outstanding.                               |
| IF-02          | OAuth, Gmail, and Calendar local HTTP/provider integration                                                   | Four approved users and live-provider acceptance outstanding.            |
| IF-03          | Canvas URL/transport/parser/routes coverage; no-task/no-write assertions                                     | Institution transport acceptance is not inferred from fixtures.          |
| IF-04          | OpenAI strict schema, no tools, no store, malformed-output boundaries                                        | Real model accuracy outstanding.                                         |
| FR-01, FR-02   | `auth/auth.test.ts`: state, PKCE, nonce, identity, session/CSRF rotation, server-owned credentials           | Synthetic identity/provider only.                                        |
| FR-03, FR-04   | Domain/Canvas lifecycle and auth OAuth-state cleanup; manual reminder retention; unrelated-user preservation | No external Calendar deletion is promised.                               |
| FR-05          | Gmail bounded pagination, recent-window query, durable queue and empty import                                | Display-window changes do not backfill Gmail.                            |
| FR-06          | Three identical successful syncs and same-provider-ID cross-user persistence                                 | One stored identity per user, not a global provider-ID merge.            |
| FR-07          | Protected readable source and normalized-body/evidence UI                                                    | Source remains readable without extraction.                              |
| FR-08          | Pipeline failure/retry/last-success coverage                                                                 | Provider failures remain explicit.                                       |
| FR-09          | Structured extraction validation; empty/malformed/missing-field/wrong-type output cases                      | Invalid output produces no invented action.                              |
| FR-10          | Exact quote/UTF-16 offsets and unsupported-evidence rejection                                                | Evidence is checked against stored normalized source.                    |
| FR-11          | Relative/ambiguous/date-only/missing-zone rejection and uncertainty UI                                       | No invented deadline or timezone.                                        |
| FR-12          | Versioned edit, stale conflict, approve/reject terminal behavior and web review                              | Human review remains explicit.                                           |
| FR-13          | Extraction-disabled readable imports, empty-source regression, visible progress                              | No fake progress or fabricated result.                                   |
| FR-14          | Concurrent atomic approval; hostile-source owner-only approval                                               | Zero tasks before approval.                                              |
| FR-15          | Manual task creation and idempotency                                                                         | No email/AI dependency.                                                  |
| FR-16          | Status, completion/reopen, version and waiting-state coverage                                                | Unchanged due instants retain precision.                                 |
| FR-17          | Reminder metadata create/edit/cancel, retention and deletion                                                 | No notification delivery.                                                |
| FR-18, FR-19   | Shared range/provenance pagination, planner model, source filters, undated separation                        | Filtering does not mutate retention or ingestion.                        |
| FR-20          | Calendar parsing, snapshot retention and lifecycle fencing                                                   | External events remain distinct from tasks.                              |
| FR-21, FR-22   | Separate confirmation; deterministic event identity, concurrency, lost response, reconnect                   | Approval alone sends no Calendar write.                                  |
| FR-23          | Canvas URL validation, encrypted context, protected connect, secure input clearing                           | Feed URL is a credential.                                                |
| FR-24, FR-25   | Canvas native date/time parsing and full-snapshot replacement                                                | Date-only values gain no invented time; disappearance is not completion. |
| FR-26          | Failed Canvas refresh retains all prior items and success metadata                                           | Recovery replaces only with a complete valid snapshot.                   |
| FR-27          | Exactly 1,000 events succeed; 1,001 and truncated refreshes fail without loss                                | No silent truncation.                                                    |
| FR-28          | Independent Canvas disconnect, cross-source lifecycle and confirmation                                       | No mutation is sent to Canvas.                                           |
| NFR-01         | Production browser timing procedure in `scripts/demo-performance.mjs`                                        | Only retained complete ten-run evidence establishes the local target.    |
| NFR-02, NFR-03 | Versioned frozen-50 dataset and tested offline evaluator                                                     | No approved paid-model run; recall/precision unmeasured.                 |
| NFR-04         | Three identical syncs and independent per-user identities                                                    | No duplicate suggestions/tasks/events.                                   |
| NFR-05         | Gmail/AI/Calendar/Canvas failures, malformed extraction, retained complete snapshot                          | Real-provider outage rehearsal is separate.                              |
| NFR-06         | Developer-driven browser rehearsal only                                                                      | Non-developer uncoached acceptance outstanding.                          |
| NFR-07         | This index, SRS matrix, CDR/ADR references and STP mapping below                                             | Final course-report/non-author/team acceptance outstanding.              |
| SEC-01, SEC-05 | Auth/pipeline/domain/Canvas ownership; foreign hostile-proposal denial                                       | No cross-user content disclosure or approval.                            |
| SEC-02         | GCM explicit 16-byte tag, tamper/context rejection, compatible envelopes                                     | Deployment key operations remain external.                               |
| SEC-03         | Safe provider/API errors and logging-disabled runtime; security gate                                         | Infrastructure/access-log acceptance outstanding.                        |
| SEC-04         | Exact Origin, session-bound CSRF and CORS across mutation routes                                             | Deployed same-site configuration still required.                         |
| SEC-06, SEC-07 | No-tools contract; inert hostile source; no task/event before owner confirmation                             | Model output never grants permissions.                                   |
| SEC-08         | Lifecycle purge/retention, session/OAuth-state invalidation, held-work fences                                | Deleted/replaced lifecycle cannot be restored by late work.              |

### Submitted test-plan coverage

T01–T03 are covered by the OAuth/session/ownership suite; T04–T06 by retention/deletion/Gmail boundaries; T07–T14 by source, extraction, evidence, review, concurrent approval and repeated-sync suites; T15–T22 by tasks/reminders/preferences/planner/Calendar suites; T23–T28 by retained-state and Canvas/crypto suites; T35–T36 by hostile-input and asynchronous lifecycle suites; T38 by save-failure/session-transition regressions. These are automated implementation evidence, not claims that every formal system/acceptance procedure was independently executed.

Specific previously missing STP boundaries now have regressions: **T04** retained manual reminders and cleared pending OAuth state; **T08** empty source and malformed/missing/wrong-type model output; **T14** three identical syncs plus separate owners sharing a provider ID; **T26** successful 1,000-event import followed by 1,001/truncated retention; **T35** hostile HTML/SQL/prompt text remains inert review data and cannot bypass ownership/approval.

**T29** remains partial until hosting logs are reviewed. **T30** has the reproducible local/CI scanner gate and fail-closed positive controls. **T31** uses the retained production timing protocol; **T37** uses the actual synthetic browser/API/database workflow. **T32, T33, T34, T39, T40** retain their external model, participant, deployment, four-user and final release-review prerequisites. No developer rehearsal substitutes for a non-developer participant or team approval.

### Visual and interaction guidance

The existing product structure and documented source/approval semantics remain authoritative. [Apple-design guidance](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md), [Apple feedback guidance](https://developer.apple.com/design/human-interface-guidelines/feedback), and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) inform context continuity, nearby feedback, reversible controls, and manageable information density. [Taste Skill](https://github.com/Leonxlnx/taste-skill) and [Hallmark](https://github.com/Nutlope/hallmark) inform deliberate typography, visual hierarchy, material contrast, and product-specific composition—not a new landing page, decorative dashboard data, or a replacement design system.

## Historical P0 checkpoint — 2026-10-07 Pacific / 2026-10-08 UTC

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
