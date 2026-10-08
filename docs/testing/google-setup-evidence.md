# Google local setup evidence

Observed in the authenticated Google Cloud console in Arc on 2026-10-07. This is developer configuration evidence, not evidence of end-user authorization or a live Gmail/Calendar workflow.

## Existing project and APIs

- Project: **Action Inbox MSCS2101**, project ID `action-inbox-mscs2101-2026`. No new project created.
- Enabled Gmail API (`gmail.googleapis.com`) and Google Calendar API (`calendar-json.googleapis.com`).
- After enablement, the project's **Enabled APIs & Services** dashboard listed **Gmail API**, **Google Calendar API**, **Google Drive API**, and **Google Docs API**. This status was observed in the enabled-services table, not inferred solely from a product-page button.
- Evidence location: <https://console.cloud.google.com/apis/dashboard?project=action-inbox-mscs2101-2026>.
- No billing account was enabled, no paid service was purchased, and no AI calls or credits were used during this setup. Standard Gmail/Calendar API usage is subject to Google's free API quotas; this setup does not approve any paid infrastructure or provider use.

## Dedicated Web OAuth client

- Created **Action Inbox Local Web**. Creation dialog reported **Enabled**.
- Clients list explicitly showed its type as **Web application**. The existing **Action Inbox Local MCP** client remained **Desktop** and was not edited or reused.
- Reopened the saved Web client and observed these registered values:
  - Authorized JavaScript origin: `http://127.0.0.1:5173`
  - Authorized redirect URI: `http://127.0.0.1:3000/v1/auth/google/callback`
- Client ID and secret were captured directly into the ignored local file `.env.google-web`, created with mode `0600`. Neither value is included in this evidence. The API owner received only the private file path and reported merging it privately into the local API configuration.
- Evidence location: <https://console.cloud.google.com/auth/clients?project=action-inbox-mscs2101-2026>.
- Google's form notes that configuration propagation may take five minutes to a few hours.

## Consent and declared scopes

- Audience page explicitly showed **External**, publishing status **Testing**, and **1 test user**: `kziruo@gmail.com`.
- No public publication, verification submission, additional test users, or changes to the existing Desktop client were performed. The other three proposed account addresses remain unknown and unconfigured.
- Data Access initially had no declared scope rows. Added these five app-required scopes without removing any existing declarations:
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.email` (OAuth `email` identity scope)
  - `https://www.googleapis.com/auth/userinfo.profile` (OAuth `profile` identity scope)
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/calendar.events`
- Console displayed the three identity scopes as non-sensitive, Calendar events as sensitive, and Gmail read-only as restricted. Waited for the explicit **Data access changes saved!** acknowledgement; the five rows remained visible.
- Evidence locations: <https://console.cloud.google.com/auth/audience?project=action-inbox-mscs2101-2026> and <https://console.cloud.google.com/auth/scopes?project=action-inbox-mscs2101-2026>.

## User handoff and boundaries

Developer setup is complete; there is no outstanding Cloud-console interaction required from the user. Open <http://127.0.0.1:5173/> in Arc and use the app's Google Connect action with the approved test account. Only the user should complete Google's sign-in/consent; ordinary app users do not configure Google Cloud.

No Google authorization consent was accepted on the user's behalf, no tokens were exchanged by this setup worker, no real Gmail data was read, and no Calendar events were created. No Canvas/Drive/Docs browser automation was performed. Live login and user-approved application operations remain separate from this setup evidence. Local service startup and browser/API smoke evidence belong to the API owner, not this document.
