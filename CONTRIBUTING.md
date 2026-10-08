# Contributor guide

Start here to work on Action Inbox as a teammate or coding agent. The repository is public with the owner's explicit approval: [kim-913/action-inbox-mscs2101](https://github.com/kim-913/action-inbox-mscs2101). Anyone can read, clone, fork, and propose PRs; only authorized writers can push repository branches or merge. Public source access does **not** grant access to app user data, Google test-user access, Canvas access, permission to spend money, or permission to deploy.

## 1. Pick your role

Roles are responsibilities, not confirmed assignments to GitHub usernames. One person can cover multiple roles. Code PRs require **zero approvals**: authors may self-review and self-merge after the gates below. Independent course-artifact review remains a separate evidence requirement.

| Role                               | Owns                                                          | First artifact                                        | Reusable agent instructions                      |
| ---------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Developer / Technical Lead         | Implementation, contracts, migrations, integration            | Working change + behavioral evidence                  | [Developer Skill](skills/developer/SKILL.md)     |
| UI Designer / Evaluation Lead      | Flows, interface states, accessibility, usability             | Annotated flow/design + observed review               | [UI Designer Skill](skills/ui-designer/SKILL.md) |
| QA / Security / Documentation Lead | Test plan, defects, security checks, acceptance evidence      | Reproducible test/defect report                       | [QA Skill](skills/qa/SKILL.md)                   |
| PM / Requirements Lead             | Scope, schedule, requirements, traceability, course artifacts | Acceptance criteria + owner/reviewer + evidence links | [PM Skill](skills/pm/SKILL.md)                   |

For an agent: read [AGENTS.md](AGENTS.md), then the selected `SKILL.md`. These files are portable instructions; automatic skill discovery varies by agent. Explicitly supply the file path rather than assuming it is installed globally.

## 2. Understand what exists

Read [README](README.md) for product status and [EXECUTION_PLAN](EXECUTION_PLAN.md) for requirements, acceptance criteria, team responsibilities, and recorded course needs.

- Working boundaries include Google login/Gmail import, an internal planner, app-owned tasks, and read-only Sofia Canvas calendar subscriptions.
- Canvas is **not** full Canvas OAuth, grade/submission access, or reliable assignment completion tracking. Feed disappearance does not mean completion.
- Reminder metadata is **not** delivered notifications. Paid extraction is disabled by default.
- A shared account-persisted 7-day / 30-day / custom (1–365) display window and Planner source filters are implemented; see [README](README.md#shared-display-window-and-source-views). Outlook/full Canvas OAuth remain unimplemented.
- Historical test results are evidence for their recorded revision, not proof that your branch passes today.

| Work area                                       | Source of truth                                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React UI, planner, date display, API client     | `apps/web/src/`                                                                                                                                           |
| API lifecycle/configuration                     | `services/api/src/server.ts`, `app.ts`, `config.ts`                                                                                                       |
| Google identity and sessions                    | `services/api/src/auth/`                                                                                                                                  |
| Gmail import and extraction                     | `services/api/src/pipeline/`                                                                                                                              |
| Canvas feed parsing, transport, persistence     | `services/api/src/canvas/`                                                                                                                                |
| Tasks, Calendar, reminders, account deletion    | `services/api/src/domain/`                                                                                                                                |
| Shared display preferences and range filtering  | `packages/contracts/src/display.ts`, `services/api/src/domain/display.ts`, `services/api/src/domain/display-window.ts`, `apps/web/src/display-window.tsx` |
| Shared runtime schemas                          | `packages/contracts/src/`                                                                                                                                 |
| Database schema and checksum-tracked migrations | `services/api/src/db/`, `database/migrations/`                                                                                                            |
| API and deployment contracts                    | [API contract](docs/architecture/api-contract.md), [deployment](docs/architecture/deployment.md)                                                          |
| Sanitized fixtures and recorded evidence        | `test-data/`, `docs/testing/`                                                                                                                             |

## 3. Local setup: choose a mode

Use Node.js **22.12+**, npm **11+**, Git, and a current browser. Docker with PostgreSQL 16 is needed for the authenticated synthetic workspace and database tests. Commands below use a POSIX shell, from the repository root unless stated otherwise; on Windows use WSL2.

No invitation or GitHub authentication is required to clone the public repository:

```bash
git clone https://github.com/kim-913/action-inbox-mscs2101.git
cd action-inbox-mscs2101
npm ci
```

In an existing checkout, do not overwrite `.env`, `apps/web/.env`, or encryption keys. On the owner's workstation, ports **3000 / 5173 / 55432**, container `action-inbox-postgres`, and volume `action-inbox-postgres-data` belong to the persistent user preview. Do not stop, reset, or reuse them. Do not build over `apps/web/dist`.

### Mode A — authenticated synthetic workspace (recommended)

For UI, QA, and most integration work, use the existing explicit local-provider harness. No real Google/Canvas credentials, mailboxes, or paid AI are required. This is a test environment, not a real-provider acceptance result.

Check that ports **55433 / 3002 / 5174** and the container name below are unused. If occupied, identify the owner; do not kill unrelated processes. The harness fixes its API/web ports at 3002/5174.

Create a disposable database container. The password below is deliberately public and only for this loopback-bound disposable environment:

```bash
docker run --name action-inbox-contributor-db \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=local-only \
  -e POSTGRES_DB=action_inbox_smoke \
  -p 127.0.0.1:55433:5432 -d postgres:16
```

Wait until this command reports `accepting connections` before proceeding:

```bash
docker exec action-inbox-contributor-db pg_isready -U postgres -d action_inbox_smoke
```

Create a separate test-suite database once, on this new container only:

```bash
docker exec action-inbox-contributor-db createdb -U postgres action_inbox_test
```

Terminal 1 — synthetic API, migrations, and providers:

```bash
TEST_DATABASE_URL=postgresql://postgres:local-only@127.0.0.1:55433/action_inbox_smoke \
  npm run smoke:local-providers
```

Terminal 2 — development UI with HMR, isolated from the stable preview:

```bash
VITE_API_URL=http://127.0.0.1:3002 \
  npm run dev --workspace @action-inbox/web -- --host 127.0.0.1 --port 5174 --strictPort
```

Open **http://127.0.0.1:5174** in a **separate browser profile**, not the owner's signed-in profile. Cookies are not isolated by port. The normal sign-in button deliberately rejects loopback provider authorization URLs; do not weaken that production guard. For this synthetic harness only, open Developer Tools on 5174 and execute this explicit session/bootstrap flow:

```javascript
const api = "http://127.0.0.1:3002";
const sessionResponse = await fetch(`${api}/v1/auth/session`, {
  credentials: "include",
});
if (!sessionResponse.ok) throw new Error("Session bootstrap failed");
const session = await sessionResponse.json();
const startResponse = await fetch(`${api}/v1/auth/google/start`, {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-CSRF-Token": session.csrfToken,
  },
  body: "{}",
});
if (!startResponse.ok) throw new Error("Synthetic sign-in failed");
const start = await startResponse.json();
const destination = new URL(start.authorizationUrl);
if (destination.protocol !== "http:" || destination.hostname !== "127.0.0.1") {
  throw new Error("Expected the isolated loopback test provider");
}
location.assign(destination.href);
```

Expected: the local synthetic OAuth callback returns to 5174, signs in as the fixture account, and imports six delayed synthetic messages. Extraction is disabled; an extraction-unavailable message is expected, not a reason to enable a real model. If proposal/extraction interactions are needed, restart **only this harness** with `SMOKE_EXTRACTION=synthetic` added to its command. This uses a loopback synthetic HTTP provider, not OpenAI.

For Canvas interactions, use the non-secret fixture input `https://sofia.instructure.com/feeds/calendars/user_synthetic.ics` **only in this harness**. The injected reader returns repository fixtures; this URL is not a live subscription. To exercise snapshot changes/outage, the harness alone provides:

```bash
curl -fsS -X POST http://127.0.0.1:3002/__smoke/canvas-mode \
  -H 'Content-Type: application/json' -d '{"mode":"changed"}'
```

Choose `original`, `changed`, or `unavailable`, then click Canvas Refresh. These routes do not exist in production. Fixture dates are fixed: choose a display window that includes them before navigating the planner. A range with no matching fixture dates is correctly empty. The setting changes display, not the provider import window.

Restarting the harness generates a new encryption key. Use disposable fixture data only; clear this isolated browser profile and recreate your disposable environment if you need a clean session. Never copy real tokens into this database.

### Mode B — production-path API with your own approved providers

Use this only when a task requires real-provider behavior. Coordinate test-account approval and credentials with the owner privately. [Deployment configuration](docs/architecture/deployment.md) and [connector prerequisites](docs/testing/connector-prerequisites.md) are authoritative.

In a **fresh checkout without an existing `.env`**, copy `.env.example` to `.env`. Configure your own development database (not `action_inbox_test`, `action_inbox_smoke`, or the persistent user database), `API_PORT`, exact `WEB_ORIGIN`, and approved OAuth callback. Set the matching `VITE_API_URL` in the web shell or `apps/web/.env`; root `.env` does not configure Vite. Keep `OPENAI_ENABLED=false`.

```bash
npm run db:migrate
npm run dev:api
```

Run `npm run dev:web` in another terminal with your matching host/port and exported `VITE_API_URL`. Google requires a **Web application** OAuth client, exact registered callback, approved consent test account, `GOOGLE_ALLOWED_EMAILS`, and a private 32-byte base64 encryption key. Missing prerequisites are blockers, not permission to fake login or borrow browser tokens. Only generate a key for a new database; never replace one protecting existing credentials.

Without database configuration the API can provide health only; `/v1/health` success does not prove authenticated features, migrations, or provider readiness. Canvas connection additionally requires a signed-in user and a genuine private Calendar Feed submitted through the app, never through chat or a ticket.

## 4. Implement, review, and prove a change

1. Record the requirement, acceptance criteria, scope exclusions, owner, and evidence source. Coordinate overlapping work and designate one integration owner before concurrent edits; UI/QA add states and failure cases where relevant.
2. Start a short-lived `feature/*`, `fix/*`, `docs/*`, or `chore/*` branch from current `origin/main`, with a clean working tree:

   ```bash
   git fetch origin
   git switch -c feature/shared-date-window origin/main
   ```

3. Read the relevant contracts and role Skill. Implement one coherent PR with its tests and documentation. Add new migrations rather than editing applied migrations; stage only owned files. Do not push directly to `main`, force-push `main`, or rewrite shared branches.
4. Before opening the PR and again whenever `main` advances, synchronize on your working branch without rebasing shared history:

   ```bash
   git fetch origin
   git merge origin/main
   ```

   Resolve conflicts with affected owners, inspect the entire resulting diff, and commit the resolution. Never discard another contributor's change merely to make a merge succeed. Integrate parallel work before running shared checks centrally.

5. Run the shared gates below and exercise the changed UI/API path where applicable. Authorized writers push their branch, for example `git push -u origin feature/shared-date-window`, then open a PR **to `main`** with acceptance/evidence links, scope/limitations, migration/config impacts, and a safe deployment/rollback note. Contributors without write permission push to their own fork and propose a PR to this repository's `main`; keep `origin` pointing to the canonical repository for the fetch/merge workflow above and use a separately named fork remote for pushes.
6. Self-review the final diff and resolve all PR conversations. No non-author approval is required; GitHub does not let authors approve their own PR, and a self-review does not require an approval event. Optional teammate review and independent course evidence do not create an approval gate.
7. Immediately before merging, confirm that the PR includes current `main`, has no conflicts, and the `CI` workflow's **`Quality gate`** check succeeded for the latest PR commit and current integration with `main`. If either branch changes, synchronize as needed and wait for a fresh successful run; an old green run is insufficient. Do not merge failed, skipped, cancelled, or pending gates.
8. An author with repository write permission may **squash-merge** their own PR, then delete the merged branch. Otherwise an authorized writer merges it after the same gates. Use squash only; do not use merge-commit or rebase merging. Source publication is not deployment or permission to submit to Canvas.

### Enforcement status

On 2026-10-08, the owner explicitly authorized public visibility and GitHub accepted classic branch protection for `main`. Protection requires a PR, the **`Quality gate`** status check from GitHub Actions (app ID `15368`), strict up-to-date branches, resolved conversations, and linear history. Enforcement includes administrators; force pushes and deletion of `main` are disabled. Required approvals are **zero**, with neither code-owner approval nor last-push approval required. Authors with write permission may self-review and self-merge once these gates pass; public visibility does not grant write or merge permission.

GitHub repository settings are configured for squash-only merging, automatic deletion of merged branches, and the update-branch option; merge-commit and rebase merging are disabled. Actions is enabled. These settings complement the enforced `main` protection. Public source publication is authorized; a paid upgrade, app deployment, access to private user data, and real-account testing are not authorized by that decision.

### Shared quality gates

The workflow at [`.github/workflows/ci.yml`](.github/workflows/ci.yml) is named `CI`, with stable job/check name `Quality gate`. It runs on pull requests, pushes to `main`, and manual dispatch using Node.js 22, npm 11, and disposable PostgreSQL 16. It performs dependency installation, typechecking, linting, formatting checks, the full test suite with `TEST_DATABASE_URL`, and an isolated web production build. It does not use real secrets/providers, deploy, or replace changed-path acceptance evidence.

Local equivalent, using only the disposable test-suite database created in section 3:

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
TEST_DATABASE_URL=postgresql://postgres:local-only@127.0.0.1:55433/action_inbox_test npm test
VITE_API_URL=http://127.0.0.1:3002 npm run build --workspace @action-inbox/web -- --outDir ../../.local-preview/ci-dist
```

Without `TEST_DATABASE_URL`, database tests skip; label that run accordingly and do not count it as the full merge gate. CI must run database suites without skips. Never point tests at the browser-fixture or user database. For a focused suite, use its workspace, for example:

```bash
npm run test --workspace @action-inbox/web -- src/CanvasFeed.test.tsx
```

For a production-build UI rehearsal, stop only your 5174 development server, then:

```bash
VITE_API_URL=http://127.0.0.1:3002 npm run build --workspace @action-inbox/web -- --outDir ../../.local-preview/smoke-dist
npm run preview --workspace @action-inbox/web -- --outDir ../../.local-preview/smoke-dist --host 127.0.0.1 --port 5174 --strictPort
```

Observe the changed path in the browser and record viewport, steps, expected/actual result, revision, and evidence. Use synthetic screenshots only. A build or test pass alone does not establish browser usability, real Google/Canvas acceptance, or model accuracy. For docs-only work, verify links, commands changed by the guide, and formatting rather than claiming an unrelated full regression run.

## 5. Course deliverables and team evidence

The course needs below come from the **previously recorded Canvas/syllabus observations in [EXECUTION_PLAN section 14](EXECUTION_PLAN.md#14-course-deliverables-and-traceability)**. They are not newly scraped or independently revalidated requirements. PM must confirm the current Canvas rubric, due dates, group number, and submission format before delivery; do not infer deadlines from fixtures or old milestones.

Course documents still need independent non-author review, and the recorded code-review deliverable needs findings/resolutions as evidence. These are course-artifact completion requirements, not required GitHub approvals or a ban on author self-merge.

| Recorded course need                                                          | Lead / reviewer                  | Artifact and completion evidence                                                         |
| ----------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| 1–2 page proposal: title, vision, competition, approach, AI use, serious risk | PM / Developer                   | Reviewed PDF; planned naming in the execution plan, not an existing submitted file       |
| Up to 3 slides, 2–3 minute pitch, including a diagram                         | PM + UI / QA                     | Reviewed slides and timed rehearsal; all members participate                             |
| SDP/SPMP                                                                      | PM / Developer                   | Scope, WBS, schedule, roles, risk/change/communication/quality plan                      |
| Requirements/specification                                                    | PM / QA                          | EARS requirements, use cases, acceptance criteria, traceability                          |
| Architecture, design, ADRs                                                    | Developer + UI / QA              | Diagrams, data model, API contract, threat model, decision rationale                     |
| Code review                                                                   | Developer / non-author           | PR findings and resolutions, not merely a merge                                          |
| QA plan and security/resilience                                               | QA / Developer                   | Test levels, sanitized fixtures, metrics, severity, retry/deletion/security evidence     |
| Weekly project management                                                     | PM / all members                 | Individual work, blockers, risk/decision changes, AI tool use and human review           |
| Final report, demo, oral defense                                              | All; PM coordinates / non-author | Implemented scope, measured evidence, limitations, demo rehearsal, explainable decisions |

A planned document is not a completed deliverable. Keep requirement → implementation/design → test/evidence → course artifact links. See the [PM Skill](skills/pm/SKILL.md) for the working traceability format. Canvas submission requires separate explicit confirmation.

## 6. Handoff and safety

Use the [handoff template](docs/templates/agent-task.md) for an issue/PR or an agent prompt. A handoff must state the role, target, acceptance, allowed files, environment, observed checks, blockers, and next action. Do not paste an entire private session history.

- Sanitized task/review evidence belongs in public issues, PRs, or normal tracked docs. Machine-specific session notes belong in ignored `.handoff/`; never commit handoff notes, `NEXT_SESSION*`, credentials, private feed URLs, user content, browser profiles, or local logs.
- Do not use the owner's personal account for development/QA or record personal names, email addresses, or machine-specific usernames/paths in shared evidence. CI and the local smoke harness use synthetic provider accounts. Real-provider acceptance requires a separately authorized designated test account.
- Before committing, set repository-local Git authorship to your chosen GitHub username and your own GitHub-provided noreply email; do not inherit a personal email from global Git configuration. These settings affect future commits only. Removing an identifier from a new commit does not remove historical copies, PR references, or existing clones; historical cleanup requires an explicitly coordinated plan.
- Do not enable paid AI/SMS, scrape authenticated provider pages, create provider tokens, send notifications, write external calendars, or deploy without the specific required authorization.
- Preserve last-success data and truthful error states. Never claim skipped checks, synthetic providers, metadata-only reminders, or user-reported success as stronger evidence than they are.
- Stop your own development commands with Ctrl-C. You may stop your disposable container with `docker stop action-inbox-contributor-db` and later restart it with `docker start action-inbox-contributor-db`. Do not delete storage automatically; a clean-reset decision applies only to the explicitly identified disposable environment.

## 7. Troubleshooting

| Symptom                                  | Check / action                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository clone denied                  | Use the canonical public HTTPS URL above; no invitation is needed. Check network/proxy or stale credential configuration; never share a token in chat          |
| Branch push or PR merge denied           | Authenticate with an account granted repository write permission, or push to your own fork and propose a PR. Writers must still satisfy protected `main` gates |
| Port already in use                      | Identify its owner; preserve 3000/5173/55432 and do not kill unrelated processes                                                                               |
| Database connection refused              | Check Docker and `pg_isready`; verify loopback port and database name                                                                                          |
| API health works but app does not        | Health alone is not DB/auth readiness; use the complete synthetic setup or approved provider configuration                                                     |
| UI reports missing API configuration     | Export `VITE_API_URL` before starting/building Vite; root `.env` is not the Vite environment                                                                   |
| Synthetic sign-in rejected by the button | Use the explicit loopback bootstrap above in an isolated profile; do not relax production URL checks                                                           |
| Origin/CSRF errors                       | Use exactly `127.0.0.1:5174`, not `localhost`; preserve credentials and bootstrap CSRF; do not disable protections                                             |
| No extracted proposals                   | Default extraction is disabled; choose explicit synthetic mode for harness work, not paid API activation                                                       |
| Database tests skipped                   | Supply the disposable `action_inbox_test` URL and report the actual run                                                                                        |
| Canvas assignment lacks completion state | Calendar feed limitation; do not infer completion or claim Canvas write-back                                                                                   |

## 8. Guide verification record

On 2026-10-08, the documented Mode A was exercised against application revision `9effc97` with the contributor documentation changes applied, using existing installed dependencies, a new PostgreSQL 16 container, API 3002, Vite development UI 5174, and a dedicated Chrome profile. Database readiness and creation of the separate test database succeeded. The exact JavaScript bootstrap above signed in the synthetic account; the UI reported six imported messages and zero processed with extraction disabled. The documented Canvas fixture input imported four entries; the `changed` orchestration command and manual Refresh produced three. The rendered Connections surface was inspected.

The initial root-wrapper development command did not forward Vite flags correctly; the guide now uses the directly exercised workspace command. This documentation check did not rerun fresh-clone dependency installation, the full application suite, paid extraction, real-provider acceptance, or the production-build rehearsal. It does not supersede the separately recorded feature acceptance evidence.
