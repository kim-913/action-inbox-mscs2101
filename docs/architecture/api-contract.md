# Browser P0 API contract

The Zod schemas in `packages/contracts/src/p0.ts` are authoritative. They are specified ahead of backend implementation; only health is implemented in the baseline. No UI should claim provider functionality is available until the real endpoint succeeds.

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

`POST /v1/sync/gmail` retries failed extractions for already persisted emails without overwriting approved/rejected decisions. Failed extraction sets the email's `extractionError` and prevents the containing run from reporting `Succeeded`; last successful data remains readable. Action and explicit-deadline support use separate `evidence` and `deadlineEvidence` fields.

Reminder storage is not delivery: `delivery: "Not configured"` is mandatory. These endpoints manage only explicitly labelled in-app due metadata. The UI must not offer a control claiming a notification was scheduled, or report reminder success without a delivery mechanism. AC-09 remains incomplete and pending the user's delivery decision. No notification permission, email, push, or background delivery is implied.
