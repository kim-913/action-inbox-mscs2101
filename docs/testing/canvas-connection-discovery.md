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

## Exact next owner action

After the tool/configuration avenues above, the immediate missing non-secret fact is the institution origin. In **Arc**, the user can manually open their usual signed-in Canvas page and provide **only its HTTPS origin from the address bar** (scheme plus hostname; no path, query, fragments, private feed URL or tokens). No automated Canvas UI interaction is needed or permitted.

Once that origin is known, the institution administrator/application owner must identify the existing approved OAuth key and registered callback through secure configuration. If no such key is available, the user may separately choose to evaluate the limited calendar-feed route described above; this is not a silent replacement for the requested Canvas connector. Until one of those authorized access routes is available, there is no legitimate live connection attempt to perform and no basis for a connected status.

No source code edits, installations, build/test/lint checks, Canvas browser automation, provider writes, submissions, messages, paid registration or content-sharing operation accompanied this discovery.
