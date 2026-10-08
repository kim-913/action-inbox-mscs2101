---
name: qa
description: Plan and assess Action Inbox verification across unit, database, provider, and browser boundaries; report reproducible defects and honest acceptance evidence without accessing private user data.
---

# QA

## When to use

Use for test planning, an explicitly authorized verification run, defect triage, regression review, acceptance traceability, or release-readiness assessment. This responsibility profile is not a named team assignment and grants no access to real accounts, paid services, or course submission.

## Read first

Paths below are relative to the repository root unless linked.

1. Read [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, isolated synthetic smoke, centralized checks, and handoff; follow applicable `AGENTS.md` instructions.
2. Read [EXECUTION_PLAN.md](../../EXECUTION_PLAN.md): section 4 acceptance criteria, section 13 test strategy/severity/release gates, and section 18 project completion. Sections 11 and 14 are previously recorded team/course context, not a fresh inspection of Canvas or the syllabus. Test coordination in this skill is a project convention, not a new course requirement.
3. Read `docs/testing/p0-evidence.md` and `docs/testing/canvas-subscription-evidence.md`, retaining their dates and evidence boundaries. Read `docs/architecture/api-contract.md`, relevant requirements, and `docs/testing/connector-prerequisites.md` for expected behavior and external prerequisites.
4. Before runtime work, read `docs/architecture/deployment.md`, current root/workspace scripts, and the test's setup/cleanup code. Historical passing counts are not results for the current change.

## Inputs and clarifications

Capture the change/revision under review, requirement and AC IDs, intended user-visible result, test scope, environment ownership, synthetic fixture version, designated browser/device/timezone, evidence destination, and execution authority. If a central integration owner runs verification, provide the test plan and review evidence rather than launching competing checks.

Resolve facts from repository evidence first. Escalate only missing acceptance decisions or authorization: real approved test accounts, paid-model usage, reminder-delivery criteria, deployment/device choice, or destructive operations. Do not ask for private messages, credentials, or secret feed URLs. A user-reported defect is valid input; do not rerun a private operation to confirm it.

## Responsibilities and non-goals

Own observable test cases, coverage gaps, reproducible defect reports, evidence classification, regression assessment, and the release recommendation. Coordinate implementation fixes with Developer, usability findings with UI Designer, and scope/acceptance decisions with PM. Do not silently weaken acceptance, redefine severity, bypass production guards, fix unrelated application code, or declare a release accepted because a local suite passed.

## Test boundaries and navigation

| Level                        | Existing entry points                                                                                                                                                    | What the evidence does and does not establish                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/contracts               | `packages/contracts/src/*.test.ts`; API `config.test.ts`, `auth/crypto.test.ts`, `pipeline/extractor.test.ts`; web `planner-model.test.ts`                               | Validation, date/evidence rules, crypto and pure behavior. Does not prove database, deployment, or provider acceptance.                                                                                                    |
| PostgreSQL/API integration   | API `db/schema.test.ts`, `auth/auth.test.ts`, `pipeline/persistence.test.ts`, `pipeline/reconnect.test.ts`, `domain/domain.integration.test.ts`, `canvas/routes.test.ts` | Actual migrated PostgreSQL, ownership, atomicity, lifecycle, retries and deletion when the DB suites execute. Without `TEST_DATABASE_URL`, DB suites skip. Read setup before execution: tests can migrate and mutate data. |
| Provider contracts/transport | API `pipeline/providers.test.ts`, `domain/calendar-provider.test.ts`, `canvas/feed.test.ts`, `http-smoke.test.ts`; `auth/provider.test-support.ts`                       | Sanitized payloads, local HTTP adapters and transport guard cases. Not real Google/Sofia authorization or a paid AI call. A synthetic Canvas reader does not prove live DNS/TLS access.                                    |
| Browser components           | `apps/web/src/workflows.test.tsx`, `Inbox.progress.test.tsx`, `PlannerPage.test.tsx`, `CanvasFeed.test.tsx`                                                              | Vitest/jsdom interaction and state behavior; not an actual browser, visual review, performance benchmark, or deployed end-to-end run.                                                                                      |
| Actual browser smoke         | `services/api/src/testing/browser-smoke.ts`; `test-data/canvas/`                                                                                                         | Real local API/DB/browser behavior with synthetic provider data, only for steps actually performed. Starting the harness alone is not an automated end-to-end pass.                                                        |
| Offline AI evaluation        | `test-data/anonymized/v1/cases.json`; `npm run evaluate -- saved-predictions.json`                                                                                       | Metrics from saved predictions with provenance. Deterministic/synthetic predictions or a separate website experiment do not establish real model accuracy or app integration.                                              |

Root check entry points are `npm run typecheck`, `npm test`, `npm run lint`, and `npm run format:check`. A focused API run can use `npm run test --workspace @action-inbox/api -- src/pipeline/extractor.test.ts`; select an existing file appropriate to the change. Run only when assigned to execute. Full environment and smoke commands belong in [CONTRIBUTING.md](../../CONTRIBUTING.md), not a second setup recipe here.

## Workflow

1. **Map coverage.** For each affected requirement, write preconditions, synthetic inputs, user actions, expected visible outcome, persistence/external-effect assertion where relevant, and test level. Include both success and failure/recovery. Keep observed, inferred, user-reported, and not-tested claims distinct.
2. **Prepare isolation.** Use a separately owned disposable PostgreSQL instance, conventionally loopback 55433. Use `action_inbox_test` for integration tests and `action_inbox_smoke` for browser fixtures; never point `TEST_DATABASE_URL` at the persistent preview database on 55432. Unlike the smoke harness guard, a test suite should not be assumed to reject a dangerous target automatically. Record only sanitized host/port/database metadata, never its password or full connection URL.
3. **Coordinate execution.** One integration owner schedules checks after edits land. If execution is not assigned, stop at the runnable plan and handoff, not at a fabricated result. For an authorized run, record exact command, revision, environment, pass/fail/skip counts and evidence. Unavailable prerequisites are blocked coverage, not passing tests.
4. **Exercise the actual boundary.** Synthetic smoke uses API 3002 and browser 5174, a dedicated clean browser profile, and a separate build output directory. Preserve the live 3000/5173 services and `apps/web/dist`. `npm run smoke:local-providers` defaults to disabled extraction; `SMOKE_EXTRACTION=synthetic` explicitly selects a loopback synthetic response, never paid AI. The harness has no browser assertions by itself; document the actual browser actions separately. Follow CONTRIBUTING for its OAuth test orchestration without weakening the production Google redirect allowlist.
5. **Test affected invariants.** As applicable, cover approval before task/event creation, three identical syncs, Calendar retry/lost response, cross-user access, source quotations, uncertain/date-only/timezone handling, last-success retention, partial pagination, and disabled extraction with readable imports. Canvas refresh/disconnect tests must preserve independent Google/Canvas lifecycles and must not infer completion from feed disappearance. Notification metadata is not delivered notification evidence.
6. **Report and retest.** File the smallest synthetic reproducer, severity and release effect. A fixed S0–S2 defect needs a regression demonstrating the consumer-visible failure and correction. Preserve prior failure evidence; add the correction result only when actually observed.
7. **Assess acceptance.** Map each AC to evidence plus remaining gaps. Request non-author review. PM owns approved scope changes; QA must not relabel blocked work as complete to meet a date.

## Severity and release rules

Use the execution plan's incident scale, not P0/P1 feature priority as a substitute:

| Severity | Definition                                                                          | Required disposition                                                                         |
| -------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| S0       | Token/email disclosure, cross-user access, destructive data corruption              | Stop all testing, escalate immediately, release prohibited. Keep incident evidence redacted. |
| S1       | Core path unavailable, unauthorized or duplicate external event, unrecoverable sync | Release prohibited.                                                                          |
| S2       | P0 behavior incorrect with a documented workaround                                  | Fix or explicitly de-scope before feature freeze; no open S2 at release.                     |
| S3       | P1 defect or minor usability/accessibility issue                                    | May defer with an owner and rationale.                                                       |

Release also requires evidence for all P0 criteria, repeated-sync/retry duplicate prevention, AC-10 thresholds on frozen data, exercised revocation/deletion, the actual build's primary scenario, a resolved reminder-delivery criterion, and truthful course artifacts. Do not infer those gates from green unit tests.

## Known acceptance limits to carry forward

Consult current evidence before changing status. Existing recorded user success with Google sign-in/import and Canvas import is not an agent inspection, four-user/deployed Google acceptance, or full Canvas OAuth. Keep these unresolved unless new authorized evidence or an explicit approved acceptance change resolves them:

- AC-01: all four approved Google users and deployed callback/reconnection acceptance.
- AC-09: reminder metadata exists; browser-closed notification delivery needs a separately approved mechanism or replacement criterion and observed result.
- AC-10: approved real-model evaluation on the versioned 50-message set; action-required recall and explicit-deadline precision must each meet 90%. Offline fixture arithmetic is insufficient.
- AC-13: designated browser/device with 100 synchronized messages, interactive within two seconds after API data is available. A responsive screenshot or task pagination test is insufficient.
- Remaining live-provider retry/resilience, deployment/security review, final-device rehearsal, and AC-14 final-report traceability/non-author review, as tracked in the evidence documents.

Full Outlook/Canvas OAuth, private coursework/submission state, and notification channels remain broader roadmap work; the limited read-only Canvas feed must not be presented as satisfying them.

## Safety

No private user mailbox/course inspection, feed fetching, credential reads, saved browser profile reuse, or screenshots of private content. Never enable paid extraction, trigger real Calendar writes/revocation/deletion, or submit course work without explicit authorization. Preserve existing services, credentials, encryption keys, persistent volumes, and applied migrations. Clean up only disposable resources created and owned by the test run; never stop unrelated services or erase failure evidence.

## Output templates

Use the handoff location and conventions in CONTRIBUTING; these fields supplement, not replace, the shared handoff.

```text
QA handoff
Change / revision / requirement IDs:
Scope and excluded acceptance:
Environment (sanitized), fixture version, browser/device/timezone:
Checks actually executed (command/case, result, pass/fail/skip, evidence path):
Not run / skipped / blocked (reason and prerequisite):
AC → evidence type (synthetic / live approved / user-reported) → remaining gap:
Defects and regression status:
Release recommendation and unresolved gates:
Next owner and authorized action:
```

```text
Defect
ID / title / severity / affected AC:
Revision, sanitized environment, reproducibility:
Synthetic preconditions and exact reproduction steps:
Expected vs observed consumer-visible behavior:
Redacted evidence path / safe request ID:
User impact, release effect, workaround if any:
Owner / status / regression case:
Retest result (or explicitly not run):
```

## Done criteria

The assigned QA artifact is reproducible, requirement-linked, privacy-safe, and explicit about executed versus missing evidence. Defects have severity, owner, and regression expectations; blockers have a next authorized action. Test execution is complete only for the agreed scope actually exercised. Release acceptance remains blocked by open S0–S2 defects or unmet gates; a finished QA handoff may correctly recommend against release.
