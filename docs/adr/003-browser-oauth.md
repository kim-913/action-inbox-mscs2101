# ADR-003: Browser-bound OAuth and opaque sessions

Status: accepted implementation decision following the approved web platform change, 2026-10-07.

## Context

The React app runs in a browser, not a native application. Provider tokens and application bearer credentials must not be exposed to JavaScript. Login initiation also needs CSRF protection; OAuth state alone does not bind a callback to the browser that initiated it.

## Decision

Use one opaque random server session with a SHA-256 database hash. `GET /v1/auth/session` establishes an anonymous HttpOnly browser session when needed and returns only authentication status, user information, and a session-bound CSRF token. Every application mutation, including OAuth start, requires the exact configured `WEB_ORIGIN` and `X-CSRF-Token`. Cookie credentials are included by fetch. Explicit credentialed CORS allows this single origin. Production uses HTTPS, HttpOnly, Secure, SameSite=Lax cookies; local loopback HTTP is the only Secure exception. Responses carrying session information are not cacheable.

OAuth start persists a random state hash, a browser-binding hash, encrypted PKCE verifier, expiry, and single-use consumption timestamp. Callback is the narrow cross-site-navigation exception to Origin/CSRF checks: require matching unexpired state and browser session binding, atomically consume state before code exchange, verify Google issuer/audience/nonce/verified email, and rotate the session on successful login. Callback redirects only to the configured web origin with safe outcome codes, never provider codes or tokens. Use a Google **Web application** OAuth client; never reuse Desktop OAuth credentials.

Scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly`, and `https://www.googleapis.com/auth/calendar.events`. The Calendar adapter restricts operations to `primary`. Request offline access for refresh; preserve an existing encrypted refresh token when Google omits a new one. Provider tokens and PKCE material use versioned AES-256-GCM envelopes with identity/purpose authenticated context and a key outside PostgreSQL.

`POST /v1/auth/refresh` rotates the current opaque session and CSRF token; there is no second refresh credential. Expired sessions require login. `POST /v1/auth/logout` invalidates the server record and clears the cookie. No native exchange endpoint, deep link, token localStorage, or compatibility alias remains. Disconnect revokes Google access and removes retained email-derived content; account-data deletion additionally removes the user and sessions. Provider failure must be exposed safely and never falsely reported as successful revocation.

## Alternatives rejected

Browser-stored access/refresh tokens increase XSS impact. JWT sessions add revocation complexity without a need for stateless verification. Separate application refresh tokens add unnecessary lifecycle state. Wildcard/reflected CORS and unbound login initiation are not acceptable.

## Consequences and verification

The client initializes session state before login or mutation and refreshes its CSRF token after rotation. Same-origin web/API deployment is preferred. Tests must cover Origin rejection, CSRF mismatch, login-session binding, single-use/expired state, session fixation, and logout. Real Google and browser evidence remain pending until credentials and local integration are available.
