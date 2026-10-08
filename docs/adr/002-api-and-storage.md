# ADR-002: API construction and PostgreSQL boundary

Status: accepted for the local implementation baseline, 2026-10-07.

## Context

The API must be testable without opening sockets or requiring provider secrets. PostgreSQL must enforce identity and OAuth-state invariants independently of application code.

## Decision

Use Fastify 5 with a pure application factory; startup alone reads environment and binds a socket. `GET /v1/health` is process liveness, not database/provider readiness, and uses the existing shared Zod response contract. It does not imply P0 integration success. Production request logging is disabled by default; no request URLs, bodies, authorization headers, or provider errors are logged.

Use Drizzle PostgreSQL tables and checked-in SQL migrations. User emails are trimmed lowercase with database uniqueness. One Google connection belongs to one user, and a Google subject belongs to only one connection. Store tokens and PKCE verifier only as authenticated encrypted envelopes (AES-256-GCM version, nonce, tag, ciphertext); store only SHA-256 state hashes. OAuth state expires and can be consumed once using a conditional atomic update in the later OAuth service. Foreign keys cascade account deletion. The initial SQL migration is transactional and tracked by the migration runner.

## Alternatives rejected

An import-time listening server impedes injection tests. A fake database health response misrepresents readiness. Plaintext token or PKCE storage weakens database-compromise protection. Client-supplied identity is not an authorization boundary.

## Consequences and verification

The health slice runs without a database; database-backed features require an explicitly configured PostgreSQL URL. Injection tests validate liveness and response isolation; database integration tests will exercise constraints against an actual local PostgreSQL instance before claiming migration runtime evidence. Tests and runtime smoke are centrally executed after parallel edits; no passing result is claimed here.
