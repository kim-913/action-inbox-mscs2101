# Task and agent handoff template

Use this structure in a sanitized GitHub issue, PR, or agent prompt. Replace the bracketed fields with actual task facts; remove irrelevant sections. This is a reusable template, not a completed task record. Private machine/session notes belong in ignored `.handoff/`, not this directory.

Follow [CONTRIBUTING.md](../../CONTRIBUTING.md) for canonical setup, branch ownership, synchronization, verification, and merge instructions. PRs require **zero approvals**: the author may self-review and squash-merge after `Quality gate` succeeds on the latest commit, current `main` is integrated, the diff is conflict-free, and conversations are resolved. GitHub cannot self-approve; self-review is not an approval event. Technical peer review is optional. Required verification and any separately required non-author course-artifact review must remain explicit; neither is replaced by merging a PR.

The repository is public with enforced `main` protection, including for administrators: PRs, successful required `Quality gate` checks against up-to-date `main`, resolved conversations, and linear history are required; force pushes to and deletion of `main` are blocked. Required approvals remain zero. Anyone may read, fork, and propose a PR, but only authorized writers may push repository branches or merge eligible PRs. Public source does not deploy the application or authorize account testing or disclosure of private contributor/user data. Use the contributor guide for the canonical policy.

## Assignment

- **Primary role / Skill:** [Developer, UI Designer, QA, or PM; path to `skills/<role>/SKILL.md`]
- **Task / requirement ID:** [ID and source link; identify course requirement versus team decision]
- **Outcome:** [one observable result]
- **Owner / verification owner:** [confirmed people; do not infer roles from GitHub access]
- **Optional technical peer reviewer:** [person or not requested; not a merge gate]
- **Required course-artifact non-author reviewer:** [person and requirement, pending assignment, or not applicable]
- **Scope / non-goals:** [what changes and what explicitly does not]
- **Acceptance criteria:** [observable behavior, failure states, and evidence required]
- **Allowed files / shared interfaces:** [paths, contract changes, integration owner]
- **Dependencies / authorization:** [prerequisites and approval status; no secret values]

## Starting context

- **Repository / branch / base revision:** [URL, branch, SHA]
- **Read first:** `AGENTS.md`, `CONTRIBUTING.md`, assigned Skill, [specific contract/requirements/evidence sections]
- **Current implementation:** [facts with paths/symbols]
- **Previous observations:** [date/revision/source; label historical, user-reported, synthetic, or live]
- **Environment:** [synthetic or approved provider; owned ports, disposable database name, browser profile]
- **Constraints:** [preserve live services, no paid calls, no provider writes, no private content]

## Execution plan

1. [Resolve the task-specific uncertainty using existing source/docs.]
2. [Implement or produce the role artifact within assigned scope.]
3. [Define the acceptance path and expected output; execute only if assigned, otherwise hand off to the verification owner.]
4. [Self-review the diff, update documentation, and obtain any required course-artifact non-author review separately from optional technical peer review.]
5. [Before author self-merge, confirm latest-commit Quality gate success, current main integration, no conflicts, and resolved conversations using CONTRIBUTING.]

## Completion report

- **Delivered:** [changed behavior/artifact and exact files]
- **Evidence:**

  | Criterion | Command or scenario       | Environment / revision     | Observed result                            | Sanitized evidence link |
  | --------- | ------------------------- | -------------------------- | ------------------------------------------ | ----------------------- |
  | [AC ID]   | [actual command or steps] | [actual environment / SHA] | [pass/fail/skip/blocked, with observation] | [path/link]             |

- **Not verified:** [skips, unavailable execution authorization, real-provider gaps, unresolved criteria]
- **PR readiness:** [PR/branch/head SHA; integrated main SHA; latest-commit Quality gate link/result; conflict and conversation status; author self-review]
- **Optional technical peer review:** [not requested, pending, or reviewer/findings/resolutions; not a required approval]
- **Required course-artifact review:** [non-author reviewer, requirement, findings/resolutions; pending or not applicable]
- **Operational effects:** [migration/config/deployment effects; explicitly say none if none]
- **Cleanup:** [owned temporary services/files stopped/removed or intentionally retained]
- **Next action:** [one concrete step, owner, and any missing prerequisite]

Never include OAuth tokens, private feed URLs, raw user data, local credentials, or private screenshots. Never convert a planned command into a claimed successful run.
