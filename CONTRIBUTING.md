# Contributor guide

Start here to work on Action Inbox as a teammate or coding agent. The repository is private: [kim-913/mscs2101](https://github.com/kim-913/mscs2101). Repository access does **not** grant Google test-user access, Canvas access, permission to spend money, or permission to deploy.

## 1. Pick your role

Roles are responsibilities, not confirmed assignments to GitHub usernames. One person can cover multiple roles; a significant change still needs a non-author reviewer.

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
- Outlook/full Canvas OAuth and the requested shared 7-day / 30-day / custom display window are not implemented.
- Historical test results are evidence for their recorded revision, not proof that your branch passes today.

| Work area                                       | Source of truth                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| React UI, planner, date display, API client     | `apps/web/src/`                                                                                  |
| API lifecycle/configuration                     | `services/api/src/server.ts`, `app.ts`, `config.ts`                                              |
| Google identity and sessions                    | `services/api/src/auth/`                                                                         |
| Gmail import and extraction                     | `services/api/src/pipeline/`                                                                     |
| Canvas feed parsing, transport, persistence     | `services/api/src/canvas/`                                                                       |
| Tasks, Calendar, reminders, account deletion    | `services/api/src/domain/`                                                                       |
| Shared runtime schemas                          | `packages/contracts/src/`                                                                        |
| Database schema and checksum-tracked migrations | `services/api/src/db/`, `database/migrations/`                                                   |
| API and deployment contracts                    | [API contract](docs/architecture/api-contract.md), [deployment](docs/architecture/deployment.md) |
| Sanitized fixtures and recorded evidence        | `test-data/`, `docs/testing/`                                                                    |

## 3. Local setup: choose a mode

Use Node.js **22.12+**, npm **11+**, Git, and a current browser. Docker with PostgreSQL 16 is needed for the authenticated synthetic workspace and database tests. Commands below use a POSIX shell, from the repository root unless stated otherwise; on Windows use WSL2.

Accept the repository invitation first, then:

```bash
git clone https://github.com/kim-913/mscs2101.git
cd mscs2101
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

Choose `original`, `changed`, or `unavailable`, then click Canvas Refresh. These routes do not exist in production. Fixture dates are fixed; navigate the planner to their dates rather than assuming they are due today.

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

1. PM records the requirement, acceptance criteria, scope exclusions, owner, reviewer, and source. UI/QA add states and failure cases before implementation where relevant.
2. Create a short-lived branch, for example `git switch -c feature/shared-date-window`. Use `fix/` or `docs/` for other work. Do not rewrite shared history.
3. Read the relevant contracts and role Skill. Keep one integration owner for changes spanning UI/contracts/API/database. Coordinate file ownership before concurrent agent edits.
4. Implement the complete path. Add a new migration for schema changes; do not edit already-applied migrations. Cover meaningful behavioral boundaries, not source-text or mock-forwarding assertions.
5. Run focused checks while developing. Before review, run the shared gates below once on the integrated change and exercise the actual changed UI/API path.
6. Open a PR with acceptance/evidence links, scope/limitations, migration/config impacts, and a safe deployment/rollback note. Request the appropriate non-author reviewer; role-specific reviews follow the execution plan.
7. Merge only after observed evidence and review. This is the team's workflow, **not a claim that branch protection or CI has been configured**. Publishing source does not deploy or submit anything to Canvas.

Shared gates, using only the disposable test-suite database:

```bash
npm run typecheck
TEST_DATABASE_URL=postgresql://postgres:local-only@127.0.0.1:55433/action_inbox_test npm test
npm run lint
npm run format:check
```

Without `TEST_DATABASE_URL`, database tests skip; label the run accordingly. Never point tests at the browser-fixture or user database. For a focused suite, use its workspace, for example:

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

- Public-to-the-team task/review evidence belongs in sanitized issues, PRs, or normal tracked docs. Machine-specific session notes belong in ignored `.handoff/`; never commit handoff notes, `NEXT_SESSION*`, credentials, private feed URLs, user content, browser profiles, or local logs.
- Do not enable paid AI/SMS, scrape authenticated provider pages, create provider tokens, send notifications, write external calendars, or deploy without the specific required authorization.
- Preserve last-success data and truthful error states. Never claim skipped checks, synthetic providers, metadata-only reminders, or user-reported success as stronger evidence than they are.
- Stop your own development commands with Ctrl-C. You may stop your disposable container with `docker stop action-inbox-contributor-db` and later restart it with `docker start action-inbox-contributor-db`. Do not delete storage automatically; a clean-reset decision applies only to the explicitly identified disposable environment.

## 7. Troubleshooting

| Symptom                                  | Check / action                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Repository clone denied                  | Accept the private-repository invitation and authenticate GitHub; never share a token in chat                      |
| Port already in use                      | Identify its owner; preserve 3000/5173/55432 and do not kill unrelated processes                                   |
| Database connection refused              | Check Docker and `pg_isready`; verify loopback port and database name                                              |
| API health works but app does not        | Health alone is not DB/auth readiness; use the complete synthetic setup or approved provider configuration         |
| UI reports missing API configuration     | Export `VITE_API_URL` before starting/building Vite; root `.env` is not the Vite environment                       |
| Synthetic sign-in rejected by the button | Use the explicit loopback bootstrap above in an isolated profile; do not relax production URL checks               |
| Origin/CSRF errors                       | Use exactly `127.0.0.1:5174`, not `localhost`; preserve credentials and bootstrap CSRF; do not disable protections |
| No extracted proposals                   | Default extraction is disabled; choose explicit synthetic mode for harness work, not paid API activation           |
| Database tests skipped                   | Supply the disposable `action_inbox_test` URL and report the actual run                                            |
| Canvas assignment lacks completion state | Calendar feed limitation; do not infer completion or claim Canvas write-back                                       |

## 8. Guide verification record

On 2026-10-08, the documented Mode A was exercised against application revision `9effc97` with the contributor documentation changes applied, using existing installed dependencies, a new PostgreSQL 16 container, API 3002, Vite development UI 5174, and a dedicated Chrome profile. Database readiness and creation of the separate test database succeeded. The exact JavaScript bootstrap above signed in the synthetic account; the UI reported six imported messages and zero processed with extraction disabled. The documented Canvas fixture input imported four entries; the `changed` orchestration command and manual Refresh produced three. The rendered Connections surface was inspected.

The initial root-wrapper development command did not forward Vite flags correctly; the guide now uses the directly exercised workspace command. This documentation check did not rerun fresh-clone dependency installation, the full application suite, paid extraction, real-provider acceptance, or the production-build rehearsal. It does not supersede the separately recorded feature acceptance evidence.
