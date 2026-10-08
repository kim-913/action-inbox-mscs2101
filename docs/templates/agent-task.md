# Task and agent handoff template

Use this structure in a sanitized GitHub issue, PR, or agent prompt. Replace the bracketed fields with actual task facts; remove irrelevant sections. This is a reusable template, not a completed task record. Private machine/session notes belong in ignored `.handoff/`, not this directory.

## Assignment

- **Primary role / Skill:** [Developer, UI Designer, QA, or PM; path to `skills/<role>/SKILL.md`]
- **Task / requirement ID:** [ID and source link; identify course requirement versus team decision]
- **Outcome:** [one observable result]
- **Owner / non-author reviewer:** [confirmed people; do not infer roles from GitHub access]
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
3. [Exercise the acceptance path; define expected output before running.]
4. [Obtain the required cross-role review and update documentation.]

## Completion report

- **Delivered:** [changed behavior/artifact and exact files]
- **Evidence:**

  | Criterion | Command or scenario       | Environment / revision     | Observed result                            | Sanitized evidence link |
  | --------- | ------------------------- | -------------------------- | ------------------------------------------ | ----------------------- |
  | [AC ID]   | [actual command or steps] | [actual environment / SHA] | [pass/fail/skip/blocked, with observation] | [path/link]             |

- **Not verified:** [skips, unavailable approvals, real-provider gaps, unresolved criteria]
- **Review:** [reviewer, findings, resolutions; pending if not performed]
- **Operational effects:** [migration/config/deployment effects; explicitly say none if none]
- **Cleanup:** [owned temporary services/files stopped/removed or intentionally retained]
- **Next action:** [one concrete step, owner, and any missing prerequisite]

Never include OAuth tokens, private feed URLs, raw user data, local credentials, or private screenshots. Never convert a planned command into a claimed successful run.
