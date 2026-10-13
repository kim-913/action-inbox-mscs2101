# Google access: developer onboarding and production boundary

**A running local app is not a configured Google integration.** Use this guide when a teammate needs to connect an approved test Gmail account. For ordinary UI development and QA, use [Contributor guide, Mode A](../../CONTRIBUTING.md#mode-a--authenticated-synthetic-workspace-recommended) instead; its synthetic providers do not connect to real Gmail.

This guide documents setup, not approval to access an account, spend money, or change the owner's running environment. Primary owner: Developer; QA reviews acceptance evidence. Keep all real account identifiers and credentials out of this public repository.

## 1. Choose the right access model

| Scenario                              | What the person does                                                                                                            | What the maintainer provides                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Local development with synthetic data | Start Mode A and use its documented synthetic login bootstrap                                                                   | No Google account or Cloud permissions                                                                |
| Local real-provider acceptance        | Request approval for a designated test account, configure a private development backend, then personally consent through Google | Test-user eligibility, approved development OAuth configuration and registered callback               |
| Future hosted product                 | Open the website, choose Connect Google account, sign in and consent                                                            | Hosted services, production OAuth configuration and applicable verification; no per-user `.env` setup |

**User consent is not a manual access application.** A production user must authorize access to their own Google data, but should not ask us to add them to a developer test list. Production onboarding is future work, not a capability enabled by publishing the source repository.

[Historical setup evidence](google-setup-evidence.md) recorded External / Testing with one test user on 2026-10-07. It does not establish today's Cloud configuration or approval for any teammate. Check the correct project before changing settings.

## 2. Request and approve a real test account

There are three separate gates:

1. **Google test-user eligibility:** while the OAuth app is External / Testing, Google allows only listed test users for the requested Gmail/Calendar scopes.
2. **Application admission:** the local API checks `GOOGLE_ALLOWED_EMAILS` independently of Google.
3. **Account-holder consent:** the person signs in and grants the requested scopes themselves. Being allowlisted does not grant us access to their mailbox.

### Teammate: send this privately to the project maintainer

- The Google email address you intend to test with; prefer a designated test account containing synthetic messages.
- Whether it is a personal Google account or a school/company-managed Google Workspace account.
- The real-provider scenario you need to verify, including any requested external write. Routine development should remain synthetic.
- Your planned browser origin and API callback, including scheme, hostname and port. No password, token, authorization URL or client secret is needed in the request.

Use the team's approved private channel, not a public issue, PR or shared course evidence. GitHub collaborator access does not approve Google data access.

### Maintainer: approve and configure

1. Confirm the account holder approves the test and its data scope. Approving Gmail reads is not approval to send email, create calendar events or enable paid AI.
2. In Google Cloud, select the intended development project. The recorded team project is **Action Inbox MSCS2101** (`action-inbox-mscs2101-2026`). Open **Google Auth Platform → Audience → Test users → Add users**, add the approved address and save. Older console layouts may place this under OAuth consent screen.
3. Check **APIs & Services → Enabled APIs & services** for Gmail API and Google Calendar API. Under **Google Auth Platform → Data Access**, confirm the scopes listed below.
4. Under **Google Auth Platform → Clients**, configure an approved **Web application** client with the teammate's exact origin and callback. Prefer a separate development client per independently operated environment; do not distribute production credentials. The teammate does not need Cloud Owner/Editor access just to sign in. An existing authorized project administrator can perform these steps.
5. Deliver the approved development client configuration through a private secret-sharing mechanism. Never send the owner's whole `.env`, database credentials, encryption key, cookies or provider tokens. A teammate-owned development Cloud project is another option, but it requires its own API, consent and client setup; it does not inherit the team's test-user list.
6. Have the teammate add the same approved email to **their own API's** `GOOGLE_ALLOWED_EMAILS`. Restart only that API after configuration changes. Do not edit or restart the owner's preview.
7. Confirm completion privately without copying account identifiers or credentials into public evidence. Google settings can take time to propagate; do not repeatedly change credentials to force a retry.

A Workspace administrator may still block an external OAuth app. If Google reports an organization-policy block, the account holder must request approval through their school/company IT process. We cannot override that policy by changing our allowlist. Do not use service accounts or domain-wide delegation to bypass user consent.

### Scopes used by this application

| Scope                                                                                                          | Purpose                                                        |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile` | Google identity and verified account information               |
| `https://www.googleapis.com/auth/gmail.readonly`                                                               | Read consented Gmail data; this is a restricted scope          |
| `https://www.googleapis.com/auth/calendar.events`                                                              | Read and manage calendar events; this is not a read-only scope |

Calendar event creation still requires explicit confirmation in the application. Do not tell users that all requested permissions are read-only, or change scopes in the console without reconciling the application's consent contract.

## 3. Configure your own local backend

Follow [Contributor guide, Mode B](../../CONTRIBUTING.md#mode-b--production-path-api-with-your-own-approved-providers) and [deployment configuration](../architecture/deployment.md#google). Clone/install prerequisites are in the contributor guide. In a fresh checkout only, copy `.env.example` to `.env`; never overwrite an existing secret configuration.

The following is a configuration checklist, not working credentials:

| Setting                                    | Required value / rule                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Your separate development database, not a test-suite, synthetic smoke or owner's live database                |
| `API_HOST`, `API_PORT`                     | Your chosen loopback host and available API port                                                              |
| `WEB_ORIGIN`                               | Exact browser origin, no trailing slash or path                                                               |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Matching approved Web application client; server-side only                                                    |
| `GOOGLE_REDIRECT_URI`                      | Exactly the registered backend `/v1/auth/google/callback` URL                                                 |
| `GOOGLE_ALLOWED_EMAILS`                    | Explicit comma-separated approved Google email addresses; Google test-user membership alone is insufficient   |
| `TOKEN_ENCRYPTION_KEY`                     | Your own canonical base64 key containing 32 random bytes, generated once for a new database                   |
| `OPENAI_ENABLED`                           | Keep `false`; Gmail connection does not require a paid model                                                  |
| `VITE_API_URL`                             | Matching API origin, exported in the web shell or set in `apps/web/.env`; root `.env` does not configure Vite |

Store credentials only in ignored local configuration. Generate the encryption key privately using a cryptographically secure generator; never print it in shared logs. Preserve it for that database: replacing it makes stored provider credentials unreadable.

### Match addresses exactly

| Environment                                                        | Browser origin          | API / registered Google redirect URI            |
| ------------------------------------------------------------------ | ----------------------- | ----------------------------------------------- |
| Recorded owner preview; do not modify                              | `http://127.0.0.1:5173` | `http://127.0.0.1:3000/v1/auth/google/callback` |
| Example isolated real-provider environment, requiring registration | `http://127.0.0.1:5174` | `http://127.0.0.1:3002/v1/auth/google/callback` |

For the second row, set `API_PORT=3002`, `WEB_ORIGIN=http://127.0.0.1:5174`, `GOOGLE_REDIRECT_URI=http://127.0.0.1:3002/v1/auth/google/callback`, and the web API URL to `http://127.0.0.1:3002`. Register the 5174 origin and 3002 callback on the selected Web client first. These addresses are an example, not a claim that registration already exists.

`localhost` and `127.0.0.1` are different hosts. Ports and callback paths must also match. Vite must not silently choose a different port. Do not run Mode A and Mode B on the same ports or against the same database. Use a separate browser profile from the owner's app; cookies are not port-isolated.

After privately configuring your development database and root `.env`, run from the repository root:

```bash
# Applies migrations to DATABASE_URL: verify that it is your development database first.
npm run db:migrate
npm run dev:api
```

In a second terminal, for the isolated example above:

```bash
VITE_API_URL=http://127.0.0.1:3002 npm run dev --workspace @action-inbox/web -- --host 127.0.0.1 --port 5174 --strictPort
```

Use the real API command, **not** `npm run smoke:local-providers`, for this account-authorized scenario. A successful health endpoint only establishes server availability, not OAuth readiness.

## 4. Account holder: connect and verify

1. Open the exact configured origin and choose **Connect Google account**. Sign in with the approved test account, not another account already selected in the browser.
2. Check the app identity and requested permissions before consenting. Stop on unexpected scopes, an unknown application or an organization-policy block. Do not dismiss security warnings without confirming the intended development app.
3. After the callback, verify the signed-in account and import state. Successful new consent queues a bounded initial Gmail import (latest 14 days, at most 100 messages), so authorizing this scenario also authorizes those reads. Sign-in alone is not proof that import completed.
4. Confirm a known synthetic message in the designated mailbox is readable and source-linked. If extraction is disabled, readable Gmail content should remain usable; missing AI suggestions do not imply OAuth failed.
5. Record only sanitized status, error code, expected/actual behavior and environment/revision. Do not include mailbox content, tokens, callback query strings, credentials or private account identifiers in evidence. Calendar writes need separate explicit approval and are not part of this connection check.

For External / Testing apps requesting these scopes, refresh tokens generally expire after seven days; revoked access can also require reconnection. Reconnect through the normal consent flow when required. Do not rotate the encryption key, delete the database or remove authorization checks to work around token expiry. See Google's [token expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration) and [Workspace exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

## 5. Troubleshooting by failure stage

These are diagnostic branches, not a diagnosis of a teammate's machine.

| Symptom                                                            | Check / responsible person                                                                                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic fixtures or loopback provider sign-in instead of Google  | Developer: check the startup command. Mode A intentionally does not use real Google credentials.                                                                                                      |
| `PROVIDER_NOT_CONFIGURED` / “Google connection is not configured.” | Developer: check that the real API loaded the approved client ID, secret and redirect configuration. Check startup errors for encryption-key prerequisites. Do not paste secret values into a ticket. |
| Google rejects the account while the app is in testing             | Maintainer: confirm the selected account is in the test-user list of the project that owns this client. Distinguish this from user-denied consent or organization policy.                             |
| `redirect_uri_mismatch`                                            | Maintainer and developer: compare the configured callback with the exact registered Web-client callback, including host, port and path.                                                               |
| Google consent succeeds but the application rejects sign-in        | Developer: check the local `GOOGLE_ALLOWED_EMAILS` and the actual verified Google account. Other session/identity failures need the sanitized error code; do not disable validation.                  |
| Organization/admin policy blocks access                            | Account holder: contact the Workspace administrator. Team test-user approval cannot override the block.                                                                                               |
| Callback/network/cookie/CSRF failure                               | Developer: confirm both services run, `VITE_API_URL` and `WEB_ORIGIN` match, the database is configured, and hostname/profile choices are consistent. Do not weaken Origin or CSRF guards.            |
| Signed in, but import fails or remains incomplete                  | Developer/QA: inspect sanitized import status and error, enabled APIs, granted Gmail permission and quota availability. Login success is separate from import success.                                |
| Previously connected account needs consent again                   | Account holder/developer: check revoked or expired authorization, including Testing token lifetime; reconnect normally. Preserve the existing encryption key.                                         |

Ask for the startup commands, non-secret web/API origins, failure stage and sanitized error text or screenshot. Never ask for an entire `.env`, browser cookies, OAuth callback URL with query parameters, token or private email content.

## 6. Costs and limits

Official pricing references checked on **2026-10-13**; recheck before deployment or a quota increase.

- Adding OAuth test users and granting user consent do not require a paid subscription. An ordinary tester does not need Google Cloud IAM access or a credit card to authorize the app.
- Google's [Gmail API limits/pricing](https://developers.google.com/workspace/gmail/api/reference/quota) and [Calendar API limits/pricing](https://developers.google.com/workspace/calendar/api/guides/quota) describe standard use at no additional cost, with quotas and planned charges above applicable limits later in 2026. This is not an unlimited-free-use guarantee. Check project-specific quotas and current billing terms; do not enable billing or purchase quota as an incidental setup step.
- Hosted compute/database, domains and paid model APIs are separate costs. Keep `OPENAI_ENABLED=false` unless paid usage is approved. A ChatGPT subscription is not the application's API billing account.
- Public release with restricted Gmail scopes may require verification and an applicable third-party security assessment. Assessment/provider costs depend on the data handling and verification requirements; do not promise that public launch is free. See Google's [restricted-scope verification guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## 7. Production users must not follow this developer checklist

The intended hosted flow is **website → Connect Google account → Google consent → application**. Users should not configure OAuth clients, edit `.env`, receive client secrets or request manual addition to a developer test-user list.

Before offering that flow publicly, the team must:

- Deploy and secure shared web/API/database services, with approved HTTPS callbacks and server-side secrets.
- Provide accurate app identity, privacy policy, consent disclosures, retention and deletion behavior; request only justified scopes.
- Complete applicable Google brand/scope verification and any required security assessment. Switching Publishing status alone is not approval or a release gate.
- Replace the current fixed development email-admission policy with a deliberately designed production registration/access policy. An empty `GOOGLE_ALLOWED_EMAILS` is not a documented “allow everyone” switch. Preserve verified identity, per-user ownership and consent checks.
- Verify token lifecycle, revocation, account deletion, isolation and safe failure behavior in the deployed environment. Organization administrators may still block their users from authorizing an app.

Google documents the Testing cap of 100 test users and production differences in its [OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview). This guide does not publish the app, remove an allowlist, approve accounts or claim production readiness.
