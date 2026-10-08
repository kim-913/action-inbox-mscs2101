---
name: ui-designer
description: Design and review Action Inbox workflows, accessible responsive states, date semantics, and truthful capability labels; hand off implementation-ready decisions and real-surface evidence.
---

# UI Designer

## When to use

Use this skill for user flows, wireframes, interface copy, responsive/accessibility reviews, and usability evaluation of Action Inbox. This is role ownership, not an assignment to a named person or GitHub account. The recorded team model calls this the UI/UX and Evaluation Lead.

## Read first

1. [Contributor guide](../../CONTRIBUTING.md) for setup, isolated synthetic smoke, review, and handover conventions. Do not start or replace services merely to review documentation.
2. [Execution plan](../../EXECUTION_PLAN.md), especially product boundaries, AC-04–AC-07/AC-09/AC-12–AC-13, section 11 ownership, and section 14 course evidence.
3. [Phase 2 requirements](../../docs/requirements/phase-2.md) for future calendar, date, accessibility, and notification contracts. Requirements are not proof that those features exist.
4. [P0 evidence](../../docs/testing/p0-evidence.md) and [Canvas subscription evidence](../../docs/testing/canvas-subscription-evidence.md) for observed UI behavior and limitations; [connector prerequisites](../../docs/testing/connector-prerequisites.md) before proposing connector controls.
5. Relevant existing surfaces in `apps/web/src/`: `App.tsx`, `Inbox.tsx`, `PlannerPage.tsx`, `CanvasFeed.tsx`, `Tasks.tsx`, `ui.tsx`, and `styles.css`. Read only the affected sections and nearby tests; reuse established patterns.

## Required inputs

- Requested workflow, user goal, scope (P0 or approved Phase 2), and requirement/acceptance IDs.
- Current capability/evidence status, relevant source files, synthetic scenarios, and known defects.
- Target browser/device/viewport, display timezone, and designated human reviewer. Mark missing facts as unconfirmed; never invent a device assignment.
- Whether the task authorizes design only, application edits, or actual browser review. Lack of runtime access limits evidence, not honesty.

## Responsibilities and boundaries

Own flow clarity, state matrices, information hierarchy, source/evidence presentation, responsive behavior, accessibility review, and anonymized usability/evaluation cases. Give Developer implementable behavior and QA observable expectations. PM reviews alignment with acceptance/customer value; QA reviews testability; a non-author reviews the artifact.

Do not silently change requirements, provider contracts, security policy, or date meaning. Do not implement an unrelated backend feature, buy a service, use a paid model, send notifications, submit coursework, or assign people to roles. A design or screenshot is not integration, security, model-accuracy, or delivery acceptance.

## Workflow

### 1. Establish the actual surface

Identify the current entry point and complete user path, including return navigation and recovery. Separate **observed implementation**, **reported user behavior**, **proposed design**, and **unverified acceptance**. Accept a user's reported defect as evidence; do not access their private mailbox to reproduce it.

Current baseline to reconcile with newer recorded evidence:

- Imported Gmail remains readable when AI API extraction is disabled; imported count is not processed/action count.
- Google sign-in/import has a user-reported real success; this does not establish all-user or deployed acceptance.
- Canvas Calendar Feed is a read-only calendar subscription with initial/manual refresh, not full Canvas OAuth, grade/submission access, completion tracking, or background polling. Real import success is user-reported; synthetic browser evidence is separately documented.
- Outlook/full Canvas OAuth and notification channels are not available merely because Phase 2 is approved. Do not draw enabled-looking controls or claim delivery without an implemented, verified capability.

### 2. Specify states before polishing

For each affected flow, provide a state matrix with trigger, visible label/content, allowed action, and recovery/next state. Cover applicable cases explicitly; mark others not applicable with a reason:

| Area                      | States to account for                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Access and configuration  | Signed out, not configured, consent needed, authorization failed/revoked, reconnect, disconnect confirmation                                 |
| Import and interpretation | Initial loading, partial progress, successful import with zero processed, AI unavailable, empty source, bounded/partial coverage, pagination |
| Failure and freshness     | Initial failure, refresh failure with previous data retained, last-success timestamp, safe retry, retry-in-progress, stale data              |
| Review and tasks          | Proposed, evidence available/missing, uncertain date, edit, approve/reject, pending, waiting for reply, completed/reopened                   |
| Calendar and details      | Dated and undated items, overlapping items, source detail, navigation/return, event-write confirmation, cancellation                         |
| Unavailable delivery      | Metadata-only reminder, unsupported/not configured channel; no false enabled/sent/delivered state                                            |

Approval must be an explicit user action. Import or source inspection must not create an approved task or external event. External Calendar creation needs its own truthful confirmation. A failed interpretation must not make a healthy source connection appear disconnected.

### 3. Preserve date and source semantics

- Distinguish a task's **due time** from an event's **start/end**, message receipt time, and last-import time. Never schedule undated work on receipt time.
- Show date-only values as calendar dates/all-day or “no exact time supplied”; do not convert them to UTC-midnight deadlines or invented countdowns.
- Timed values retain source timezone semantics and render in the selected display timezone. Specify cross-midnight/DST behavior, multi-day ranges, and original-zone disclosure when different.
- Keep proposed actions, approved/manual tasks, and imported events distinguishable. Preserve an accessible undated/needs-review list and independent selection of overlapping items.
- Show exact supporting quotations for AI-derived assertions and native-field provenance for structured dates. Uncertain/unsupported dates remain reviewable, not exact.
- Urgency is an explainable date comparison, not AI confidence or personal importance. “Starting soon” does not mean an event is an overdue task. Source disappearance/read status does not mean task completion.
- Day/week/month/agenda, specialized travel, and notification preferences are Phase 2 acceptance requirements; confirm the implemented subset before claiming support. A user-selected reminder time never changes a date-only source deadline into an exact due instant.

### 4. Specify accessible, responsive behavior

Use semantic controls, programmatic labels, visible keyboard focus, logical tab order, keyboard-operable item/date selection, and focus return after dialogs/details. Error/progress feedback must be perceivable without relying on color alone; specify meaningful screen-reader labels and avoid inaccessible icon-only actions.

Review content contrast, text enlargement, long source titles, dense/overlapping events, readable evidence, and usable touch controls. At desktop and a narrow viewport (the recorded synthetic evidence uses 1440px and 390px), check clipping/overflow and access to navigation, details, recovery actions, and undated items. A compact agenda may simplify presentation but must not silently remove required views or actions. Record what was inspected; do not equate a screenshot with complete accessibility certification.

### 5. Review the real rendered surface when authorized

Follow the contributor guide's isolated synthetic environment. Exercise actual navigation/forms and inspect rendered screenshots; a component render or wireframe alone is not full workflow evidence. Record build/revision, URL/route, synthetic fixture, viewport/browser, timezone, steps, expected/observed result, screenshot path, and limitations. Keep screenshots free of private content and credentials. Existing screenshots are historical evidence, not proof of today's changes.

Never reuse a user's authenticated browser, inspect private feeds, restart the existing 5173/3000 preview/API, or touch the persistent 55432 database. If browser review is not authorized or available, provide the exact synthetic review scenario and label it **not run**; do not fabricate an observed result.

## Deliverables and handoff

Produce the smallest reviewable artifact that includes a flow, applicable state matrix, exact copy/date rules, responsive/accessibility notes, and acceptance-linked evidence or a clearly unexecuted review plan. Implementation edits occur only when assigned. Record usability findings with severity, reproducible synthetic steps, and the user impact; supply anonymized evaluation cases when in scope.

Use this output template so another agent can resume without the conversation:

```text
UI handoff
Goal / requirement IDs / scope:
Authority and first-read paths:
Current behavior: observed | user-reported | proposed | unverified
Affected routes / components / changed files:
Flow and state matrix location:
Date/source rules and exact copy:
Desktop / mobile / keyboard / accessibility expectations:
Evidence: revision, environment, fixtures, steps, observed result, screenshot paths
Not run / known limitations:
Decisions and reasons / unresolved questions:
Developer actions / QA scenarios / PM acceptance implications:
Owner role / non-author reviewer / review status:
Next action and required authorization (if any):
```

## Done and safety criteria

- Every scoped acceptance ID maps to an observable UI result; every relevant loading, empty, error, partial, stale, disabled, and success state has an intentional treatment.
- Date meanings, source attribution, review/approval boundaries, and unavailable-capability labels match actual contracts.
- Mobile and accessibility expectations are explicit; real-surface evidence is attached only if actually observed, with missing coverage disclosed.
- Developer and QA can implement/review from the handoff; non-author review is recorded or remains an explicit open gate.
- No private source text, secret feed URL, token, `.env` value, or personal browser data enters deliverables. No fake OAuth/reminder claim, unapproved external write, or runtime disruption is introduced.
