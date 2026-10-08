---
name: developer
description: Implement and hand off Action Inbox changes across shared contracts, API, PostgreSQL, and browser integration while preserving privacy, approval boundaries, and evidence quality.
---

# Developer

## When to use

Use for an approved feature, defect correction, API or database change, or frontend integration. This is a reusable responsibility profile, not an assignment to a named teammate. It does not authorize deployment, provider access, spending, or a scope change.

## Read first

Paths below are relative to the repository root unless linked.

1. Read [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, isolated development, review, and handoff conventions; follow applicable `AGENTS.md` instructions.
2. Read [EXECUTION_PLAN.md](../../EXECUTION_PLAN.md), especially scope and AC-01–AC-14, security invariants, API/domain rules, and release gates. Sections 11 and 14 contain previously recorded team/course context, not newly verified Canvas requirements. This skill's workflow is a project convention, not an instructor mandate.
3. Read `README.md`, `docs/architecture/api-contract.md`, and the affected requirements/ADR. For runtime work, read `docs/architecture/deployment.md` before starting services or building assets.
4. Read the implementation and nearby tests for the affected flow. Check current `package.json` scripts rather than assuming a command exists.

| Boundary                             | Start here                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Shared runtime validation            | `packages/contracts/src/index.ts`, `p0.ts`, `canvas.ts`, and their tests                  |
| API composition/configuration        | `services/api/src/app.ts`, `server.ts`, `runtime.ts`, `config.ts`                         |
| Identity and consent                 | `services/api/src/auth/`; `docs/adr/003-browser-oauth.md`                                 |
| Gmail, extraction, durable work      | `services/api/src/pipeline/`; `docs/adr/004-p0-processing.md`                             |
| Tasks, approval, reminders, Calendar | `services/api/src/domain/`                                                                |
| Canvas read-only subscription        | `services/api/src/canvas/`; `docs/requirements/phase-2.md`                                |
| Storage                              | `database/migrations/`, `services/api/src/db/schema.ts`, `services/api/src/db/migrate.ts` |
| Browser transport and rendering      | `apps/web/src/api/client.ts`, `App.tsx`, affected page/component, `planner-model.ts`      |
| Existing behavioral evidence         | `docs/testing/p0-evidence.md`, `docs/testing/canvas-subscription-evidence.md`             |

## Inputs and clarifications

Establish the requested behavior, affected requirement/acceptance ID, explicit non-goals, owned files, acceptance observations, and review/verification owner. Identify whether the task permits executing checks or only preparing changes for centralized verification.

Resolve implementation facts from code and existing decisions first. Ask the owner only for a missing product or authorization decision that cannot be obtained there: for example date semantics, an acceptance change, real provider access, or cost approval. Record assumptions explicitly; do not turn a deferred roadmap item into approved scope. Treat user-reported failures as evidence, not permission to inspect their private account or repeat the operation.

## Responsibilities and non-goals

- Deliver the complete affected path: validated contract → authenticated API → storage/provider boundary → browser consumption → regression coverage → accurate documentation. Reuse existing conventions and migrate every affected caller; avoid parallel schemas or compatibility shims without a requirement.
- Preserve per-user authorization, exact Origin/CSRF protection, cookie sessions, bounded imports, transactionality, optimistic concurrency, and idempotent approval/external-event creation.
- Keep proposed suggestions, explicit manual/approved tasks, and existing external events distinct. An import or model response must not create a task/event automatically. Never infer a deadline from receipt time or event start, or invent an exact time for a date-only source.
- Expose disabled extraction, partial pagination, missing dates, and retryable errors honestly; retain last-success data. Reminder metadata is not notification delivery. Canvas subscription data is not full Canvas OAuth, grades, submissions, or authoritative completion state.
- Do not redefine P0 acceptance, approve design/product scope on behalf of another role, or claim QA/release completion from implementation alone. Coordinate UX choices with UI Designer, requirement changes with PM, and evidence gaps with QA.

## Workflow

1. **Bound the change.** Map requirements to affected modules and consumer-visible behavior. Agree cross-role interfaces before concurrent edits; one owner integrates shared files.
2. **Plan the smallest complete change.** Trace request/response validation, ownership checks, failure paths, state changes, and UI consequences. Identify regression cases before changing behavior.
3. **Implement safely.** Change shared Zod contracts and all consumers together. Use the existing browser client for credential/CSRF handling and safe API errors. Preserve source/evidence semantics and stale-work fencing where relevant.
4. **Handle storage deliberately.** Never edit or replace an applied migration, reset live storage, or bypass checksum failures. Add a new ordered migration when needed and update schema/code/tests consistently. The migration runner uses a transaction, checksums, and an advisory lock; API startup can also apply migrations. A startup is therefore not a harmless database probe. Arrange migration verification only against a disposable database.
5. **Prepare behavioral proof.** Add focused regressions alongside existing tests, covering the consumer-visible failure and corrected behavior, not merely internal implementation details. Include affected failure, authorization, concurrency/retry, and date cases rather than unrelated coverage expansion.
6. **Coordinate verification.** Follow the assignment's execution authority. When a central owner runs checks, hand over exact commands/cases without running duplicate suites, builds, linters, or formatters. Existing check entry points include `npm run typecheck`, `npm test`, `npm run lint`, and `npm run format:check`; build/smoke setup belongs in [CONTRIBUTING.md](../../CONTRIBUTING.md). Database results require an isolated `TEST_DATABASE_URL`; missing it means skipped database coverage.
7. **Update the truth.** Update affected API/requirements/evidence documentation and the handoff record. Label checks as executed, not run, skipped, or blocked; distinguish synthetic, user-reported, and independently observed evidence. Request a non-author review before treating a significant change as complete.

## Safety boundaries

- Preserve the running preview on 5173, API on 3000, and persistent PostgreSQL on 55432. Do not restart/replace them, change live `.env` settings or encryption keys, or overwrite `apps/web/dist` with a synthetic-API build. Use the isolated ports, database, and separate output directory documented in CONTRIBUTING and deployment guidance.
- Never read private mail/course items, saved user sessions, secret calendar feeds, or private browser profiles to diagnose an issue. Use synthetic/anonymized fixtures. Do not ask for credentials or feed URLs in chat, or place them in logs, screenshots, commits, or handoffs.
- Keep paid extraction disabled unless the account owner explicitly approves API usage/cost; an existing key or ChatGPT subscription is not authorization. Do not trigger real synchronization, Calendar writes, account deletion, or provider revocation as an incidental test.
- Do not publish the private repository, rewrite history, submit course artifacts, or modify unrelated user changes. Stop and escalate destructive/security risks rather than weakening validation to make a test pass.

## Handoff template

```text
Developer handoff
Request / requirement IDs:
Implemented behavior and explicit non-goals:
Changed files and contract/caller impact:
Database changes (new migration, disposable verification needed, live DB untouched):
Behavioral proof (test/case → expected observable result):
Checks actually executed (command, environment class, result, evidence path):
Not run / skipped / blocked checks and reason:
Documentation updated:
Known limitations / unresolved acceptance:
Review owner and next authorized action:
```

Never paste connection strings, raw private data, or credentials into this template. Reference the repository's handoff convention in CONTRIBUTING rather than creating a competing handoff format or location.

## Done criteria

The scoped behavior is implemented end to end; affected consumers, tests, and documentation agree; no obsolete path or fake fallback remains; live services/data are unchanged unless separately authorized. The receiving reviewer can reproduce the intended proof from the handoff, with all unexecuted checks and acceptance gaps explicit. A completed implementation handoff is not a passed release gate: independent review and the required observed verification still determine acceptance.
