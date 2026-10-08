# Action Inbox

Action Inbox is a browser-first, source-linked connected planner. Consented Gmail imports remain readable and feed an internal calendar/agenda with evidence-backed proposals when extraction is available. Proposals, approved/manual tasks, and existing external Calendar events remain distinct; an internal suggestion is not permission to create a task or external event. Reminder delivery remains pending: stored in-app due metadata is not a delivered notification.

## Contributors: start here

Read the **[Contributor guide](CONTRIBUTING.md)** for local setup, a credential-free synthetic workspace, development/review steps, course deliverables, and troubleshooting.

Choose your role: [Developer](skills/developer/SKILL.md) · [UI Designer](skills/ui-designer/SKILL.md) · [QA](skills/qa/SKILL.md) · [PM](skills/pm/SKILL.md). For agent work, start with [AGENTS.md](AGENTS.md) and the [task/handoff template](docs/templates/agent-task.md). Role assignments are separate from repository permissions.

The [canonical branch and PR workflow](CONTRIBUTING.md#4-implement-review-and-prove-a-change) requires short-lived `feature/*`, `fix/*`, `docs/*`, or `chore/*` branches and PRs to `main`, with **zero required approvals**. Authors may self-review and squash-merge once `CI` / `Quality gate` succeeds on the latest commit integrated with current `main`, conflicts are resolved, and conversations are resolved; delete merged branches. Synchronize through `git fetch origin` and `git merge origin/main`, coordinate overlapping changes, and never directly push/force-push `main` or rewrite shared branches. Independent course-document review remains a separate requirement.

**Enforcement limitation:** GitHub's private-repository protection API returned HTTP 403 requiring GitHub Pro or public visibility. Keep this repository private. The workflow is mandatory team policy, not server-enforced protection; CI cannot prevent direct pushes or merges that violate it.

Configured GitHub settings permit squash merges only, delete merged branches automatically, and enable branch updates and Actions. Those settings do not enforce the PR/CI policy; see the contributor guide's enforcement status.

## Status

The repository is hosted privately at [kim-913/mscs2101](https://github.com/kim-913/mscs2101) with the project owner's approval. Keep credentials, local data, and handoff notes out of Git; do not make the repository public without separate approval. The browser/API implementation includes cookie-based Google login, bounded durable Gmail import, source review, tasks, an internal planner, a separate read-only Sofia Canvas calendar subscription, explicit external Calendar approval, and retention controls. The user reported successful real Google sign-in/import and, after the identified-client fix, successful real Canvas import. This is not all-user provider or paid-model acceptance. Paid extraction remains disabled. See `docs/architecture/api-contract.md`, `docs/architecture/deployment.md`, `docs/testing/p0-evidence.md`, and `docs/testing/canvas-subscription-evidence.md` for observed checks and limits.

### Approved Phase 2 direction

The user approved incremental Outlook and Canvas connectors, a first-class internal calendar rather than requiring an external calendar, and optional reminders one or two days before assignments plus immediate/time-sensitive work such as flights. Broader OAuth integrations and notification delivery remain roadmap goals. The separately approved Canvas calendar-only subscription below is narrower than full course/grade/submission access. Official API setup/consent is still required for future full integrations; Canvas assignment due dates can be native data, while event times are not automatically deadlines.

Notification delivery and any SMS option need separate permission, mechanism, cost approval, and observed end-to-end delivery. No SMS provider, paid account, message send, or fake enabled control is authorized by the roadmap. Existing P0 AC-09 remains an explicit unresolved delivery criterion. See `docs/requirements/phase-2.md`, `docs/testing/connector-prerequisites.md`, and the authoritative `EXECUTION_PLAN.md`.

Next requested feature, not yet implemented: one user-configurable display window shared across all connectors/systems, with 7-day, 30-day, and custom day-count choices. Repository setup comes first; the date-window feature remains deferred. Its date direction and source-specific date semantics must be resolved before implementation; this request does not authorize deleting older stored data.

### Canvas calendar-only connection

In Canvas, open **Calendar → Calendar Feed**, then paste the private subscription link **only into this app's Connections → Canvas secure input**. Do not paste it into chat, screenshots, issue reports, or source control: the link grants read access. The app accepts only the Sofia institution's HTTPS user-calendar feed, encrypts the credential on the server, clears the input, and never returns the saved URL.

Initial connect reads the feed; later updates require **Refresh**. The planner preserves Canvas assignment due dates separately from event start/end. A date-only assignment does not reveal an exact due clock time. The feed is a limited window (typically 30 days past and 366 days ahead), not complete coursework; this app rejects imports above 1,000 items instead of silently truncating. Failed refresh retains the last successful snapshot. Grades, submissions, completion state, undated assignments, and To Do coverage are not supplied or guaranteed by this integration.

Canvas disconnect deletes this app's saved feed and imported items only; it does not revoke or change anything in Canvas. Google disconnect leaves Canvas intact; deleting the app account removes both local sources. There are no automatic external calendar writes, delivered notifications, or AI calls for Canvas dates. Full Canvas OAuth still needs institution application credentials. The user reported their real feed import working after the transport identification fix; private items were not inspected by an agent. Imported Canvas entries do not currently have a local completion control or authoritative Canvas submission/completion state; app-owned manual/approved tasks remain separately completable.

## Structure

- `apps/web` — React and Vite browser client
- `services/api` — Fastify API and integration boundary
- `packages/contracts` — runtime-validated shared API contracts
- `database/migrations` — reviewable PostgreSQL migrations
- `docs` — engineering and course evidence as it is produced
- `EXECUTION_PLAN.md` — scope, architecture, milestones, and acceptance criteria

## Prerequisites

- Node.js 22.12 or newer
- npm 11 or newer
- PostgreSQL 16 or a compatible managed PostgreSQL database for database-backed milestones
- A current browser for local web testing

## Local setup

Use the **[Contributor guide setup](CONTRIBUTING.md#3-local-setup-choose-a-mode)** as the canonical onboarding procedure. It provides an authenticated synthetic workspace without real provider credentials, separate database-test setup, and the approved real-provider path.

The owner's persistent preview uses web 5173 / API 3000 / database 55432 and serves a production build, not HMR. Do not reuse those services or overwrite `apps/web/dist`. Contributor development uses separate services, a disposable database, and an isolated browser profile. Deployment remains a separate action governed by [deployment configuration](docs/architecture/deployment.md).

The browser supports login/logout/session rotation, inbox/source evidence, edit/approve/reject, manual task creation and status updates, retained last-success error states, explicit calendar creation/upcoming events, and disconnect/delete. Create intents live only in memory and private drafts/cache are cleared when authentication ends. Reminder controls store labelled in-app due metadata only, not delivered notifications.

## Quality checks

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
TEST_DATABASE_URL=postgresql://postgres:local-only@127.0.0.1:55433/action_inbox_test npm test
VITE_API_URL=http://127.0.0.1:3002 npm run build --workspace @action-inbox/web -- --outDir ../../.local-preview/ci-dist
```

Create the disposable PostgreSQL 16 test database using [CONTRIBUTING.md](CONTRIBUTING.md) first. Without `TEST_DATABASE_URL`, database tests explicitly skip; that is not a full merge-gate pass.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) defines workflow `CI` and stable check **`Quality gate`** on pull requests, pushes to `main`, and manual dispatch. Using Node.js 22/npm 11 and disposable PostgreSQL 16, it runs the gates above including all database suites without skips and an isolated production build. No real secrets/providers or deployments are involved. If private-repository protection becomes available, require `Quality gate` while retaining zero approvals.

The versioned 50-message anonymized evaluation set is `test-data/anonymized/v1/cases.json`. `npm run evaluate -- saved-predictions.json` evaluates saved outputs offline and records provenance; it does not call a model and passing deterministic fixtures does not establish real model accuracy.

For reproducible local-only browser workflow smoke, use a separate disposable loopback `action_inbox_smoke` database (never the live preview on 55432) and run `TEST_DATABASE_URL=… npm run smoke:local-providers`. The harness API uses 3002 and expects a web app on 5174 built/configured with `VITE_API_URL=http://127.0.0.1:3002`. Extraction is disabled by default; `SMOKE_EXTRACTION=synthetic` uses only the loopback synthetic HTTP response provider. This explicit **test harness** exercises actual API/database paths and must not be used as a deployment or claimed as live provider evidence.

No real OAuth credentials, tokens, raw private emails, or non-anonymized test data belong in this repository or the shared Drive folder.

## Local commit discipline

Commit one coherent working feature with its tests and documentation after centralized checks. Small logical commits are preferred to a giant eventual-publication commit, but tightly coupled navigation/styles/models must not be split into broken intermediate states. Stage explicit owned paths, exclude secrets/private profiles and unrelated user files, and preserve existing history. Private feature-branch publication and PRs to the authorized repository follow [CONTRIBUTING.md](CONTRIBUTING.md); do not amend/rebase shared commits, push directly to `main`, add another remote, or publish elsewhere without separate authorization.
