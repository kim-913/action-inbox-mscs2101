# Canvas connection discovery

Date: 2026-10-07. Scope: institution/access discovery for a user-authorized read-only connection attempt, not connector implementation or live Canvas verification. This supplements [connector prerequisites](connector-prerequisites.md) and [Phase 2 requirements](../requirements/phase-2.md).

## Observed local capability and metadata

- The exposed session tool inventory contains no authenticated Canvas-specific tool or MCP resource-listing operation. A bare `mcp://` read cannot enumerate resources; it requires a known resource URI. No Canvas resource URI was supplied by the session.
- Project `.omp/mcp.json` lists only `google-workspace`. Its configuration was parsed with only server names emitted; unrelated credentials were not reused.
- Presence-only inspection found no Canvas, Instructure, institution or iCal configuration key names in `.env`, `.env.google-web`, `.env.example`, or the process environment. Those project files and `.omp/mcp.json` also contain no Canvas/Instructure references. Secret values were not emitted.
- Bounded agent configuration inspection found no Canvas/Instructure or MCP references in `~/.omp/agent/config.yml`. No browser profiles, cookies, tokens, session storage, credential stores or historical private content were inspected.
- The execution plan identifies `MSCS2101-1 Software Engineering, Fall 2026`; targeted project documentation discovery found no institution-specific Canvas origin. A course label is not evidence of an institution hostname or Canvas numeric course ID.

These observations establish **no reachable authenticated Canvas path in the inspected session/configuration**, not that the user lacks Canvas access or that no registration exists elsewhere. No institution hostname was inferred, no credential was requested in chat, and no private profile, course, assignment or feed request was made. Canvas remains **not connected**.

## Official read-only paths and missing prerequisites

### Application OAuth

The [Canvas OAuth overview](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth) and [developer-key documentation](https://developerdocs.instructure.com/services/canvas/oauth2/file.developer_keys), already researched in connector prerequisites, require an institution-enabled API OAuth developer key. For a real multi-user Action Inbox connector:

1. The account owner identifies the actual approved HTTPS Canvas origin.
2. The institution Canvas administrator identifies an existing enabled API developer key, its approved GET scopes and callback, or separately authorizes provisioning. An LTI key is not a substitute.
3. The application owner configures the client ID, server-only client secret and exact registered callback through an approved secure configuration channel. No discovered Canvas callback is available to quote, and the Google callback must not be assumed interchangeable.
4. The integration owner implements the actual OAuth/token lifecycle and bounded read adapter before claiming app connection; the user then grants source-specific consent.

Neither a browser sign-in nor an unrelated MCP tool grant satisfies these application prerequisites. No developer key, token, setting, planner override or other Canvas resource was created or modified.

### Minimal authenticated access discovery, if a scoped tool becomes available

The official [Users API](https://developerdocs.instructure.com/services/canvas/resources/users) documents `GET /api/v1/users/:user_id/profile`, scope `url:GET|/api/v1/users/:user_id/profile`, and permits `self` in place of the user ID. It explicitly states that the current user's profile response includes the user's calendar feed URL. This is a documented read endpoint, **not an endpoint successfully called here**.

With an institution-approved origin and existing appropriately authorized read-only tool, a narrowly handled self-profile read could establish access and feed availability without listing courses or assignment bodies. Return only origin/access/feed-present metadata; suppress name, email, IDs and the complete private feed URL. Do not add profile scope silently if a grant does not already authorize it. Do not obtain authentication by extracting browser state or repurposing another application's secret.

### Optional calendar-only iCal trial

The official [Calendar iCal guide](https://community.instructure.com/en/kb/articles/662804-how-do-i-view-the-calendar-ical-feed-to-import-and-subscribe-to-an-external-calendar) documents this manual path: **Calendar** in Canvas Global Navigation → **Calendar Feed** → **Copy Calendar Feed**. **Click to view Calendar Feed** offers an ICS download. The public guide was inspected via its page metadata and official-site search excerpts; a separate Python HTTPS fetch failed certificate validation and was not retried with TLS validation disabled. No browser automation was used.

The guide documents a maximum of 1,000 items, future events up to 366 days and past events within 30 days; To Do items are excluded. It describes events and assignments across Canvas calendars, so a personal feed must not be represented as course-only access. A user choosing a trial must understand this scope before a feed is read.

A private feed URL must be handled as a bearer-like secret: never paste it into chat, public documentation, logs, browser screenshots or queryable diagnostics. A secure input/storage path and explicit calendar-feed trial consent are prerequisites to importing it into Action Inbox. No feed has been obtained, fetched, stored or connected. A downloaded ICS is a snapshot, not proof of ongoing synchronization. A feed trial cannot claim full Canvas OAuth, complete assignment/undated-item coverage, submission/completion state or full planner semantics. No fallback implementation is authorized by this discovery alone.

## Initial next owner action (before the origin was supplied)

After the tool/configuration avenues above, the immediate missing non-secret fact is the institution origin. In **Arc**, the user can manually open their usual signed-in Canvas page and provide **only its HTTPS origin from the address bar** (scheme plus hostname; no path, query, fragments, private feed URL or tokens). No automated Canvas UI interaction is needed or permitted.

Once that origin is known, the institution administrator/application owner must identify the existing approved OAuth key and registered callback through secure configuration. If no such key is available, the user may separately choose to evaluate the limited calendar-feed route described above; this is not a silent replacement for the requested Canvas connector. Until one of those authorized access routes is available, there is no legitimate live connection attempt to perform and no basis for a connected status.

No source code edits, installations, build/test/lint checks, Canvas browser automation, provider writes, submissions, messages, paid registration or content-sharing operation accompanied this discovery.

## Sofia origin supplied: public discovery update

The user subsequently supplied and approved **`https://sofia.instructure.com`**. This resolves the origin prerequisite and supersedes the earlier request for an institution hostname; it does not establish app authorization or a connected account.

### Observed public evidence

- Sofia University's official [Tools and Supports](https://www.sofia.edu/tools-and-supports/) page links its Canvas navigation entry to that exact origin. The page discusses Canvas accessibility, not application OAuth approval.
- Direct unauthenticated HTTPS GETs, with TLS verification intact and no browser cookies, observed HTTP 302 redirects from `/` to `/login`, then `/login/saml`, then the Microsoft sign-in origin `https://login.microsoftonline.com` on a SAML route. The direct discovery stopped at that external redirect. Only sanitized redirect metadata was emitted; no SAML query or tenant identifier is recorded here.
- A separate static-reader traversal displayed a SAML encoding error. That reader result is **not evidence that the user's sign-in is broken**; no authentication or sign-in troubleshooting was attempted.
- Sofia's official page links the [student portal](https://sof-web.scansoftware.com/cafeweb/login). Its public HTML, fetched without authentication, states: “For technical support, email us at helpdesk@sofia.edu.” This is a verified general technical-support contact that can route a Canvas administrator inquiry, not a documented developer-key approval authority or a promise of approval. No email was sent.
- Targeted public searches of Sofia's official site for Canvas OAuth/API developer-key policy found no specific registration policy or application-request procedure. This is a bounded search result, not proof that no internal procedure exists.

No authenticated Canvas API/tool became available through these public reads. No profile, feed, courses or assignments were fetched; no Canvas write or app change occurred.

### Calendar-only options at the public-discovery stage

The admin-free candidate is Canvas's documented personal calendar export, **not** a personal API token. It does not require an application developer key. Its presence for this Sofia user has **not** been observed; the Microsoft SSO redirect does not establish feed availability.

The immediate next step is for the user to manually check **Calendar → Calendar Feed** and confirm whether they want a read-only calendar subscription. They should report availability and their choice, not paste the private URL. Subscription is a useful admin-free candidate for the internal planner, but it must not silently replace the requested full Canvas connection. A one-time snapshot is the separate, narrower experiment below.

If the user chooses a one-time calendar snapshot trial:

1. The user manually opens their usual Canvas session in **Arc**, selects **Calendar → Calendar Feed**, and uses **Click to view Calendar Feed** to download the ICS file, following the official guide linked above. No assistant-controlled Canvas UI interaction is needed.
2. Keep that private file outside the repository and outside cloud-synchronized/shared folders, in a user-only local directory (directory permission `700`, file permission `600`). Provide only its local filesystem path, not file contents or the private feed URL, in chat. No file path or file has been supplied yet.
3. Obtain explicit consent to a bounded, read-only inspection of that snapshot before parsing it. Explain that the export can include multiple Canvas calendars, not just this course. Initially disclose only availability, item counts and coverage metadata; do not print assignment titles/descriptions or private links into discovery logs.
4. Only after the route is selected should the integration owner design the actual import/mapping and verify it. A one-time ICS import remains a **calendar snapshot**, with no automatic refresh, undated-assignment completeness or full Canvas status claims.

This is the smallest experiment that avoids both institution OAuth provisioning and handing the application a reusable private feed URL. It has not been performed.

For a later subscription trial, the user can instead privately save the copied Calendar Feed URL in a user-only local file outside the repository/cloud sync and provide its path only, after explicitly choosing ongoing feed access. The URL must never appear in chat, command arguments, logs, committed configuration or public diagnostics. The application would still need a real secure input/encrypted storage path, institution-origin validation, bounded fetches and a disclosed refresh/retention policy before connection. There is no claim that such an Action Inbox feed connector or secure input control exists today.

If subscription is elected, the concrete implementation boundary is a secure app input with existing session/CSRF protection, server-only AES-GCM storage bound to the user/connection, and a distinct Canvas calendar source—not a relabelled Google event or Gmail message. Pin HTTPS `sofia.instructure.com` and the permitted `/feeds/calendars/` path; reject unexpected origins, ports, embedded credentials, redirects and private-network destinations. Bound fetch time, response bytes and parsed items, never fetch embedded links/attachments, and retain last-good data with visible freshness/error state. Keep the private URL out of returned JSON, logs, command arguments and browser persistent storage. These are implementation requirements, not existing controls or proof of connection.

### Full Canvas application route

For full OAuth integration, the application owner can ask **helpdesk@sofia.edu** to route an inquiry to the Canvas administrator: whether an existing enabled scoped API developer key may be used for this read-only course project, which GET scopes are approved, and which exact application callback must be registered. Client secrets belong only in approved secure server configuration. Public discovery neither proves an existing key nor predicts institutional approval. No request, registration, key creation or approval was performed.

## Subsequent user election and implementation boundary

The user's later screenshot confirmed **Calendar Feed is available**, and they explicitly elected an ongoing **calendar-only subscription**. This supersedes the availability/consent questions and optional file-based trial above. The chosen handoff is now the application's authenticated **Connections → Canvas** secure input—not chat, a command argument, or a pasted URL in documentation. The real private URL has still not been supplied or fetched by an agent.

The implementation uses native feed assignment/event metadata, manual refresh, encrypted per-user storage and a separate Canvas planner source. Pinned upstream conventions and handcrafted fixtures are in `../../test-data/canvas/README.md`; route/security/coverage limits are in `../architecture/api-contract.md` and `../architecture/deployment.md`. These include date-only assignments with no recoverable exact due time, bounded provider coverage, and no grade/submission/completion guarantee. A synthetic successful import is not evidence that the user's real feed has connected. Full institution OAuth remains a separate future integration requiring actual application credentials and consent.
