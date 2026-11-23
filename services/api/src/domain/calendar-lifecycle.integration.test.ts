import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify, { type FastifyInstance } from "fastify";
import pg from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { upcomingCalendarResponseSchema } from "@action-inbox/contracts";
import { registerAuth } from "../auth/index.js";
import { connectionIdentity } from "../auth/google.js";
import { csrfToken, TokenCipher } from "../auth/crypto.js";
import { issueSession } from "../auth/sessions.js";
import { readConfiguration } from "../config.js";
import { migrate } from "../db/migrate.js";
import { ApiFailure, type ServerConfig } from "../runtime.js";
import { registerDomain } from "./index.js";

const connectionString = process.env.TEST_DATABASE_URL;

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!connectionString)(
  "Calendar lifecycle PostgreSQL and held local HTTP provider",
  () => {
    let pool: pg.Pool;
    let app: FastifyInstance;
    let provider: Server;
    let config: ServerConfig;
    let providerOrigin: string;
    let userId: string;
    let headers: Record<string, string>;
    let listStatus: number;
    let listTitle: string;
    let heldList: { entered: Deferred; released: Deferred } | undefined;
    const releases: Array<() => void> = [];

    beforeAll(async () => {
      if (!connectionString) throw new Error("TEST_DATABASE_URL required");
      await migrate(connectionString);
      pool = new pg.Pool({ connectionString });
      provider = createServer(async (request, response) => {
        const url = new URL(request.url ?? "/", providerOrigin);
        response.setHeader("content-type", "application/json");
        if (url.pathname === "/revoke" && request.method === "POST") {
          response.end("{}");
          return;
        }
        if (
          url.pathname !== "/calendar/v3/calendars/primary/events" ||
          request.method !== "GET"
        ) {
          response.writeHead(404).end("{}");
          return;
        }
        // Capture the old response before holding the real HTTP transport. New
        // lifecycle reads can complete independently while this response waits.
        const status = listStatus;
        const title = listTitle;
        const hold = heldList;
        heldList = undefined;
        if (hold) {
          hold.entered.resolve();
          await hold.released.promise;
        }
        response.writeHead(status).end(
          JSON.stringify(
            status === 200
              ? {
                  items: [
                    {
                      id: "synthetic-event",
                      summary: title,
                      start: { date: "2026-12-05" },
                      end: { date: "2026-12-06" },
                    },
                  ],
                }
              : { private: "synthetic-private-provider-failure" },
          ),
        );
      });
      await new Promise<void>((resolve) =>
        provider.listen(0, "127.0.0.1", resolve),
      );
      providerOrigin = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
      config = {
        ...readConfiguration({ NODE_ENV: "test" }).config,
        tokenEncryptionKey: randomBytes(32).toString("base64"),
        googleClientId: "synthetic-client",
        googleClientSecret: "synthetic-secret",
        googleRedirectUri: `${providerOrigin}/unused-callback`,
        googleRevokeUrl: `${providerOrigin}/revoke`,
        googleJwksUrl: `${providerOrigin}/unused-jwks`,
        calendarBaseUrl: `${providerOrigin}/calendar/v3`,
      };
    });

    async function connect() {
      const id = randomUUID();
      const cipher = new TokenCipher(config.tokenEncryptionKey!);
      const identity = connectionIdentity({
        id,
        user_id: userId,
        google_subject: userId,
      });
      await pool.query(
        `INSERT INTO google_connections(id,user_id,google_subject,access_token_encrypted,refresh_token_encrypted,access_token_expires_at,scopes)
         VALUES ($1,$2,$3,$4,$5,now()+interval '1 hour',ARRAY['openid','https://www.googleapis.com/auth/calendar.events'])`,
        [
          id,
          userId,
          userId,
          cipher.encrypt("synthetic-access", identity, "google-access"),
          cipher.encrypt("synthetic-refresh", identity, "google-refresh"),
        ],
      );
      const session = await issueSession(pool, userId);
      headers = {
        origin: config.webOrigin,
        cookie: `ai_session=${session.credential}`,
        "x-csrf-token": csrfToken(session.credential),
      };
      return id;
    }

    beforeEach(async () => {
      listStatus = 200;
      listTitle = "Original lifecycle A";
      heldList = undefined;
      userId = randomUUID();
      await pool.query(
        "INSERT INTO users(id,email,display_name,timezone) VALUES ($1,$2,'Synthetic Calendar','UTC')",
        [userId, `${userId}@example.test`],
      );
      await connect();
      app = Fastify({ logger: false });
      app.setErrorHandler((error, request, reply) => {
        const failure =
          error instanceof ApiFailure
            ? error
            : new ApiFailure(500, "INTERNAL_ERROR", "Request failed.");
        void reply.code(failure.status).send({
          code: failure.code,
          message: failure.message,
          requestId: request.id,
        });
      });
      const runtime = {
        pool,
        config,
        ...(await registerAuth(app, pool, config)),
      };
      await registerDomain(app, runtime);
    });

    afterEach(async () => {
      for (const release of releases.splice(0)) release();
      await app?.close();
      await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    });

    afterAll(async () => {
      provider.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        provider.close((error) => (error ? reject(error) : resolve())),
      );
      await pool.end();
    });

    function upcoming() {
      return app.inject({ url: "/v1/calendar/upcoming", headers });
    }

    function holdNextList() {
      const entered = deferred();
      const released = deferred();
      heldList = { entered, released };
      releases.push(released.resolve);
      return { entered: entered.promise, release: released.resolve };
    }

    async function snapshot() {
      return (
        await pool.query(
          "SELECT items,last_successful_fetch_at,error,updated_at FROM calendar_snapshots WHERE user_id=$1",
          [userId],
        )
      ).rows;
    }

    async function disconnect() {
      const response = await app.inject({
        method: "POST",
        url: "/v1/connections/google/disconnect",
        headers,
        payload: {},
      });
      expect(response.statusCode).toBe(200);
      expect(await snapshot()).toEqual([]);
    }

    it.each([
      { oldStatus: 200, replacement: "empty" },
      { oldStatus: 503, replacement: "empty" },
      { oldStatus: 200, replacement: "success" },
      { oldStatus: 503, replacement: "success" },
      { oldStatus: 200, replacement: "error" },
      { oldStatus: 503, replacement: "error" },
    ])(
      "rejects held lifecycle A HTTP $oldStatus after reconnect B with $replacement snapshot",
      async ({ oldStatus, replacement }) => {
        const seeded = await upcoming();
        expect(seeded.statusCode).toBe(200);
        listStatus = oldStatus;
        const held = holdNextList();
        // Start injection explicitly: its thenable otherwise waits for await.
        const pending = upcoming().then((response) => response);
        try {
          await held.entered;
          // These must complete before releasing HTTP; no user lock may span
          // the slow provider read. Disconnect uses the real revoke/purge route.
          await disconnect();
          const connectionB = await connect();
          listTitle = "Replacement lifecycle B";
          listStatus = 200;
          if (replacement !== "empty") {
            const current = upcomingCalendarResponseSchema.parse(
              (await upcoming()).json(),
            );
            expect(current.items[0]?.title).toBe("Replacement lifecycle B");
            if (replacement === "error") {
              listStatus = 429;
              expect((await upcoming()).json()).toMatchObject({
                error: { code: "RATE_LIMITED" },
              });
            }
          }
          const before = await snapshot();
          held.release();
          const stale = await pending;
          // Compare the database before the response assertion so the baseline
          // failure proves stale persistence, not only an HTTP status change.
          expect(await snapshot()).toEqual(before);
          expect(stale.statusCode).toBe(401);
          expect(stale.json()).toMatchObject({
            code: "GOOGLE_RECONNECT_REQUIRED",
          });
          expect(stale.body).not.toContain("Original lifecycle A");
          expect(
            (
              await pool.query(
                "SELECT id FROM google_connections WHERE user_id=$1",
                [userId],
              )
            ).rows[0]?.id,
          ).toBe(connectionB);
        } finally {
          held.release();
          await pending;
        }
      },
    );

    it.each([200, 503])(
      "does not recreate a snapshot after disconnect without reconnect for HTTP %s",
      async (oldStatus) => {
        await upcoming();
        listStatus = oldStatus;
        const held = holdNextList();
        const pending = upcoming().then((response) => response);
        try {
          await held.entered;
          await disconnect();
          held.release();
          const stale = await pending;
          expect(await snapshot()).toEqual([]);
          expect(stale.statusCode).toBe(401);
          expect(stale.json()).toMatchObject({
            code: "GOOGLE_RECONNECT_REQUIRED",
          });
        } finally {
          held.release();
          await pending;
        }
      },
    );

    it("preserves the same lifecycle's latest success when a held read fails", async () => {
      listStatus = 503;
      const held = holdNextList();
      const pending = upcoming().then((response) => response);
      try {
        await held.entered;
        listStatus = 200;
        listTitle = "Newer same-lifecycle success";
        const success = upcomingCalendarResponseSchema.parse(
          (await upcoming()).json(),
        );
        expect(success.error).toBeNull();
        held.release();
        const failed = await pending;
        expect(failed.statusCode).toBe(200);
        const retained = upcomingCalendarResponseSchema.parse(failed.json());
        expect(retained.items).toEqual(success.items);
        expect(retained.lastSuccessfulFetchAt).toBe(
          success.lastSuccessfulFetchAt,
        );
        expect(retained.error?.code).toBe("GOOGLE_UNAVAILABLE");
        expect(failed.body).not.toContain("synthetic-private-provider-failure");
        expect((await snapshot())[0]).toMatchObject({
          items: success.items,
          error: retained.error,
        });
      } finally {
        held.release();
        await pending;
      }
    });
  },
);
