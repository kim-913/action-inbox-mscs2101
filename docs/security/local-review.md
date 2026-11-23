# Local security review and remediation

Scope: local web P0 candidate, 2026-10-07 Pacific / 2026-10-08 UTC. A separate read-only reviewer inspected authentication, ownership, idempotency, retention, and evidence. This record is not a claim of penetration testing, independent post-fix review, deployed security approval, or public OAuth verification.

## Finalization checkpoint — 2026-11-23 UTC

This checkpoint extends, rather than replaces, the historical review below. Verification used isolated PostgreSQL databases and synthetic loopback providers. No real provider credentials, personal source data, paid model calls, deployment configuration, or live services were changed.

### Corrected findings

| Finding                                                                                                                | Correction                                                                                                                                                                                                          | Observed evidence                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A held Google Calendar response could write a snapshot or error after its original connection was deleted or replaced. | Capture the original connection ID before the provider request; require that same lifecycle under the user lock before either success or failure persistence. Do not hold the database lock across provider HTTP.   | Six held-response cases failed before the fix. Nine lifecycle regressions passed in the centralized PostgreSQL run, including disconnect, reconnect, deletion, retained latest success, and unrelated-user isolation. |
| GCM authentication-tag length was implicit.                                                                            | Require `authTagLength: 16` for encryption and decryption without changing the existing envelope format.                                                                                                            | Tampered/short/long tag rejection, wrong-context rejection, and legacy-envelope compatibility passed.                                                                                                                 |
| Exhausting the request limit returned `500 INTERNAL_ERROR`.                                                            | Remove the custom rate-limit error builder that discarded the plugin's HTTP status. The existing centralized handler now receives and returns `429 RATE_LIMITED`. The production limit remains 120 requests/minute. | Regression failed with actual 500 before the fix and passed afterward. An actual listening HTTP server accepted 120 requests, then returned 429 with a safe request ID and `Retry-After: 60`.                         |

A separate read-only post-fix reviewer examined lifecycle fencing, crypto, the security gate, CI, synthetic harness, and private-view retention. It reported no findings within that scope. This is code review, not penetration testing or deployed security approval.

### Reproducible security gates

`scripts/security-gate.py` runs pinned Semgrep **1.186.0**, Gitleaks **8.30.1**, and the npm dependency audit against a candidate snapshot of tracked plus nonignored untracked files. CI runs the same gate. Scanner startup/version/configuration/report failures are fatal; the gate does not treat a missing result as a clean scan.

- Seven locally versioned Semgrep rules cover dynamic execution, shell execution, unsafe HTML, TLS verification bypass, interpolated SQL, explicit GCM tags, and sensitive console logging. The observed scan covered 48 application TypeScript/TSX files; tests and testing harnesses are excluded from SAST. This narrow policy is not a comprehensive vulnerability detector.
- Known-positive fixtures exercise every SAST rule and a synthetic GitHub-token secret. Invalid configuration and missing-report controls fail closed. Removing the positive controls restores the clean result.
- Gitleaks scans candidate files, not Git history. Dependency audit rejects any reported vulnerability, including development dependencies.
- Local reports are retained under ignored `.local-preview/security/`. Private environment files, local profiles, and provider data are not exported as evidence.

**Closed parser issue (`SEC-PARSE-01`):** two inert Planner button labels confused Semgrep's JSX parser. Expressing the same labels as JSX string literals preserves the rendered/accessibility text and yields 100% parsed lines with zero findings in the targeted scan. The temporary parser exception was removed entirely; all parser errors now block the gate.

**Exact secret false positives (`SEC-SECRET-01`):** Gitleaks mistakes two public Canvas-scope sentences in `CONTRIBUTING.md` and the UI skill for generic API keys. `security/dispositions.json` requires exact file/rule/full-line SHA-256 matches and expires **2026-12-31**. Neither secret patterns nor whole files are allowlisted. Changed inputs or expiry fail closed.

The integration maintainer owns renewal or removal of the remaining disposition before expiry. The clean local gate and reviewer do not replace infrastructure log review, HTTPS/cookie acceptance, or real-provider acceptance.

## Findings and implemented remedies

1. **Stale Gmail work could restore deleted content after reconnect.** A current active connection was insufficient to authorize a response from an older deleted run. Every ingestion persistence transaction now locks the user and requires the original `Running` sync run plus the original connection ID before writing messages, extraction results, or completion. Four held-provider PostgreSQL regressions cover stale Gmail/extractor responses, purged runs with a reused connection ID, and replaced connections without run deletion.
2. **Manual-task Calendar retries conflicted after disconnect/reconnect.** Local links are deliberately purged, while manual tasks and external events remain. Provider reconciliation now requires deterministic event ID, stable user/task identity markers, a hash of immutable approved content, and actual event title/start/end. A replacement request UUID is not the external identity. Changed content or timezone still conflicts. Regression tests cover the full reconnect transition; actual browser smoke recovered the same event ID after reconnect, without retaining local provider snapshots.
3. **Already-invalid tokens could block local deletion forever.** Revocation now accepts only a fully read, size-bounded HTTP 400 JSON object with `error` exactly `invalid_token` as definitive prior revocation. Lost responses, transport failure, 5xx, other 400 errors, malformed or oversized JSON remain failures and retain data for retry. Local HTTP regressions cover lost success followed by definitive invalid-token retry and reject the ambiguous cases.

The reviewer supplied the initial findings only and did not re-audit the edits. Remediation verification is performed by the central test runner, with results in the P0 evidence record.

## Other exercised boundaries

- Opaque session credentials are hashed in PostgreSQL and sent only in HttpOnly cookies; session rotation, expiry, logout, CSRF, exact Origin, and cross-user API isolation have regression tests.
- OAuth state is hashed, expiring, single-use, and bound to the initiating browser; PKCE and identity-token issuer/audience/nonce/email verification and account allowlist are checked.
- AES-256-GCM encrypts provider tokens and PKCE with purpose/identity authenticated context. Encryption and decryption explicitly require a 16-byte authentication tag; the existing `v1:IV:tag:ciphertext` envelope remains unchanged. Tamper, wrong-context, legacy-envelope compatibility, and non-16-byte tag rejection regressions passed; private keys/tokens are not checked into fixtures.
- Google request URLs are restricted to configured Gmail `users/me` and primary Calendar resources, redirects are rejected, and provider failures/timeouts become safe stable errors.
- Task approval is locked and atomic. Calendar writes are separately confirmed and use deterministic IDs; concurrent and uncertain-response retries have real local HTTP/database coverage.
- Browser 401 handling clears private drafts/query cache and suppresses late old-session responses. Actual Chrome exposed a native `fetch` receiver issue missed by mocks; binding the default fetch receiver fixed it, with a receiver-aware regression.
- OpenAI has no tools, strict structured output, exact quote validation, conservative deadline checks, and an explicit `OPENAI_ENABLED=false` cost gate. No paid request was made.

## Residual external gates

All-four-user Google acceptance, deployment HTTPS/same-site cookie behavior, live provider refresh/revocation, and paid model evaluation remain external gates. Reminder scope is resolved as metadata-only under SRS FR-17; no notification delivery is promised. Production hosting must ensure infrastructure/access logs do not retain OAuth callback URLs or private request headers. The historical limited credential-pattern scan is superseded for candidate files by the dedicated gate above, not by a claim of historical or deployed security coverage.
