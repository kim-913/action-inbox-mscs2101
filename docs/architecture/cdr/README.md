# CDR detailed design

Developer-facing design views from the November 2026 CDR. These complement the [API contract](../api-contract.md), [deployment design](../deployment.md), [SRS v2.0](../../requirements/srs-v2.0.md) and [human-approval ADR](../../adr/course-0001-human-approval-boundary.md). Presentation decks, speaker notes and course reports are intentionally excluded.

## Design views

| View                                   | Editable Mermaid                      | Preview                            |
| -------------------------------------- | ------------------------------------- | ---------------------------------- |
| Architecture and provider boundaries   | [Source](01_current_architecture.mmd) | [SVG](01_current_architecture.svg) |
| Extraction classes and interfaces      | [Source](02_uml_class_diagram.mmd)    | [SVG](02_uml_class_diagram.svg)    |
| Ownership and source-linked data model | [Source](03_data_model.mmd)           | [SVG](03_data_model.svg)           |
| Approve a suggestion                   | [Source](04_approve_sequence.mmd)     | [SVG](04_approve_sequence.svg)     |

## Architecture and component responsibilities

- React calls the Fastify API. Session, Origin/CSRF and request validation guard mutations; queries are scoped to the authenticated user.
- Gmail sync uses **pg-boss, a PostgreSQL-backed job queue**. The API records the sync run and queue job in the same transaction, then returns HTTP 202. A repeated request reuses an account's existing queued/running sync.
- `processSync` coordinates Gmail import, optional extraction, validation and persistence. `GmailReader` uses `GoogleGateway` for authenticated provider requests. The injected `Extractor` interface permits controlled failure outputs in tests; `OpenAIExtractor` implements real extraction when configured.
- Extraction output passes `validateExtraction` before `saveExtraction`. The model has no tools or authority to create tasks or provider events.
- Canvas refresh and Google Calendar requests currently run directly through the API. Canvas remains a read-only calendar feed; Calendar creation requires separate confirmation.

Code: [pipeline registration](../../../services/api/src/pipeline/index.ts), [worker](../../../services/api/src/pipeline/worker.ts), [reader](../../../services/api/src/pipeline/gmail.ts), [extractor](../../../services/api/src/pipeline/extractor.ts).

## Data and consistency invariants

- Composite foreign keys keep source email, suggestion and task links within the same user. They complement account-scoped API queries; they are not row-level security.
- A suggestion can yield at most one task, enforced by the unique source-suggestion field. Manual tasks have null source IDs and an account-scoped unique request ID for retries.
- A task has zero or one Calendar link. Requested/Created/Failed status and the external event ID support reconciliation; a link's existence alone does not prove external creation succeeded.
- Source identity and date meaning remain distinct: a native due date stays a due date, while an event retains its time slot. Stored snapshots retain the last successful data after failed refresh.

Code: [ingestion constraints](../../../database/migrations/0003_ingestion.sql), [task constraints](../../../database/migrations/0004_tasks.sql), [Calendar event identity](../../../database/migrations/0005_calendar_event_id.sql).

## Approval sequence

1. Authenticate and validate the request, including its version and optional edits.
2. Begin a transaction; lock the user row, then the owned suggestion row.
3. If already Approved, return the existing task **before** checking the old version. This makes a lost-response retry safe; edits attached to that retry do not rewrite the existing task.
4. Otherwise, reject a non-Proposed state or stale version with a conflict response.
5. Update the suggestion and insert the task in the same transaction. Commit both writes, or roll back both before returning an error.
6. Calendar creation remains a separate confirmed request outside this transaction.

Locks serialize concurrent writes; versions detect a caller acting on an outdated view. The user-row lock is deliberately coarse and may cause contention for a busy account.

Code: [approval route](../../../services/api/src/domain/suggestions.ts), [transaction helper](../../../services/api/src/domain/store.ts).

## Optimization boundaries

The browser already uses a query cache, and source snapshots are persisted. A shared read cache is a **future option after profiling**, with user-scoped keys and invalidation on changes/disconnects; approval must still use current database state. Workers currently start with the API. Independent worker deployment and increased concurrency are also future options, constrained by provider limits, database connections and lock contention. They are not implemented scaling claims.

The course Canvas-feed ADR remains **Under Discussion** in SRS v2.0 Appendix B; importing the diagram does not change that status.

## Provenance and limits

The eight Mermaid/SVG files were copied from the [Drive CDR diagrams folder](https://drive.google.com/drive/folders/1SixuyIQEaWfEdbWK-Yn6oM0VhFiynTRj) on November 14, 2026, with source checksums verified. Their code baseline is `251dfec1e3121fe90af9568c022010b4568a6179`, as recorded in the source comments. These are selected design views: the data model omits some snapshot/reminder tables, and the class view includes a function module as well as interfaces/classes. They do not establish completed real-model evaluation, provider acceptance or notification delivery.
