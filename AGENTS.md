# Agent entry point

## Read in this order

1. [README.md](README.md) — current product status and limitations.
2. [CONTRIBUTING.md](CONTRIBUTING.md) — role map, local setup, development/review, verification, course evidence, and safety.
3. The applicable role Skill:
   - [Developer](skills/developer/SKILL.md)
   - [UI Designer](skills/ui-designer/SKILL.md)
   - [QA](skills/qa/SKILL.md)
   - [PM](skills/pm/SKILL.md)
4. [EXECUTION_PLAN.md](EXECUTION_PLAN.md) and the specific contract/evidence files relevant to the task. Do not open the entire repository by default.

These repository-local Skills are Markdown instructions, not a guarantee of tool-specific automatic installation. If you cover multiple roles, name the primary role and the review role. Roles do not assign GitHub permissions or authorize external actions.

## Work contract

- Follow the current user's scope. Identify acceptance criteria, file ownership, dependencies, and verification before editing. Use [the task/handoff template](docs/templates/agent-task.md).
- Keep all contributor-facing guides, Skills, templates, and agent instructions in English.
- Follow [CONTRIBUTING.md section 4](CONTRIBUTING.md#4-implement-review-and-prove-a-change), the canonical Git workflow: short-lived `feature/*`, `fix/*`, `docs/*`, or `chore/*` branches; one coherent PR to `main`; no direct pushes or force-pushes to `main`, and no rewriting shared branches. Synchronize with `git fetch origin` and `git merge origin/main`; coordinate conflict resolutions with affected owners.
- Code merges require zero approvals. Authors with repository write permission may self-review and squash-merge after resolving conversations and observing `CI` / `Quality gate` success on the latest PR commit integrated with current `main`, then delete the branch. Re-synchronize and obtain a fresh run if either branch changes. Independent non-author course-document review remains separate from the merge gate.
- CI uses Node.js 22/npm 11, `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, full `npm test` with disposable PostgreSQL 16 via `TEST_DATABASE_URL` (no database skips), and an isolated web production build; use the canonical guide's commands. Do not claim CI replaces changed-path evidence.
- `Quality gate` includes `scripts/security-gate.py`: pinned Semgrep 1.186.0/seven local rules, checksum-pinned Gitleaks 8.30.1, zero-vulnerability npm audit at all severities, positive controls and fail-closed scanner/report handling. Parse errors fail closed. Review the two exact public-prose dispositions in `docs/security/local-review.md`; they expire 2026-12-31.
- The owner authorized public source visibility. Classic `main` protection is enforced, including for administrators: PRs, the GitHub Actions `Quality gate` check, strict up-to-date branches, resolved conversations, and linear history are required; force pushes and deletion are disabled. Required approvals are zero, with no code-owner or last-push approval gate. Repository settings allow squash merges only and automatically delete merged branches. Anyone can read, clone, fork, and propose PRs; only authorized writers can push repository branches or merge. Public source access does not authorize app deployment, user-data access, or real-account testing.
- Implement the complete changed path using existing conventions. Preserve source-native date semantics, ownership isolation, consent/CSRF, encrypted credentials, atomic persistence, and last-success behavior.
- Do not edit applied migrations or invent provider responses in production. No compatibility shims, enabled-looking unimplemented controls, or unsupported completion/delivery claims.
- November 22 delegated finalization scope: AC-09 is persistent create/edit/cancel reminder metadata for owned approved/manual tasks, visibly no delivery, matching SRS v2.0 FR17 and the submitted STP. Notification delivery is outside this release; retain future permission/cost/evidence boundaries.
- Calendar upcoming reads bind the original connection ID before network work and under the user-row lock for success and failure persistence. Stale lifecycle work returns 401 `GOOGLE_RECONNECT_REQUIRED`, mutating neither snapshot nor error; never hold DB locks over provider network work. Explicit GCM tag length is 16 bytes, with the encrypted envelope unchanged.
- For parallel work, assign non-overlapping files and one integration owner. Integrate first, then run shared checks centrally; agents must disclose exactly what they did and did not verify.
- Significant behavior changes require actual UI/API smoke evidence, not just a build or unit tests. Use disposable environments and sanitized fixtures. Database skips, synthetic providers, and historical/user-reported results must be labelled accurately.
- Update the relevant existing documentation after a permanent change. Stage only owned files. No history rewriting, automatic deployment, or unrequested scope expansion.

## Hard environment boundaries

- Preserve the owner's live preview on web 5173 / API 3000 / database 55432. Do not reset its database, inspect private content, replace its encryption key, restart its services, or overwrite `apps/web/dist` during development.
- Use the contributor synthetic environment on 5174 / 3002 / 55433 and a separate browser profile. Cookies are not port-isolated. Before starting a process, ensure you own its port/container.
- Keep `OPENAI_ENABLED=false` unless paid usage is explicitly approved. The explicit synthetic harness is not a real-provider implementation or acceptance result.
- Synthetic browser entry is `http://127.0.0.1:3002/__smoke/start`, in a separate profile, using real synthetic OAuth state/callback handling before redirect to 5174; production auth guards stay unchanged. Optional `SMOKE_MESSAGE_COUNT=100` supports performance; default is six delayed messages. Harness dates are current-relative, committed fixtures static. Follow CONTRIBUTING for production-build rehearsal and smoke-only reset; preserve the test database.
- Current evidence, screenshots and timings belong in `docs/testing/p0-evidence.md`. Do not freeze interim test counts or convert synthetic evidence into real-model, four-user, HTTPS, non-developer or independent course-review acceptance. No migrations change this round and source changes are not claimed deployed.
- Never read or expose secrets just to understand setup. `.env`, private local config/logs, provider tokens/feed URLs, browser profiles, and real message/assignment content are not documentation inputs.
- Machine-specific session handoffs remain ignored under `.handoff/`. Do not commit them or `NEXT_SESSION*`; use sanitized tracked docs/issues/PRs for team knowledge.
- Do not scrape authenticated provider pages, repurpose browser credentials, submit to Canvas, send notifications, create external calendar events, or incur costs without the applicable explicit authorization.

## Handoff output

Report the changed files and behavior, observed checks with environment/revision, remaining acceptance gaps, and the next concrete action. Distinguish observed facts from assumptions. Never call a blocked, skipped, synthetic, or unimplemented path complete.
