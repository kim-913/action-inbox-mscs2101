# Canvas calendar subscription evidence

## Scope and central checks

The user explicitly approved an ongoing read-only Sofia Canvas Calendar Feed subscription. This is not Canvas OAuth, a course/grade/submission API integration, completion tracking, background polling, or notification delivery. The shared contract is `packages/contracts/src/canvas.ts`; source conventions and synthetic ICS fixtures are documented in `../../test-data/canvas/README.md`.

Observed centralized checks after the implementation and review corrections:

- `npm run typecheck`: all workspaces passed.
- `TEST_DATABASE_URL=… npm test`: **304 passed** — 71 web, 221 API/provider/database/evaluation, 12 contracts. PostgreSQL tests used a disposable loopback 55433 database, never the persistent user database.
- `npm run lint` and `npm run format:check`: passed.
- `npm audit --omit=dev`: zero reported vulnerabilities; not a comprehensive security audit.
- Isolated production build for API 3002 in `.local-preview/smoke-dist`: passed. Final user build for API 3000 in `apps/web/dist`: passed. Existing upstream TanStack directive and Zod annotation warnings were non-fatal.

The focused Canvas adapter/persistence suite contains 123 passing cases, including URL/DNS/IP/TLS pinning, redirect rejection, bounded responses, timezone/date-only semantics, decoded literal text, allowed source links, per-user authorization/CSRF, encrypted credential isolation, complete-snapshot replacement, stale cursors, retained failures, concurrent refresh/disconnect/reconnect/account-delete fencing, and Google disconnect independence. This is regression coverage, not proof of live provider access.

Review corrected three concrete issues before the final full gate: exact-optional test payload typing; legitimate user/group/account calendar source contexts; and mistakenly reinterpreting decoded ICS TEXT as HTML. Literal `vector<T>`, `<script>` examples, entities and newlines now remain text and render inertly. Saved subscriptions with an initial failed read no longer receive a misleading Connected status.

## Actual synthetic browser observations

The real Fastify API ran on 3002, production Vite preview on 5174, and disposable PostgreSQL on 55433. A dedicated isolated Chrome profile was used; no user browser session or private mailbox was opened. The harness supplied synthetic ICS through a real local HTTP endpoint to the same parser and authenticated persistence routes. Production DNS/TLS transport is tested separately; the harness has no production-configurable destination bypass.

Production frontend navigation correctly rejects a loopback OAuth authorization address. For this isolated rehearsal only, the browser session was bootstrapped through the actual loopback test-provider OAuth API/callback instead of relaxing that production guard. Canvas interactions then used ordinary forms/buttons and actual API/database requests.

Observed:

1. Initial Canvas connection imported four synthetic native entries. The password input was removed after submission; the fake credential was absent from visible text, localStorage and sessionStorage.
2. Planner showed assignment due values separately from event times, preserved course suffixes and date-only “no exact time supplied” wording, and disclosed four loaded/four imported items. Desktop and 390px layouts were reviewed; the narrow page had no horizontal overflow.
3. Manual Refresh changed the due date without duplication and removed one disappeared fixture item: three remained. Disappearance was not represented as completion.
4. A fixture HTTP outage produced “Refresh failed · previous data kept,” retained all three entries and exposed a retry control.
5. Confirmed Canvas disconnect removed Canvas items while the independent synthetic Google connection and six imported emails remained.

Synthetic screenshots, not private user data:

- `canvas-connections-desktop.png`
- `canvas-planner-desktop.png`
- `canvas-planner-mobile.png`
- `canvas-refresh-failure-mobile.png`

## Live preview and remaining acceptance

After observing zero active imports, the verified user build was loaded into stable launchd Vite preview at `http://127.0.0.1:5173/`, and the API was restarted at 3000. A fresh anonymous browser observed the hashed production asset `/assets/index-XoAK_KCx.js`, the sign-in control, and no HMR client. The user subsequently supplied a screenshot of the live Canvas form and its validation; this independently establishes that the new control reached the user.

The user's initial real-feed attempt reported `CANVAS_UNAVAILABLE` with zero imported items. After the identified-client correction below, the user explicitly reported **“this time it worked.”** This is user-reported real import success, not an agent inspection of private entries; no real item count is claimed. No Canvas write, paid AI call, new real Google sync, private-content screenshot, or raw feed credential was used as test evidence.

Reminder delivery, broader Outlook/Canvas OAuth, SMS permission/cost decisions, all approved Google test-user acceptance, and real paid-model accuracy remain unresolved or planned as documented in `../../EXECUTION_PLAN.md` and `../requirements/phase-2.md`.

## Identified-client transport correction

Safe public diagnostics resolved Sofia to public IPv4 addresses and completed TLS verification. Same-method public-root GET comparisons observed **403 from CloudFront with no User-Agent**, versus **302 to Sofia's login path with the truthful `ActionInbox/0.1 (Canvas calendar subscription)` User-Agent**. The custom feed request had omitted identification. It now supplies that explicit application identity; it does not impersonate a browser, follow a challenge/redirect, weaken TLS, or relax the DNS destination policy.

After this header-only correction, the focused **123 Canvas tests**, API TypeScript, targeted ESLint and targeted formatting checks passed. The existing full 304-test gate was not redundantly rerun. With zero active Gmail imports and zero active Canvas reads, only the API launchd service was restarted; its health endpoint returned 200.

At that correction's cutover, safe metadata showed **no saved Canvas subscription**. The diagnostic therefore could not decrypt/read a real feed, and did not search browser history or recover credentials from logs. The user then submitted the actual Calendar Feed `.ics` link through the secure app input and reported that import worked. The ordinary `/calendar#…` page URL is not a feed. Neither URL nor private content belongs in chat or diagnostics.

The user's follow-up asked about completed assignments. This feed integration does **not** provide reliable Canvas submission/completion state; disappearance or a crossed-out item in Canvas's own UI is not a supported completion signal here. Existing app-owned approved/manual tasks support Completed, but imported Canvas entries do not yet have an independent local Mark done control. A future app-only completion flag would not submit work or change Canvas. Authoritative submission status remains a separate properly authorized API scope, not an inferred feed field.
