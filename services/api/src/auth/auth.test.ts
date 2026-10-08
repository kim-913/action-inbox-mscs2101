import { randomBytes, randomUUID } from "node:crypto";
import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionResponseSchema } from "@action-inbox/contracts";
import { readConfiguration } from "../config.js";
import { migrate } from "../db/migrate.js";
import { registerPipeline } from "../pipeline/index.js";
import {
  ApiFailure,
  authenticatedUser,
  type GoogleGateway,
  type ServerConfig,
} from "../runtime.js";
import { registerAuth } from "./index.js";
import { sha256 } from "./crypto.js";
import {
  createGoogleTestProvider,
  type GoogleTestState,
  type TestAuthorization,
} from "./provider.test-support.js";

interface Browser {
  cookie: string;
  csrf: string;
  hash: string;
}
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "browser OAuth with PostgreSQL and a local HTTP provider",
  () => {
    let pool: pg.Pool;
    let app: FastifyInstance;
    let provider: FastifyInstance;
    let config: ServerConfig;
    let google: GoogleGateway;
    const runId = randomUUID();
    const approvedEmail = `${runId}@example.test`;
    const subject = `subject-${runId}`;
    const sessions = new Set<string>();
    const states = new Set<string>();
    let providerState: GoogleTestState;
    let failInitialSync = false;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error("TEST_DATABASE_URL required");
      await migrate(databaseUrl);
      pool = new pg.Pool({ connectionString: databaseUrl });
      const local = await createGoogleTestProvider({
        email: approvedEmail,
        subject,
        redirectUri: "http://127.0.0.1:3000/v1/auth/google/callback",
        configure(provider) {
          provider.get("/gmail/v1/users/me/messages", () => ({ messages: [] }));
          provider.get(
            "/gmail/v1/users/me/messages/missing",
            (_request, reply) => reply.code(404).send({ error: "private" }),
          );
          provider.get(
            "/gmail/v1/users/me/messages/redirect",
            (_request, reply) => reply.redirect("http://untrusted.invalid/"),
          );
          provider.post(
            "/calendar/v3/calendars/primary/events",
            (_request, reply) => reply.code(409).send({ error: "private" }),
          );
        },
      });
      provider = local.app;
      providerState = local.state;
      config = {
        ...readConfiguration({}).config,
        ...local.config,
        tokenEncryptionKey: randomBytes(32).toString("base64"),
        gmailBaseUrl: `${local.origin}/gmail/v1`,
        calendarBaseUrl: `${local.origin}/calendar/v3`,
      };
      app = Fastify({ logger: false });
      app.setErrorHandler((error, _request, reply) => {
        if (error instanceof ApiFailure)
          return reply
            .code(error.status)
            .send({ code: error.code, message: error.message });
        return reply.code(500).send({ code: "INTERNAL_ERROR" });
      });
      const auth = await registerAuth(app, pool, config, (client, userId) => {
        if (failInitialSync)
          throw new ApiFailure(503, "INTERNAL_ERROR", "Import is unavailable.");
        return pipeline.enqueue(client, userId);
      });
      const pipeline = await registerPipeline(app, { pool, config, ...auth });
      app.addHook("onClose", () => pipeline.close());
      google = auth.google;
      app.post("/protected", { preHandler: auth.requireUser }, (request) => ({
        userId: authenticatedUser(request),
      }));
      await app.ready();
    }, 30_000);

    afterAll(async () => {
      if (app) await app.close();
      if (provider) await provider.close();
      if (pool) {
        await pool.query(
          "DELETE FROM oauth_states WHERE state_hash = ANY($1::text[])",
          [[...states]],
        );
        await pool.query(
          "DELETE FROM browser_sessions WHERE session_hash = ANY($1::text[])",
          [[...sessions]],
        );
        await pool.query("DELETE FROM users WHERE email = $1", [approvedEmail]);
        await pool.end();
      }
    });

    function readBrowser(response: LightMyRequestResponse): Browser {
      const raw = response.headers["set-cookie"];
      const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(";")[0];
      if (!cookie) throw new Error("Missing test browser cookie");
      const value = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
      const hash = sha256(value);
      sessions.add(hash);
      return { cookie, csrf: "", hash };
    }

    async function browser(): Promise<Browser> {
      const response = await app.inject("/v1/auth/session");
      expect(response.statusCode).toBe(200);
      expect(response.headers["set-cookie"]).toContain("HttpOnly");
      expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
      expect(response.headers["cache-control"]).toBe("no-store");
      const current = readBrowser(response);
      const info = sessionResponseSchema.parse(response.json());
      current.csrf = info.csrfToken;
      expect(info.authenticated).toBe(false);
      expect(response.body).not.toContain(current.cookie.split("=")[1]);
      return current;
    }

    function mutation(
      current: Browser,
      path: string,
      headers: Record<string, string> = {},
    ) {
      return app.inject({
        method: "POST",
        url: path,
        payload: {},
        headers: {
          cookie: current.cookie,
          origin: config.webOrigin,
          "x-csrf-token": current.csrf,
          ...headers,
        },
      });
    }

    async function start(
      current: Browser,
      overrides: Partial<TestAuthorization> = {},
    ) {
      const response = await mutation(current, "/v1/auth/google/start");
      expect(response.statusCode).toBe(200);
      const url = new URL(
        response.json<{ authorizationUrl: string }>().authorizationUrl,
      );
      const state = url.searchParams.get("state")!;
      states.add(sha256(state));
      const code = randomUUID();
      providerState.authorizations.set(code, {
        nonce: url.searchParams.get("nonce")!,
        challenge: url.searchParams.get("code_challenge")!,
        email: approvedEmail,
        subject,
        emailVerified: true,
        issuer: "https://accounts.google.com",
        audience: "local-web-client",
        ...overrides,
      });
      expect(url.searchParams.get("redirect_uri")).toBe(
        config.googleRedirectUri,
      );
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      return { state, code };
    }

    function callback(current: Browser, flow: { state: string; code: string }) {
      return app.inject({
        url: `/v1/auth/google/callback?${new URLSearchParams(flow)}`,
        headers: { cookie: current.cookie },
      });
    }

    async function login(): Promise<{ current: Browser; userId: string }> {
      const original = await browser();
      const connected = await callback(original, await start(original));
      expect(connected.statusCode).toBe(303);
      expect(connected.headers.location).toBe(
        `${config.webOrigin}/?auth=connected`,
      );
      const current = readBrowser(connected);
      const info = sessionResponseSchema.parse(
        (
          await app.inject({
            url: "/v1/auth/session",
            headers: { cookie: current.cookie },
          })
        ).json(),
      );
      current.csrf = info.csrfToken;
      expect(info.authenticated).toBe(true);
      expect(info.googleConnected).toBe(true);
      const queued = await pool.query(
        "SELECT j.data FROM sync_runs s JOIN pgboss.job j ON j.id=s.id WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 1",
        [info.user!.id],
      );
      expect(queued.rows[0]?.data).toMatchObject({ userId: info.user!.id });
      expect(current.hash).not.toBe(original.hash);
      expect(
        (
          await pool.query(
            "SELECT 1 FROM browser_sessions WHERE session_hash=$1",
            [original.hash],
          )
        ).rowCount,
      ).toBe(0);
      return { current, userId: info.user!.id };
    }

    it("rolls back connection/session changes when automatic import cannot be queued", async () => {
      const current = await browser();
      const flow = await start(current);
      failInitialSync = true;
      try {
        const response = await callback(current, flow);
        expect(response.headers.location).toContain("auth=failed");
        expect(response.headers["set-cookie"]).toBeUndefined();
        const persisted = await pool.query(
          "SELECT user_id FROM browser_sessions WHERE session_hash=$1",
          [current.hash],
        );
        expect(persisted.rows).toEqual([{ user_id: null }]);
      } finally {
        failInitialSync = false;
      }
    });

    it("bootstraps without Google credentials and fails start explicitly", async () => {
      const unconfigured = Fastify();
      unconfigured.setErrorHandler((error, _request, reply) =>
        reply.code(error instanceof ApiFailure ? error.status : 500).send({
          code: error instanceof ApiFailure ? error.code : "INTERNAL_ERROR",
        }),
      );
      await registerAuth(unconfigured, pool, readConfiguration({}).config);
      try {
        const response = await unconfigured.inject("/v1/auth/session");
        const current = readBrowser(response);
        const info = sessionResponseSchema.parse(response.json());
        const result = await unconfigured.inject({
          method: "POST",
          url: "/v1/auth/google/start",
          payload: {},
          headers: {
            cookie: current.cookie,
            origin: config.webOrigin,
            "x-csrf-token": info.csrfToken,
          },
        });
        expect(result.statusCode).toBe(503);
        expect(result.json()).toEqual({ code: "PROVIDER_NOT_CONFIGURED" });
      } finally {
        await unconfigured.close();
      }
    });

    it("sets host-only Secure cookies in production and never revives expired sessions", async () => {
      const production = Fastify();
      await registerAuth(production, pool, {
        ...readConfiguration({}).config,
        production: true,
      });
      try {
        const response = await production.inject("/v1/auth/session");
        expect(response.headers["set-cookie"]).toContain("__Host-ai_session=");
        expect(response.headers["set-cookie"]).toContain("Secure");
        expect(response.headers["set-cookie"]).not.toContain("Domain=");
        readBrowser(response);
      } finally {
        await production.close();
      }
      const current = await browser();
      await pool.query(
        "UPDATE browser_sessions SET created_at=now()-interval '2 hours', expires_at=now()-interval '1 hour' WHERE session_hash=$1",
        [current.hash],
      );
      expect((await mutation(current, "/v1/auth/refresh")).statusCode).toBe(
        401,
      );
      const renewed = await app.inject({
        url: "/v1/auth/session",
        headers: { cookie: current.cookie },
      });
      const replacement = readBrowser(renewed);
      expect(replacement.hash).not.toBe(current.hash);
      expect(sessionResponseSchema.parse(renewed.json()).authenticated).toBe(
        false,
      );
    });

    it("requires exact Origin and browser CSRF even for login initiation", async () => {
      const current = await browser();
      const invalidHeaders: Record<string, string>[] = [
        { origin: "https://untrusted.example" },
        { origin: "null" },
        { "x-csrf-token": "wrong" },
      ];
      for (const headers of invalidHeaders) {
        const response = await mutation(
          current,
          "/v1/auth/google/start",
          headers,
        );
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ code: "CSRF_INVALID" });
      }
      const missingOrigin = await app.inject({
        method: "POST",
        url: "/v1/auth/google/start",
        payload: {},
        headers: { cookie: current.cookie, "x-csrf-token": current.csrf },
      });
      expect(missingOrigin.statusCode).toBe(403);
      expect((await mutation(current, "/protected")).statusCode).toBe(401);
    });

    it("binds state to the initiating browser and consumes it exactly once", async () => {
      const first = await browser();
      const other = await browser();
      const flow = await start(first);
      const before = providerState.exchangeCalls;
      expect((await callback(other, flow)).headers.location).toContain(
        "auth=failed",
      );
      expect(providerState.exchangeCalls).toBe(before);
      const results = await Promise.all([
        callback(first, flow),
        callback(first, flow),
      ]);
      expect(
        results.map((response) => response.headers.location).sort(),
      ).toEqual([
        `${config.webOrigin}/?auth=connected`,
        `${config.webOrigin}/?auth=failed`,
      ]);
      const connected = results.find(
        (response) => response.headers["set-cookie"],
      );
      if (connected) readBrowser(connected);
      expect(providerState.exchangeCalls).toBe(before + 1);
    });

    it("rejects expired states and consumes a denial without exchanging a code", async () => {
      const current = await browser();
      const expired = await start(current);
      await pool.query(
        "UPDATE oauth_states SET created_at=now()-interval '20 minutes', expires_at=now()-interval '10 minutes' WHERE state_hash=$1",
        [sha256(expired.state)],
      );
      const before = providerState.exchangeCalls;
      expect((await callback(current, expired)).headers.location).toContain(
        "auth=failed",
      );
      const denied = await start(current);
      const response = await app.inject({
        url: `/v1/auth/google/callback?state=${denied.state}&error=access_denied&error_description=private`,
        headers: { cookie: current.cookie },
      });
      expect(response.headers.location).toBe(
        `${config.webOrigin}/?auth=denied`,
      );
      expect((await callback(current, denied)).headers.location).toContain(
        "auth=failed",
      );
      expect(providerState.exchangeCalls).toBe(before);
    });

    it("verifies signed issuer, audience, nonce, verified email and the configured allowlist", async () => {
      const invalidIdentities: Partial<TestAuthorization>[] = [
        { nonce: "wrong" },
        { issuer: "https://untrusted.example" },
        { audience: "other-client" },
        { emailVerified: false },
        { email: "not-approved@example.test" },
      ];
      for (const overrides of invalidIdentities) {
        const current = await browser();
        const response = await callback(
          current,
          await start(current, overrides),
        );
        expect(response.headers.location).toBe(
          `${config.webOrigin}/?auth=${"email" in overrides ? "denied" : "failed"}`,
        );
        expect(response.headers["set-cookie"]).toBeUndefined();
      }
    });

    it("rotates session and CSRF atomically and invalidates logout", async () => {
      const { current, userId } = await login();
      const identity = await app.inject({
        method: "POST",
        url: "/protected?userId=untrusted",
        payload: { userId: "untrusted" },
        headers: {
          cookie: current.cookie,
          origin: config.webOrigin,
          "x-csrf-token": current.csrf,
        },
      });
      expect(identity.json()).toEqual({ userId });
      const responses = await Promise.all([
        mutation(current, "/v1/auth/refresh"),
        mutation(current, "/v1/auth/refresh"),
      ]);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([
        200, 401,
      ]);
      const response = responses.find((value) => value.statusCode === 200)!;
      const next = readBrowser(response);
      next.csrf = sessionResponseSchema.parse(response.json()).csrfToken;
      expect(next.csrf).not.toBe(current.csrf);
      expect((await mutation(current, "/protected")).statusCode).toBe(401);
      expect(
        (await mutation(next, "/protected", { "x-csrf-token": current.csrf }))
          .statusCode,
      ).toBe(403);
      expect((await mutation(next, "/v1/auth/logout")).statusCode).toBe(200);
      expect((await mutation(next, "/protected")).statusCode).toBe(401);
    });

    it("keeps the Google subject after disconnect removes the credential connection", async () => {
      const { current, userId } = await login();
      await pool.query("DELETE FROM google_connections WHERE user_id=$1", [
        userId,
      ]);
      expect(
        (
          await callback(
            current,
            await start(current, { subject: "different-google-account" }),
          )
        ).headers.location,
      ).toContain("auth=failed");
      const reconnected = await login();
      expect(reconnected.userId).toBe(userId);
    });

    it("does not merge a different subject into an existing signed-in account", async () => {
      const { current, userId } = await login();
      const mismatch = await callback(
        current,
        await start(current, { subject: "different-google-account" }),
      );
      expect(mismatch.headers.location).toContain("auth=failed");
      expect(
        (
          await pool.query("SELECT google_subject FROM users WHERE id=$1", [
            userId,
          ])
        ).rows[0].google_subject,
      ).toBe(subject);
      const anonymous = await browser();
      expect(
        (
          await callback(
            anonymous,
            await start(anonymous, { subject: "different-google-account" }),
          )
        ).headers.location,
      ).toContain("auth=failed");
    });

    it("serializes refresh, preserves omitted refresh tokens and rejects identity changes", async () => {
      const { userId } = await login();
      const stored = (
        await pool.query(
          "UPDATE google_connections SET access_token_expires_at=now()-interval '1 minute' WHERE user_id=$1 RETURNING refresh_token_encrypted",
          [userId],
        )
      ).rows[0].refresh_token_encrypted;
      const before = providerState.refreshes;
      const url = `${config.gmailBaseUrl}/users/me/messages`;
      expect(
        await Promise.all([
          google.request(userId, url),
          google.request(userId, url),
        ]),
      ).toEqual([{ messages: [] }, { messages: [] }]);
      expect(providerState.refreshes).toBe(before + 1);
      expect(
        (
          await pool.query(
            "SELECT refresh_token_encrypted FROM google_connections WHERE user_id=$1",
            [userId],
          )
        ).rows[0].refresh_token_encrypted,
      ).toBe(stored);
      await pool.query(
        "UPDATE google_connections SET access_token_expires_at=now()-interval '1 minute' WHERE user_id=$1",
        [userId],
      );
      providerState.refreshSubject = "different-google-account";
      try {
        await expect(google.request(userId, url)).rejects.toMatchObject({
          code: "OAUTH_INVALID",
        });
      } finally {
        providerState.refreshSubject = subject;
      }
    });

    it("restricts resource URLs, sanitizes provider failures and requires real successful revocation", async () => {
      const { userId } = await login();
      for (const url of [
        "https://untrusted.example/messages",
        `${config.gmailBaseUrl}/users/other/messages`,
        `${config.calendarBaseUrl}/calendars/other/events`,
      ]) {
        await expect(google.request(userId, url)).rejects.toMatchObject({
          code: "INVALID_REQUEST",
        });
      }
      await expect(
        google.request(
          userId,
          `${config.gmailBaseUrl}/users/me/messages/missing`,
        ),
      ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
      await expect(
        google.request(
          userId,
          `${config.calendarBaseUrl}/calendars/primary/events`,
          { method: "POST" },
        ),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
      await expect(
        google.request(
          userId,
          `${config.gmailBaseUrl}/users/me/messages/redirect`,
        ),
      ).rejects.toMatchObject({ code: "GOOGLE_UNAVAILABLE" });
      const abort = new AbortController();
      abort.abort();
      await expect(
        google.request(userId, `${config.gmailBaseUrl}/users/me/messages`, {
          signal: abort.signal,
        }),
      ).rejects.toMatchObject({ code: "GOOGLE_UNAVAILABLE" });
      const before = providerState.revocations;
      providerState.revokeFails = true;
      try {
        await expect(google.revoke(userId)).rejects.toMatchObject({
          code: "GOOGLE_UNAVAILABLE",
          message: "Google access could not be revoked. Try again.",
        });
        expect(
          (
            await pool.query(
              "SELECT revoked_at FROM google_connections WHERE user_id=$1",
              [userId],
            )
          ).rows[0].revoked_at,
        ).toBeNull();
      } finally {
        providerState.revokeFails = false;
      }
      await google.revoke(userId);
      expect(providerState.revocations).toBe(before + 2);
      expect(
        (
          await pool.query(
            "SELECT revoked_at FROM google_connections WHERE user_id=$1",
            [userId],
          )
        ).rows[0].revoked_at,
      ).not.toBeNull();
      await google.revoke(userId);
      expect(providerState.revocations).toBe(before + 2);
    });

    it("finishes revocation when a lost successful response is retried as invalid_token", async () => {
      const { userId } = await login();
      const before = providerState.revocations;
      providerState.revokeResponse = "lose-success";
      try {
        await expect(google.revoke(userId)).rejects.toMatchObject({
          code: "GOOGLE_UNAVAILABLE",
        });
        expect(providerState.revokeResponse).toBe("invalid-token");
        expect(
          (
            await pool.query(
              "SELECT revoked_at FROM google_connections WHERE user_id=$1",
              [userId],
            )
          ).rows[0].revoked_at,
        ).toBeNull();
        await google.revoke(userId);
        expect(
          (
            await pool.query(
              "SELECT revoked_at FROM google_connections WHERE user_id=$1",
              [userId],
            )
          ).rows[0].revoked_at,
        ).not.toBeNull();
        expect(providerState.revocations).toBe(before + 2);
        await google.revoke(userId);
        expect(providerState.revocations).toBe(before + 2);
      } finally {
        providerState.revokeResponse = "normal";
      }
    });

    it("retains credentials for other, malformed, or oversized revocation errors", async () => {
      const { userId } = await login();
      try {
        for (const mode of [
          "other-400",
          "malformed-400",
          "oversized-400",
        ] as const) {
          providerState.revokeResponse = mode;
          await expect(google.revoke(userId)).rejects.toMatchObject({
            code: "GOOGLE_UNAVAILABLE",
            message: "Google access could not be revoked. Try again.",
          });
          const connection = (
            await pool.query(
              "SELECT revoked_at, refresh_token_encrypted FROM google_connections WHERE user_id=$1",
              [userId],
            )
          ).rows[0];
          expect(connection.revoked_at).toBeNull();
          expect(connection.refresh_token_encrypted).toMatch(/^v1:/);
        }
      } finally {
        providerState.revokeResponse = "normal";
      }
    });
  },
);
