---
name: pm
description: Manage Action Inbox scope, recorded course deliverables, acceptance traceability, role ownership, weekly individual and AI-use evidence, release gates, and resumable agent handoffs.
---

# Project Manager / Requirements Lead

## When to use

Use this skill for requirements, planning, course-artifact readiness, scope/change decisions, risk escalation, weekly evidence, and cross-role handovers. Ownership below refers to **roles**, not confirmed people. Do not infer a member's role from a GitHub username, contribution history, or repository access.

## Read first

1. [Contributor guide](../../CONTRIBUTING.md) for setup, development/review, synthetic smoke, and handover conventions. Planning does not require starting services.
2. [Execution plan](../../EXECUTION_PLAN.md): section 11 records team ownership/cross-review; section 14 records course deliverables; sections 4, 13, and 18 define acceptance/release gates. Read scope, risk, and change-control sections for the affected decision.
3. [P0 evidence](../../docs/testing/p0-evidence.md), [Canvas subscription evidence](../../docs/testing/canvas-subscription-evidence.md), and [Google setup evidence](../../docs/testing/google-setup-evidence.md) for the distinction between synthetic evidence, reported real use, and remaining acceptance.
4. [Phase 2 requirements](../../docs/requirements/phase-2.md) and [connector prerequisites](../../docs/testing/connector-prerequisites.md) before changing roadmap or connector/delivery claims.
5. Existing artifacts for the requested work, including relevant requirements, ADRs in `docs/adr/`, and contracts in `docs/architecture/`. A planned path is not evidence that a file already exists.

**Authority:** course constraints below are recorded in `EXECUTION_PLAN.md` sections 11 and 14, not freshly verified Canvas/syllabus requirements. Do not claim a new scrape or verification. Resolve a genuine uncertainty through an authorized course source or explicit human clarification; until then label it unconfirmed. Never access private feeds to investigate course requirements.

## Required inputs

- Requested decision/artifact, affected requirement/acceptance IDs, and approved scope.
- Current status/evidence paths, blockers, dependencies, and latest authorized decisions.
- Confirmed team roster, group number, role assignments, reviewer availability, and any deadline source/timezone. Keep missing values explicitly unconfirmed; do not manufacture names, assignments, or dates.
- Authorization boundary: drafting, repository changes, external sharing, spending, and submission are separate actions.

## Responsibilities and non-goals

Own schedule/dependencies, standups, SDP/SPMP, EARS requirements, acceptance traceability, risk/change/decision records, and escalation. Translate work into independently reviewable role deliverables rather than assuming four full-time developers. Developer owns technical integration; UI Designer owns flows/usability; QA owns test/security evidence and final-report coordination.

Do not redefine technical truth, waive a failed gate without an approved scope/criterion change, perform tests by proxy, spend money, register services, assign usernames to roles, or submit anything to Canvas. All members participate in the pitch, final presentation, and oral defense; participation is not proof that every member did identical implementation work.

### PR policy and separate review obligations

[CONTRIBUTING.md](../../CONTRIBUTING.md) is canonical for branch ownership, synchronization, CI, and merge procedure. Require **zero PR approvals**: authors may self-review and squash-merge after `Quality gate` succeeds on the latest commit, current `main` is integrated, the diff is conflict-free, and conversations are resolved. GitHub does not allow self-approval; do not assign an author to approve their own PR. Technical peer review is optional, while required verification and the course-artifact non-author reviews below remain separate obligations. A merged PR is not proof of course or release acceptance.

Record the repository as public with enforced `main` protection, including for administrators: PRs, successful required `Quality gate` checks against up-to-date `main`, resolved conversations, and linear history are required; force pushes to and deletion of `main` are blocked. Required approvals remain zero. Anyone may read, fork, and propose a PR; only authorized writers may push repository branches or merge eligible PRs. Public source is not application deployment or permission to share private contributor/user data. Keep planning artifacts sanitized and use the contributor guide as the canonical policy.

## Recorded course-deliverable map

Use this role-based coordination map derived from plan sections 11 and 14; confirm individual assignments separately. Reviewers of these course artifacts must be non-authors. If roles share a person, obtain another qualified reviewer instead of counting self-review. This course-evidence review, including the recorded code-review artifact, does not require GitHub PR approval or a non-author review on every PR.

| Recorded deliverable           | Expected artifact/content                                                                                                                                                 | Accountable role                                                              | Non-author review role                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Proposal                       | 1–2 pages: title, vision, competitive analysis, approach, AI use, one serious delivery risk; planned `docs/proposal/Action_Inbox_Group_N.pdf` after group number is known | PM, with Developer technical input                                            | UI Designer and QA                                                                      |
| Team pitch                     | At most 3 slides, 2–3 minutes, including a diagram; planned `docs/proposal/Action_Inbox_Group_N_slides.pdf`; all members participate                                      | PM coordinates; UI Designer supports presentation                             | Developer and QA                                                                        |
| SDP/SPMP                       | Scope, work breakdown, schedule, roles, risks, change control, communication, quality gates, seeded from proposal                                                         | PM                                                                            | Developer and QA                                                                        |
| Requirements/specification     | EARS requirements, use cases, acceptance criteria, traceability matrix                                                                                                    | PM                                                                            | UI Designer and QA; Developer checks feasibility                                        |
| Design/architecture            | Context/container diagrams, data model, API contract, threat model; linked user flows                                                                                     | Developer; UI Designer owns interaction design; QA owns threat-model evidence | PM checks requirement coverage; QA reviews architecture, Developer reviews threat model |
| ADRs                           | Stack, OAuth/scopes, retention, structured AI extraction, synchronization/idempotency                                                                                     | Developer                                                                     | QA; PM reviews scope consequences                                                       |
| Code review                    | Review checklist, findings, resolutions for integration/release candidate                                                                                                 | Developer coordinates                                                         | QA and a qualified non-author technical reviewer                                        |
| QA/testing plan                | Test levels, fixtures, evaluation metrics, incident categories, sequence, release criteria                                                                                | QA; UI Designer supplies usability/evaluation cases                           | Developer and PM                                                                        |
| Security/resilience            | Threat model, SAST/dependency evidence, failures/retries, data deletion                                                                                                   | QA; Developer resolves technical findings                                     | Developer reviews QA artifacts; QA/non-author reviews fixes                             |
| Project management             | Weekly individual/AI-use evidence, risk/change/decision logs                                                                                                              | PM; each role supplies its own evidence                                       | Non-author team member                                                                  |
| Final report/demo/oral defense | Implemented scope, evidence, limits, metrics, demo script, architecture decisions                                                                                         | QA coordinates report; PM coordinates readiness; all roles contribute/defend  | Cross-role non-author review                                                            |

These are recorded constraints and planned outputs, not newly verified course instructions or completed artifacts. The proposal's recorded single serious risk is real Google OAuth/Gmail access; reconcile its current status with later evidence without pretending one user's success eliminates the all-user/deployment risk. Do not invent a group number for the filenames.

## Workflow

### 1. Establish an evidence-based baseline

Classify each item as planned, in progress, blocked, implemented, verified in a named environment, user-reported, or accepted by the designated reviewer. Keep implementation status separate from acceptance. Read later evidence before repeating historical blockers, and record conflicts rather than silently replacing facts.

Use only sourced dates: record the source path/version, original timestamp, timezone, conversion assumptions, and verification status. A checkpoint in the execution plan is a recorded planning fact, not fresh proof of a current Canvas deadline. Do not create new due dates or present an assumption as a course mandate.

### 2. Maintain requirement-to-evidence traceability

For each requested behavior, write/reuse an EARS requirement, user value, scope, and observable acceptance criterion. Reuse existing AC-01–AC-14 and P2 requirement IDs instead of creating a competing numbering scheme. For each P0 requirement, record at least one test and final-report section; a future report section is marked planned until present/reviewed.

```text
Requirement ID / source / user value:
Scope and EARS statement:
Acceptance ID and observable pass condition:
Design / ADR / implementation paths:
Test case or command / fixture version / environment:
Evidence path / result / timestamp / revision / evidence type:
Final-report section or planned destination:
Accountable role / reviewer / status / blocker / next action:
```

A test count, screenshot, or component demo is not blanket acceptance. AC-10 requires the versioned 50-message evaluation with at least 90% action-required recall, at least 90% explicit-deadline precision, and documented misses; a one-case website experiment cannot satisfy it. AC-13 requires measured interactivity within 2 seconds after API data is available with 100 synchronized messages in the designated demo browser; pagination coverage does not satisfy it.

### 3. Keep scope and dependencies explicit

Separate P0, P1, approved Phase 2, and deferred work. A requested change enters P0 only under the execution plan's change-control rule: instructor-required, replaces comparable effort, or protects an invariant. Record the request/source, rationale, affected criteria/artifacts, alternatives, role owner/reviewer, dependency/schedule impact, decision authority, and actual approval. Approval of a roadmap is not approval of spending, credentials, provider writes, or changed acceptance.

Give each work item an input, deliverable, acceptance evidence, responsible role, verification owner, and unblock condition. Assign a non-author reviewer where course-artifact review is required; identify technical PR peer review as optional. Escalate the exact missing prerequisite; do not schedule fake integration work around a missing provider capability. No-owner/unconfirmed assignments remain visible rather than being attributed to a username.

### 4. Collect weekly individual and AI-use evidence

Collect one entry per member's actual work. PM consolidates but does not invent contributions or retroactively claim human review. Preserve useful evidence links without private content.

```text
Week / contributor (confirmed identity) / confirmed role:
Completed work and linked artifact/change:
Requirement or acceptance contribution / observed result:
Review received or performed / findings and corrections:
Blockers / decisions needed / next acceptance target:
AI tool/model if known / task / generated or suggested material:
Human review performed / tests actually run / corrections or rejected output:
Remaining unverified claims / reviewer:
```

Record “not used” for AI when true and “not run” for absent checks. Never report an AI-generated assertion as test evidence. Each role's weekly evidence follows plan section 11: working increment for Developer, plan/decisions for PM, design/evaluated cases for UI Designer, and tests/defects/security/documentation deltas for QA.

### 5. Track current open gates without inflating progress

Reconcile this starting list with the newest recorded evidence at each handover:

- **Google/provider and deployment acceptance:** one user's real sign-in/import is reported, not all four approved users, deployed callback/HTTPS acceptance, real-provider retry/idempotency, or designated-device rehearsal.
- **AI/AC-10:** API extraction remains disabled locally; approved paid-model configuration/run and measured accuracy are outstanding. The website experiment is neither backend integration nor schema/accuracy acceptance.
- **Reminder/AC-09:** metadata is not delivery. An approved delivery mechanism/replacement criterion and observed outcomes, including browser-closed limitations, remain unresolved. Optional SMS/email requires separate consent, configuration, and cost decisions.
- **Phase 2 connectors:** the approved Canvas Calendar Feed increment has recorded synthetic evidence and user-reported real import; it is not full Canvas OAuth or Outlook integration, completion tracking, background polling, or notification delivery.
- **Performance/security/course release:** measured AC-13, independent security/deployment review, required revocation/deletion/provider rehearsals, final report traceability, and team/non-author review remain gates unless newer explicit evidence closes them.
- **Team/artifact readiness:** confirmed member/group/role/device details and proposal/pitch readiness must be established from evidence, not presumed complete from implementation progress.

Use the plan's release conditions: all P0 evidence, no open S0/S1/S2 defects, three duplicate-free Gmail syncs and Calendar retries, measured AC-10, exercised revocation/deletion, an actual end-to-end demonstration with reminders explicitly resolved, and truthful final documents. Do not rewrite an open gate as passed because a related local suite passed.

### 6. Review and hand off

Check course-artifact constraints against the recorded map, route required course reviews to a non-author, and capture findings/resolutions separately from optional technical PR peer review and required verification. Prepare proposal/pitch/report for human review, not submission. Canvas submission/posting/messaging remains a separate action requiring explicit confirmation for that specific action; this skill does not authorize it.

```text
PM handoff
Objective / approved scope / decision authority:
Source paths and authority (recorded plan vs newly authorized evidence):
Changed artifacts / requirement and acceptance IDs:
Deliverable: owner role | course reviewer if required | status | evidence | remaining gate
Traceability and final-report coverage:
Decisions / risk changes / dependency and schedule effects:
Dates: source, timezone, assumptions, verification status (or unconfirmed)
Individual contributions / AI-use evidence / human review:
Checks actually observed / not run:
PR / latest commit / main integration / author self-review / Quality gate / conflicts / conversations:
Optional technical peer review status (not a merge gate):
Required course-artifact non-author review status (or not applicable):
Open gates and exact prerequisites:
Next agent or role / first reads / concrete next action:
External actions requiring separate confirmation:
```

## Done and safety criteria

- Every scoped course deliverable has a role owner, non-author reviewer, artifact destination, status, and traceable evidence or explicit missing prerequisite.
- Requirements connect acceptance, implementation/design, tests, and final-report coverage; planned work is not counted as observed acceptance.
- Weekly individual and AI-use evidence records real contributions, review, corrections, and unverified claims.
- Proposal/pitch constraints are attributed to the recorded plan; no invented due date, group number, named role assignment, or fresh Canvas verification appears.
- Open release gates and the next executable handover action remain explicit; document readiness is not overall product release readiness.
- No credentials, private feeds/messages, personal browser history, or paid/external action is used to fill an evidence gap. Leave the existing 5173/3000/55432 environment untouched. Run checks only when explicitly assigned and through the contributor guide's isolated process; otherwise report them as not run.
