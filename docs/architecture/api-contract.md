# Browser P0 API contract

The Zod schemas in `packages/contracts/src/p0.ts` are authoritative and are consumed by the browser and implemented server routes. Provider operations use real adapters; no UI should claim availability until its endpoint succeeds. Local sanitized-provider evidence does not establish live Google or paid-model acceptance.

## Browser transport

Use `credentials: "include"` for every request. Call `GET /v1/auth/session` before login or other mutations. It returns `sessionResponseSchema`, including anonymous state and a CSRF token, and establishes an HttpOnly cookie. Send `X-CSRF-Token` on every POST/PATCH/DELETE, including Google start; the browser supplies the exact configured Origin. Session rotation updates the CSRF token. Never store bearer tokens in localStorage or read cookies in JavaScript. Errors use `apiErrorSchema`; show its safe message and request ID. Preserve previously successful data on refresh errors. Callback navigation uses a server-owned fixed web origin, never a client redirect URI.

OAuth callback outcome is `?auth=connected`, `?auth=denied`, or `?auth=failed`, never a provider message or credential.

## Endpoints

| Method and route                         | Request                                                     | Successful response                                                                              |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET `/v1/health`                         | none                                                        | 200 `healthResponseSchema` (unchanged)                                                           |
| GET `/v1/auth/session`                   | none                                                        | 200 `sessionResponseSchema`                                                                      |
| POST `/v1/auth/google/start`             | `emptyRequestSchema`                                        | 200 `googleStartResponseSchema`; navigate browser to authorizationUrl                            |
| GET `/v1/auth/google/callback`           | Google code/state or denial; browser-bound state validation | 303 fixed web origin with safe outcome, HttpOnly session on success                              |
| POST `/v1/auth/refresh`                  | `emptyRequestSchema`                                        | 200 `sessionResponseSchema`; rotates current opaque session, no separate refresh credential      |
| POST `/v1/auth/logout`                   | `emptyRequestSchema`                                        | 200 `successResponseSchema`                                                                      |
| POST `/v1/connections/google/disconnect` | `emptyRequestSchema`                                        | 200 `successResponseSchema`; revoke and delete retained message-derived data                     |
| DELETE `/v1/account/data`                | none                                                        | 200 `successResponseSchema`; revoke, cascade deletion and expire session                         |
| POST `/v1/sync/gmail`                    | `emptyRequestSchema`                                        | 202 `syncRunSchema`; at most 100 messages in last 14 days                                        |
| GET `/v1/sync-runs/:id`                  | none                                                        | 200 `syncRunSchema`                                                                              |
| GET `/v1/inbox`                          | `inboxQuerySchema`                                          | 200 `inboxResponseSchema`; last-success metadata independent of latest failed run                |
| GET `/v1/emails/:id`                     | none                                                        | 200 `emailResponseSchema`; normalized evidence source                                            |
| PATCH `/v1/suggestions/:id`              | `suggestionEditRequestSchema`                               | 200 `suggestionSchema`                                                                           |
| POST `/v1/suggestions/:id/approve`       | `suggestionApproveRequestSchema`                            | 200 `taskSchema`; atomic optional edit and approval; repeat returns same task                    |
| POST `/v1/suggestions/:id/reject`        | `versionRequestSchema`                                      | 200 `suggestionSchema`                                                                           |
| GET `/v1/tasks`                          | `tasksQuerySchema`                                          | 200 `tasksResponseSchema`                                                                        |
| POST `/v1/tasks`                         | `taskCreateRequestSchema`                                   | 201 `taskSchema`; user explicitly creates manual task                                            |
| PATCH `/v1/tasks/:id`                    | `taskEditRequestSchema`                                     | 200 `taskSchema`                                                                                 |
| POST `/v1/tasks/:id/reminders`           | `reminderCreateRequestSchema`                               | 201 `reminderSchema`                                                                             |
| PATCH `/v1/reminders/:id`                | `reminderEditRequestSchema`                                 | 200 `reminderSchema`                                                                             |
| DELETE `/v1/reminders/:id`               | none                                                        | 200 `successResponseSchema`                                                                      |
| GET `/v1/calendar/upcoming`              | none                                                        | 200 `upcomingCalendarResponseSchema`; cached successful data plus safe error on provider failure |
| POST `/v1/tasks/:id/calendar-event`      | `calendarEventCreateRequestSchema`                          | 200 `calendarLinkSchema`; only explicitly approved tasks, deterministic event ID across retries  |

`requestId` in create bodies is a client-generated UUID idempotency key, distinct from server error correlation IDs. Reuse the same requestId when retrying the same intent. Version fields enforce optimistic concurrency; stale writes return 409 `CONFLICT`. Ownership is always derived from server session, never supplied in bodies. Unsupported/uncertain due dates stay nullable and visibly flagged; edited dates are a user decision rather than invented source evidence. Read/review/reference emails can legitimately have no suggestions.

Calendar creation additionally uses a durable task-owned intent. After reload, an identical event-content retry can use a replacement client UUID and still reconciles the original Google event ID; changed content returns conflict. This prevents a lost in-memory request key from forcing a second external event.

`POST /v1/sync/gmail` retries failed extractions for already persisted emails without overwriting approved/rejected decisions. Failed extraction sets the email's `extractionError` and prevents the containing run from reporting `Succeeded`; last successful data remains readable. Action and explicit-deadline support use separate `evidence` and `deadlineEvidence` fields.

Reminder storage is not delivery: `delivery: "Not configured"` is mandatory. These endpoints manage only explicitly labelled in-app due metadata. The UI must not offer a control claiming a notification was scheduled, or report reminder success without a delivery mechanism. AC-09 remains incomplete and pending the user's delivery decision. No notification permission, email, push, or background delivery is implied.

## Internal planner composition and initial import

Successful Google consent/callback atomically persists the connection, rotates the session, and queues the initial bounded Gmail import. It reuses an existing queued/running run rather than creating another. The returned browser redirect remains `?auth=connected`; initial progress is available from `inboxResponseSchema.dataState.latestSyncRun` and the existing sync-run endpoint. A queue failure returns the existing `auth=failed` outcome and rolls back the transaction. No provider endpoint or browser schema is added for this behavior.

The internal planner composes existing inbox suggestions, approved/manual tasks, and upcoming Calendar items. Inbox/task pages use stable cursors, default 50 and maximum 100 items; a non-null `nextCursor` means incomplete loaded coverage and must be surfaced with additional-page controls, not treated as a complete calendar. Task `sourceEmailId` and suggestion `emailId` resolve through the authorized email-detail endpoint for normalized source/evidence. Proposed suggestions do not create tasks or external events merely by appearing in an internal date cell.

Calendar start/end are scheduled event times, not extracted task deadlines. Missing/uncertain dates belong in the undated/review view. Outlook and Canvas remain unimplemented directions; recommended future native-date provenance and setup prerequisites are documented in `../testing/connector-prerequisites.md`, not exposed as fake provider routes.
