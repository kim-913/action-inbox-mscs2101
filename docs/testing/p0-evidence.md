# Local web P0 evidence — 2026-10-07 Pacific / 2026-10-08 UTC

## Scope and final central results

This is a local implementation candidate, **not a completed release**. Production adapters call Google and OpenAI; verification used an actual PostgreSQL database, actual listening HTTP servers, and explicitly sanitized local provider fixtures. No real Google authorization, Google console/Workspace write, paid model request, Canvas write, or remote publication occurred.

Final centralized commands after all security corrections:

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

Live Google Web-client configuration, an approved paid-model account/run, HTTPS same-site hosting, reminder delivery, full performance measurement, and final team/course review remain explicit release gates.
