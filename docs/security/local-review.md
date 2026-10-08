# Local security review and remediation

Scope: local web P0 candidate, 2026-10-07 Pacific / 2026-10-08 UTC. A separate read-only reviewer inspected authentication, ownership, idempotency, retention, and evidence. This record is not a claim of penetration testing, independent post-fix review, deployed security approval, or public OAuth verification.

## Findings and implemented remedies

1. **Stale Gmail work could restore deleted content after reconnect.** A current active connection was insufficient to authorize a response from an older deleted run. Every ingestion persistence transaction now locks the user and requires the original `Running` sync run plus the original connection ID before writing messages, extraction results, or completion. Four held-provider PostgreSQL regressions cover stale Gmail/extractor responses, purged runs with a reused connection ID, and replaced connections without run deletion.
2. **Manual-task Calendar retries conflicted after disconnect/reconnect.** Local links are deliberately purged, while manual tasks and external events remain. Provider reconciliation now requires deterministic event ID, stable user/task identity markers, a hash of immutable approved content, and actual event title/start/end. A replacement request UUID is not the external identity. Changed content or timezone still conflicts. Regression tests cover the full reconnect transition; actual browser smoke recovered the same event ID after reconnect, without retaining local provider snapshots.
3. **Already-invalid tokens could block local deletion forever.** Revocation now accepts only a fully read, size-bounded HTTP 400 JSON object with `error` exactly `invalid_token` as definitive prior revocation. Lost responses, transport failure, 5xx, other 400 errors, malformed or oversized JSON remain failures and retain data for retry. Local HTTP regressions cover lost success followed by definitive invalid-token retry and reject the ambiguous cases.

The reviewer supplied the initial findings only and did not re-audit the edits. Remediation verification is performed by the central test runner, with results in the P0 evidence record.

## Other exercised boundaries

- Opaque session credentials are hashed in PostgreSQL and sent only in HttpOnly cookies; session rotation, expiry, logout, CSRF, exact Origin, and cross-user API isolation have regression tests.
- OAuth state is hashed, expiring, single-use, and bound to the initiating browser; PKCE and identity-token issuer/audience/nonce/email verification and account allowlist are checked.
- AES-256-GCM encrypts provider tokens and PKCE with purpose/identity authenticated context. Tamper and wrong-context tests exist; private keys/tokens are not checked into fixtures.
- Google request URLs are restricted to configured Gmail `users/me` and primary Calendar resources, redirects are rejected, and provider failures/timeouts become safe stable errors.
- Task approval is locked and atomic. Calendar writes are separately confirmed and use deterministic IDs; concurrent and uncertain-response retries have real local HTTP/database coverage.
- Browser 401 handling clears private drafts/query cache and suppresses late old-session responses. Actual Chrome exposed a native `fetch` receiver issue missed by mocks; binding the default fetch receiver fixed it, with a receiver-aware regression.
- OpenAI has no tools, strict structured output, exact quote validation, conservative deadline checks, and an explicit `OPENAI_ENABLED=false` cost gate. No paid request was made.

## Residual external gates

Approved Google Web application credentials/test identities, deployment HTTPS/same-site cookie behavior, live provider refresh/revocation, paid model evaluation, and a reminder-delivery decision remain unverified. The local source credential-pattern scan is limited and does not replace a dedicated secret scanner or deployment review. Production hosting must also ensure infrastructure/access logs do not retain OAuth callback URLs or private request headers.
