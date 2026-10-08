# Phase 2: connected calendar and opt-in reminders

## Status and authority

The user has approved these **Phase 2 product goals**, including eventual genuine Outlook and Canvas connectors, a self-contained calendar, and opt-in notification channels. This document defines requirements and acceptance gates; it does not claim implementation, account setup, notification delivery, or approval to purchase services. `EXECUTION_PLAN.md` remains the authoritative delivery plan. Its integration owner must reconcile the earlier deferrals with this approved future scope without marking incomplete P0 criteria complete.

Current evidence and official connector references remain in [connector prerequisites](../testing/connector-prerequisites.md). Gmail/Google Calendar are the only discovered configured provider path. AI API extraction remains disabled unless separately authorized/configured; a website subscription experiment is not a backend service. No credentials, phone number, paid purchase, provider registration, or runtime changes are requested by this planning document.

## Product boundary

After source-specific consent, supported items are imported read-only and displayed automatically inside Action Inbox. Users can understand their schedule, deadlines, short descriptions, actions, source attribution and supporting details without opening Google Calendar or another provider's UI. Provider sign-in/consent may necessarily leave the app; opening the original source is an optional escape hatch, not the primary viewing workflow. Styling may follow familiar calendar conventions without embedding or depending on Google Calendar UI.

Automatic display is not task approval, execution of an action, or permission to write to a provider. External calendar creation, email sending, flight changes and Canvas submissions/completion are never consequences of import, urgency, or notification delivery. Canvas remains read-only unless the user separately explicitly confirms a specific write; no Canvas write feature is authorized by this phase. “Flights and other time-sensitive items” means documented supported item types and their available evidence, not universal understanding or automatic action on anything in an account.

## P2-01: genuine Outlook and Canvas connectors

### Prerequisites and implementation boundary

- **Outlook:** an owner-approved Microsoft Entra application registration, selected tenant/account audience, correct Web callback, application client ID and server-side confidential-client credential; an eligible consenting Outlook mailbox and institutional approval where required. Use delegated OAuth authorization-code flow with state/browser binding and PKCE. Request `offline_access` for consented continued import, `Mail.Read` only when body details are needed, and `Calendars.ReadBasic` or `Calendars.Read` according to selected event details. No application-wide mailbox access or read/write/send permissions for import. A free developer tenant cannot be assumed.
- **Canvas:** an institution-approved HTTPS host and enabled scoped Canvas API developer key/client ID and secret, registered callback and consenting authorized user. Scope GET access to the actual planner/course/assignment endpoints used. A student browser session, unrelated LTI key or a request to paste a personal access token is not a multi-user OAuth integration. Respect institution key restrictions and inclusion settings. No Canvas browser automation.
- Reuse server-owned sessions, encrypted token storage, ownership checks, safe errors and disconnect fencing. Do not create fake connected states or active connection buttons for missing backend capabilities. Until prerequisites are supplied through approved secure configuration, report “Not configured” and the non-secret prerequisite rather than pretending import is available.
- Source credentials, institution decisions and any service purchase remain separate implementation prerequisites, not work silently authorized by this plan.

### Import behavior

Consent enables a bounded initial import and an explicitly disclosed automatic refresh policy. Each connector must document its resource selection, date window, item/page limits, refresh interval, pagination, backoff and cancellation behavior before release. An import limit or inaccessible course must not look like complete coverage. Do not promise instantaneous background synchronization.

Maintain stable identity scoped by local user, provider connection/account, source type and provider ID; include course/calendar/occurrence identity when needed. Repeated imports update the same item without duplicating it or overwriting user decisions. Successful deletion/cancellation reconciliation marks or removes unavailable source items; partial/failed reads do not prove deletion. Preserve last successful data with freshness and partial-coverage labels.

Show separate configuration, authorization, import and interpretation health. Native field mapping may succeed while AI extraction is disabled. Imported-item count is not extracted-action count. A failed extractor must not make a healthy consented connector appear disconnected.

Native deadlines bypass AI: Canvas effective `due_at` applies to the requesting user; keep override application enabled and do not substitute `lock_at`, `unlock_at`, another student's due date or an `all_dates` minimum. Outlook mail `flag.dueDateTime` is a follow-up deadline, not proof of a sender deadline. Event start/end and Canvas planner-note placement dates retain their own meanings. Unstructured actions/dates need supported, verified extraction or user entry; otherwise retain readable content and an undated/review state.

## P2-02: self-contained internal calendar

Provide **day, week, month and agenda** views with next/previous/today navigation, current range labels, selectable items, and a persistent user-selected display timezone. Details must be available in-app: short plain-text description, proposed action if supported, due or scheduled time with its meaning, source label/account/course where appropriate, evidence or native-field provenance, freshness, and local/source status. Do not fetch private content merely by rendering an optional source URL.

Keep proposed suggestions, approved/manual tasks, existing imported events, follow-ups and travel items distinguishable. All-day/date-only items remain calendar dates rather than arbitrary UTC midnight deadlines. Timed events preserve source timezone and render in display timezone; details expose original timezone when different. Event ranges, multi-day events, daylight-saving transitions, recurrence occurrences/exceptions and cancellations must render consistently. Date-only items have no precise due instant unless the user supplies a reminder time under P2-03.

Provide an undated/needs-review list beside the calendar rather than silently hiding those items or scheduling them on message receipt time. Overlapping events remain independently selectable. Support keyboard navigation, visible focus, accessible date/item labels, and source/status indicators that do not rely solely on color. Responsive layouts may use agenda as a compact presentation but must preserve access to all four views and details.

## P2-03: reminder preferences and lifecycle

The app must offer **1 day before, 2 days before, and custom lead time** preferences and an explicit “Enable notifications” entry point. Keep internal reminder scheduling separate from actual delivery capability. No preselected paid channel, silent OS permission prompt, or claim that metadata means a message was delivered.

- Preferences are opt-in **per channel**, with global defaults and per-item override/disable. Store the timezone, quiet-hour interval and chosen date-only reminder time explicitly. A day-before rule means the preceding local calendar day at the item's local time (or selected date-only reminder time), not always 24 elapsed hours; offer exact hours/minutes as distinct custom units. Handle daylight-saving nonexistent/ambiguous local times with a documented visible resolution rule before activation.
- Show a preview of actual scheduled reminder date/time, timezone, channel and any quiet-hours adjustment before enabling. Defaults may propose 1/2 days but never enable a channel without consent. For a date-only deadline, require/display a user-selected reminder clock time without turning the source due date into an exact deadline.
- Quiet hours defer a reminder to their end only if that remains before the target time; otherwise mark it suppressed/needs attention in-app. An explicit user-approved quiet-hours exception may change that rule, but urgency alone never bypasses consent or quiet hours. A past scheduled time is shown as missed; do not silently send a backlog burst. A user may explicitly request “Remind me now.”
- Source date/time changes invalidate the old schedule and recompute from the newest source revision. Local overrides stay distinguishable; conflicting changes require review rather than silently discarding a user choice. Source cancellation/deletion, item completion, reminder disable, channel opt-out and source disconnect cancel pending deliveries for affected items. Imported source read state is not completion.
- Disconnect cancels reminders derived from that connection and removes its retained content under the account retention policy. Unrelated manual items remain unless the user deletes them. A worker must recheck active consent, item/version and cancellation status immediately before dispatch. Already accepted/delivered notifications cannot be recalled; disclose this boundary and do not claim otherwise.
- Separate schedule status (`scheduled`, `suppressed`, `cancelled`, `missed`) from dispatch status (`pending`, `attempting`, `accepted by provider`, `failed`, `unknown`) and optional provider-reported delivery. Keep the distinction visible without exposing sensitive transport data.

## P2-04: explicit urgency and supported travel

Urgency is deterministic and explainable, not inferred importance or permission to act. For supported exact deadlines, show `Overdue` when an incomplete item's due instant has passed; `Due within 1 day` and `Due within 2 days` use the configured local-day policy and show the actual due time. Date-only deadlines use local calendar dates and display “Due today” rather than an invented countdown. A source event may be “Starting soon” but is not an overdue task. Completion/cancellation suppresses pending-action urgency.

An explicit source instruction such as “act immediately” may become an **immediate-action suggestion** only with a verified supporting quotation or appropriate structured flag; importance/high priority alone is not a deadline. If the action, date or timezone is uncertain, label it for review, keep the supported portion, and do not send an exact deadline notification based on a guess. Enabling immediate-action alerts is a separate preference within each opted-in channel; deduplicate each supported source revision and respect quiet hours. The app suggests the action, never performs it automatically.

Support a bounded travel item for an explicitly evidenced flight segment: provider/source identity, optional flight number/status, origin/destination, departure and arrival dates/times with **their respective timezones**, and source update time. Preserve both original local times and normalized instants where conversion is supported, including overnight/date-line travel. Boarding time, check-in deadline, terminal, gate and arrival time must remain absent when not supplied; never invent these from departure or a generic airline rule. A reminder before departure is a user-chosen lead time, not a claimed check-in deadline. Multiple flight segments have separate identities; do not merge an itinerary into one deadline.

Structured event/travel fields can map without AI. Plain-text confirmations require verified evidence for each asserted field or manual review. This phase does not authorize attachment/OCR ingestion, airline APIs, live flight tracking, booking changes, or universal itinerary parsing. Show “Last imported” rather than implying real-time flight status. Additional time-sensitive types require an explicit mapping/date-meaning specification and acceptance fixtures before being advertised as supported.

## P2-05: channels and honest delivery

### In-app and web push first

In-app reminders can surface while the application is open; they are not closed-browser delivery. Web push requires a supported browser/platform, secure context in deployment, service worker/push subscription and backend dispatch capability. Ask notification permission only after a user gesture that explains the channel. Denied, unsupported or revoked permission must produce a usable in-app state, not repeated prompts or a fake enabled switch.

A registered push subscription does not establish universal delivery while the browser is closed. Operating-system restrictions, installation requirements, browser settings, connectivity and permission changes affect receipt. Publish a supported browser/device matrix with version, installed/not-installed state, foreground/background/browser-closed conditions and **observed** outcomes. Label untested/unsupported combinations and do not promise delivery on them. Push provider acceptance is not proof of display, user attention, or action. Lock-screen payloads default to a generic reminder; showing sensitive source text requires an explicit privacy choice.

### Email, then optional SMS

Email is a separately opted-in later channel with an approved authenticated sending provider/account, recipient verification, sender identity configuration and explicit budget/cost decision before use. Reading a mailbox does not authorize using it to send reminder emails. Email content and unsubscribe/disable controls must honor privacy preferences.

SMS is a still-separate optional channel requiring affirmative SMS consent, verified destination through an approved implementation, authorized provider account/sender setup, applicable consent/opt-out requirements, and disclosed provider/carrier charges and budget limits. Do not request a phone number or credentials during planning, infer consent from another channel, buy service, or send a test SMS now. Provide accessible per-channel disable and process supported provider opt-out signals; block future sends after opt-out even if an old job was queued. No emergency, safety-critical or guaranteed-delivery positioning.

### Dispatch contract for every implemented channel

Use a durable schedule/dispatch record keyed by user, item, source revision, reminder occurrence, channel and recipient/subscription identity as appropriate. Rate-limit per user and provider, cap outstanding reminders and retry attempts, respect provider retry guidance and expiry, and never retry beyond the useful delivery window. Define those numerical limits in deployment configuration and acceptance fixtures before channel activation; costs cannot be uncapped.

Use provider idempotency where available. On uncertain timeout outcomes, reconcile delivery status if supported; otherwise mark `unknown` and avoid blindly re-sending potentially duplicated paid/user-visible messages. Do not promise exactly-once external delivery when a provider cannot support it. Surface safe actionable failure/unknown status and channel health, preserve scheduling history sufficient for diagnosis, and never expose raw recipient/token/provider payloads in logs.

## Security, privacy and retention gates

- Bind OAuth state/PKCE and tokens to the correct user, provider, approved origin and connection generation. Validate callback destinations and pagination/source URLs; reject cross-origin credential forwarding. Encrypt tokens and push subscription/recipient secrets at rest with server-only key management; no browser storage of provider secrets.
- Treat all imported text/HTML as untrusted. Render sanitized plain text or an explicitly safe representation; evidence cannot execute instructions or trigger writes. Notification deep links require authenticated ownership checks and must not carry source content or bearer credentials in URLs.
- Minimize import scope, source fields and notification payloads. Record consent channel, purpose, timestamp/version and revocation; never turn denied notification permission into silent fallback email/SMS.
- Before release, specify numerical retention durations for imported content, dispatch metadata and backups. Disconnect/account deletion cancels pending jobs, purges applicable source content and secrets, and fences in-flight workers. Retain only minimal legally/operationally required delivery/consent audit metadata under a disclosed policy, not copied private source bodies. Purge deadlines and exceptions must be documented and tested rather than left indefinite.
- Every connector/channel exposes honest configuration and failure state. No private data in diagnostics or evidence screenshots; acceptance uses synthetic accounts/fixtures unless a separately approved live read or notification test has explicit user consent.

## Measurable acceptance matrix

These are required future checks, **not tests run or passed** by this planning change.

| ID      | Acceptance gate                                                                                                                                                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-AC01 | Each enabled Outlook/Canvas connector completes real approved OAuth, imports only granted read resources, refreshes expired tokens and exposes denied/revoked access. Missing credentials disable connection capability honestly. Live evidence is separate from fixture evidence. |
| P2-AC02 | Three identical imports produce one item per stable source identity and zero provider writes. Two accounts with equal IDs remain isolated. Paginated/limited imports disclose their coverage; failure retains last-success data and does not infer deletion.                       |
| P2-AC03 | Fixtures cover Canvas effective override/null due/lock-vs-due, Outlook missing/native follow-up due, recurring event exceptions/cancellations and AI-disabled native import. Every displayed date records semantic kind and provenance.                                            |
| P2-AC04 | Day/week/month/agenda show the same fixture items for equivalent ranges; today/navigation, overlaps, details and undated review are keyboard-accessible without opening provider UI. No task deadline is fabricated from event start or receipt time.                              |
| P2-AC05 | Time fixtures cover all-day/date-only, two display zones, daylight-saving forward/back transitions, multi-day events and flight segments crossing midnight/date line. Original timezone/date meaning remains visible and no unsupported time is invented.                          |
| P2-AC06 | A user can preview and opt into 1-day, 2-day and custom reminders per channel/item, choose timezone/quiet hours, and disable them. Zero outbound notifications occur without that channel's consent. Date-only items require an explicit reminder clock time.                      |
| P2-AC07 | Under a controllable clock, source reschedule/completion/cancellation/deletion/disconnect and channel opt-out invalidate pending old-revision jobs before dispatch. A concurrent stale worker cannot restore them. Accepted notifications are honestly non-recallable.             |
| P2-AC08 | Boundary fixtures demonstrate local-day urgency, overdue/completed status, evidence-backed immediate-action suggestions, quiet-hours suppression/defer and past-time handling. Uncertain dates never trigger exact-time alerts.                                                    |
| P2-AC09 | Web push evidence records permission granted/denied/revoked and each advertised browser/device foreground/background/closed condition. The UI accurately distinguishes unavailable, scheduled, provider-accepted and observed outcomes; no universal closed-browser guarantee.     |
| P2-AC10 | Simulated provider failures exercise configured rate limits, retry cap, expiry, deduplication and unknown-result reconciliation. No duplicate dispatch is knowingly created on retries; unavoidable provider uncertainty is visible rather than labelled delivered.                |
| P2-AC11 | Email/SMS cannot activate before approved provider/authentication, channel-specific consent, recipient verification, cost cap and opt-out handling exist. SMS opt-out cancels queued sends. No paid/live notification test occurs without separate approval.                       |
| P2-AC12 | Cross-user access tests deny item/notification links, secret and source-content logging checks pass, malicious provider links/HTML remain inert, and retention/disconnect/deletion checks prove purge and stale-worker fencing within documented deadlines.                        |

## Staged dependency order

1. **Contract and internal calendar:** define source identities/date semantics/health and supported item types; deliver in-app day/week/month/agenda, details and undated review using existing supported data. Preserve external-write confirmation and disabled-AI honesty.
2. **Read-only connectors:** resolve approved OAuth/institution prerequisites, then implement and verify Outlook/Canvas adapters and native mappings. Release only the actually configured, tested source capabilities; no fake cards while blocked.
3. **Durable reminder lifecycle:** add consent/preferences, schedule previews, timezone/quiet-hour behavior, urgency rules, cancellation/version fencing and in-app display. Metadata alone must still not claim external delivery.
4. **Web push:** implement subscription/service worker/backend delivery and publish observed platform support. Security, retry/dedup and permission gates precede enabling the channel.
5. **Travel specialization:** enable only the specified evidenced flight-segment mapping and revision-aware departure reminders after calendar/date and reminder gates; no airline integration or attachment expansion implied.
6. **Email, then optional SMS:** only after separate account/provider, consent, recipient verification, privacy, budget and compliance gates. Absent those prerequisites, keep the channel unavailable rather than substituting paid services or harvesting account information.

The stages sequence dependencies, not a claim of completed delivery or permission to bypass P0 acceptance. No runtime/code/test changes, account setup or notification sends accompany this document.
