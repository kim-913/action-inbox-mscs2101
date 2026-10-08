# ADR-004: Durable processing, review, and provider boundaries

Status: accepted implementation decision, 2026-10-07.

Use PostgreSQL transactions and uniqueness as the authority for ownership, optimistic versions, approval and idempotency. Native fetch adapters call real Google endpoints; the OpenAI Responses SDK uses strict structured output behind an Extractor interface. Provider base URLs are deployment/test configuration, never client input. No production adapter simulates provider success. Provider errors become safe stable API errors and never log raw bodies.

Gmail runs are durable pg-boss jobs, bounded to the latest 14 days and at most 100 messages. Persist normalized plain text without attachments, retaining last successful data. A failed extraction marks both its message and the run failed; retry reprocesses stored failures without overwriting human decisions. Quotation offsets refer to exactly the persisted normalized body. The model has no tools. Ambiguous or unsupported deadlines remain unset and visibly flagged. An anonymized 50-case evaluation harness is versioned; deterministic boundary tests are not a claim of measured model accuracy.

The first conservative deadline policy accepts an automatic exact timestamp only when the separate verified deadline quote contains one full ISO date/time with an explicit UTC/offset and agrees with the proposed instant. Date-only, relative, numeric-ambiguous, negated, and unsupported values remain unset and require user review. This intentionally favors precision over automatic deadline recall; it is a disclosed limitation, not an accuracy claim.

Approval locks the suggestion and creates one task in one transaction. Manual task creation is an explicit user action with a scoped idempotency key. Calendar creation is a separate explicit approval, using a deterministic Google event ID and persisted intent so uncertain responses/retries cannot create another event. Upcoming calendar results retain a successful cached snapshot across provider failures. Disconnect revokes access before purging retained message-derived content; deletion revokes before cascading account data. Failure is exposed rather than pretending external revocation succeeded.

Calendar idempotency is task-scoped: retries with unchanged immutable event content reuse the stored intent and Google event ID even after a browser reload generates a replacement client UUID. Changed content conflicts rather than creating another event. Other create requests retain their user-scoped request UUID semantics.

The retention boundary fences every ingestion write by both the original running sync record and the original Google connection ID, under the user-row lock. A newly connected account cannot authorize an old held provider response. Reconnect reconciliation verifies stable user/task provider markers and immutable-content hash, not a discarded request UUID. Revocation accepts a bounded, definitive HTTP 400 `invalid_token` as already revoked; ambiguous transport/provider failure still blocks purge and remains retryable.

Reminder endpoints manage only in-app due metadata, clearly labelled as such. No notification scheduling or delivery success is implemented or claimed; AC-09 remains pending the user's delivery decision.

Runtime composition supplies a PostgreSQL pool, validated deployment configuration, authenticated-user hook, and Google gateway to route modules. Tests inject local HTTP provider servers only at provider URL seams. OAuth/CSRF remains responsible for every authenticated mutation, including calls made through those seams. All installation and verification is centralized after parallel implementation lands.

## Connected-planner presentation refinement

The internal calendar/agenda can display source-linked proposals automatically after a consented import. A proposal is not an approved task or an externally created event. Keep undated/uncertain work visible outside date cells; never substitute receipt time or an event's start for a task deadline. Date-based urgency is not model confidence or user importance.

Import and extraction are distinct outcomes: disabled extraction must leave imported original messages readable, with visible progress and a safe explanation. The browser consumes bounded cursor-paginated inbox/tasks and discloses partial loaded coverage with further-page controls. Google Calendar events remain separately labelled read-only scheduled items until a user explicitly requests a write. Native future provider dates require field-level provenance rather than invented text evidence; Outlook/Canvas are not implemented by this refinement.
