import { randomBytes, randomUUID } from "node:crypto";
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
  vi,
} from "vitest";
import {
  apiErrorSchema,
  apiRoutes,
  canvasConnectionSchema,
  canvasItemsResponseSchema,
  canvasRoutes,
  type CanvasItem,
} from "@action-inbox/contracts";
import { registerAuth } from "../auth/index.js";
import { csrfToken, TokenCipher } from "../auth/crypto.js";
import { issueSession, sessionCookieName } from "../auth/sessions.js";
import { readConfiguration } from "../config.js";
import { migrate } from "../db/migrate.js";
import { registerAccount } from "../domain/account.js";
import { ApiFailure, type ServerConfig } from "../runtime.js";
import { registerCanvas } from "./index.js";
import type { CanvasFeedReader } from "./feed.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const feedUrl =
  "https://sofia.instructure.com/feeds/calendars/user_synthetic-secret-abc.ics";
const otherFeedUrl =
  "https://sofia.instructure.com/feeds/calendars/user_other-secret-def.ics";

interface Browser {
  userId: string;
  cookie: string;
  csrf: string;
}

function item(id: string, date = "2026-10-08T12:00:00.000Z"): CanvasItem {
  return {
    id,
    kind: "Assignment",
    title: `Assignment ${id}`,
    description: "Read the course material.",
    sourceUrl: "https://sofia.instructure.com/courses/1/assignments/1",
    start: { value: date, kind: "instant", timeZone: "UTC" },
    end: null,
    cancelled: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

describe.skipIf(!databaseUrl)(
  "Canvas subscriptions with PostgreSQL and real browser guards",
  () => {
    let pool: pg.Pool;
    let app: FastifyInstance;
    let config: ServerConfig;
    let own: Browser;
    let other: Browser;
    let reader = vi.fn<CanvasFeedReader>();
    const users = new Set<string>();
    const sessions = new Set<string>();

    beforeAll(async () => {
      if (!databaseUrl) throw new Error("TEST_DATABASE_URL required");
      await migrate(databaseUrl);
      pool = new pg.Pool({ connectionString: databaseUrl });
      config = {
        ...readConfiguration({}).config,
        tokenEncryptionKey: randomBytes(32).toString("base64"),
      };
      app = Fastify({ logger: false });
      app.setErrorHandler((error, request, reply) => {
        return reply
          .code(error instanceof ApiFailure ? error.status : 500)
          .send({
            code: error instanceof ApiFailure ? error.code : "INTERNAL_ERROR",
            message:
              error instanceof ApiFailure
                ? error.message
                : "The request could not be completed.",
            requestId: request.id,
          });
      });
      const auth = await registerAuth(app, pool, config);
      const runtime = { pool, config, ...auth };
      registerCanvas(app, runtime, (url) => reader(url));
      registerAccount(app, runtime);
      await app.ready();
    });

    async function browser(): Promise<Browser> {
      const userId = randomUUID();
      users.add(userId);
      await pool.query(
        "INSERT INTO users(id,email,display_name) VALUES($1,$2,'Canvas test')",
        [userId, `${userId}@example.invalid`],
      );
      const issued = await issueSession(pool, userId);
      sessions.add(issued.session.session_hash);
      return {
        userId,
        cookie: `${sessionCookieName(config)}=${issued.credential}`,
        csrf: csrfToken(issued.credential),
      };
    }

    beforeEach(async () => {
      reader = vi
        .fn<CanvasFeedReader>()
        .mockResolvedValue([item("b"), item("a")]);
      own = await browser();
      other = await browser();
    });

    afterEach(async () => {
      await pool.query(
        "DELETE FROM browser_sessions WHERE session_hash=ANY($1::text[])",
        [[...sessions]],
      );
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
        [...users],
      ]);
      sessions.clear();
      users.clear();
    });

    afterAll(async () => {
      await app?.close();
      await pool?.end();
    });

    function mutationHeaders(current: Browser) {
      return {
        cookie: current.cookie,
        origin: config.webOrigin,
        "x-csrf-token": current.csrf,
      };
    }

    function connect(current = own, url = feedUrl) {
      return app.inject({
        method: "POST",
        url: canvasRoutes.connection,
        headers: mutationHeaders(current),
        payload: { feedUrl: url },
      });
    }

    function refresh(current = own) {
      return app.inject({
        method: "POST",
        url: canvasRoutes.refresh,
        headers: mutationHeaders(current),
        payload: {},
      });
    }

    function disconnect(current = own) {
      return app.inject({
        method: "DELETE",
        url: canvasRoutes.connection,
        headers: mutationHeaders(current),
      });
    }

    async function connection(current = own) {
      const response = await app.inject({
        url: canvasRoutes.connection,
        headers: { cookie: current.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      return canvasConnectionSchema.parse(response.json());
    }

    async function items(current = own, query = "") {
      const response = await app.inject({
        url: `${canvasRoutes.items}${query}`,
        headers: { cookie: current.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      return canvasItemsResponseSchema.parse(response.json());
    }

    it("filters native dates and overlapping events before snapshot pagination without refreshing", async () => {
      const date = (value: string) => ({
        kind: "date" as const,
        value,
        timeZone: null,
      });
      const snapshot: CanvasItem[] = [
        item("a-outdated", "2026-10-01T12:00:00Z"),
        {
          ...item("b-ended"),
          kind: "Event",
          start: date("2026-10-01"),
          end: date("2026-10-08"),
        },
        {
          ...item("c-overlap"),
          kind: "Event",
          start: date("2026-10-07"),
          end: date("2026-10-09"),
        },
        { ...item("d-native"), start: date("2026-10-08") },
        item("e-instant", "2026-10-08T07:00:00Z"),
        item("f-end", "2026-10-10T07:00:00Z"),
        { ...item("g-date-end"), start: date("2026-10-10") },
        { ...item("h-undated"), start: null },
        {
          ...item("i-overlap"),
          kind: "Event",
          start: {
            kind: "instant",
            value: "2026-10-08T06:00:00Z",
            timeZone: "UTC",
          },
          end: {
            kind: "instant",
            value: "2026-10-08T08:00:00Z",
            timeZone: "UTC",
          },
        },
      ];
      reader.mockResolvedValueOnce(snapshot);
      expect((await connect()).statusCode).toBe(200);
      const query = new URLSearchParams({
        startAt: "2026-10-08T00:00:00-07:00",
        endAt: "2026-10-10T00:00:00-07:00",
        startDate: "2026-10-08",
        endDate: "2026-10-10",
        limit: "1",
      });
      const first = await items(own, `?${query}`);
      expect(first.items.map((entry) => entry.id)).toEqual(["c-overlap"]);
      const found = [...first.items];
      let cursor = first.nextCursor;
      while (cursor) {
        query.set("cursor", cursor);
        const page = await items(own, `?${query}`);
        found.push(...page.items);
        cursor = page.nextCursor;
      }
      expect(found.map((entry) => entry.id)).toEqual([
        "c-overlap",
        "d-native",
        "e-instant",
        "i-overlap",
      ]);
      query.set("cursor", first.nextCursor!);
      query.set("endDate", "2026-10-11");
      expect(
        (
          await app.inject({
            url: `${canvasRoutes.items}?${query}`,
            headers: { cookie: own.cookie },
          })
        ).statusCode,
      ).toBe(400);
      expect((await items()).items).toHaveLength(snapshot.length);
      expect((await connection()).itemCount).toBe(snapshot.length);
      expect(reader).toHaveBeenCalledTimes(1);
      expect(
        (
          await app.inject({
            url: `${canvasRoutes.items}?startDate=2026-10-08`,
            headers: { cookie: own.cookie },
          })
        ).statusCode,
      ).toBe(400);
    });

    it("requires a signed-in browser and exact Origin plus CSRF for every mutation", async () => {
      for (const url of [canvasRoutes.connection, canvasRoutes.items]) {
        expect((await app.inject(url)).statusCode).toBe(401);
      }
      const anonymous = await issueSession(pool, null);
      sessions.add(anonymous.session.session_hash);
      for (const [method, url] of [
        ["POST", canvasRoutes.connection],
        ["POST", canvasRoutes.refresh],
        ["DELETE", canvasRoutes.connection],
      ] as const) {
        const payload =
          method === "DELETE"
            ? undefined
            : url === canvasRoutes.connection
              ? { feedUrl }
              : {};
        const unauthenticated = await app.inject({
          method,
          url,
          ...(payload === undefined ? {} : { payload }),
          headers: { origin: config.webOrigin },
        });
        expect(unauthenticated.statusCode).toBe(401);
        const anonymousResponse = await app.inject({
          method,
          url,
          ...(payload === undefined ? {} : { payload }),
          headers: {
            origin: config.webOrigin,
            cookie: `${sessionCookieName(config)}=${anonymous.credential}`,
            "x-csrf-token": csrfToken(anonymous.credential),
          },
        });
        expect(anonymousResponse.statusCode).toBe(401);
        for (const headers of [
          { cookie: own.cookie, origin: config.webOrigin },
          { cookie: own.cookie, "x-csrf-token": own.csrf },
          { ...mutationHeaders(own), "x-csrf-token": "incorrect" },
          {
            ...mutationHeaders(own),
            origin: `${config.webOrigin}.untrusted.invalid`,
          },
        ]) {
          const response = await app.inject({
            method,
            url,
            ...(payload === undefined ? {} : { payload }),
            headers,
          });
          expect(response.statusCode).toBe(403);
          expect(apiErrorSchema.parse(response.json()).code).toBe(
            "CSRF_INVALID",
          );
        }
      }
      expect(reader).not.toHaveBeenCalled();
      expect((await connection()).connected).toBe(false);
    });

    it("imports once, encrypts the URL with user and connection AAD, and isolates metadata and items", async () => {
      const response = await connect();
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      const connected = canvasConnectionSchema.parse(response.json());
      expect(connected).toMatchObject({
        connected: true,
        status: "Ready",
        itemCount: 2,
        error: null,
        refreshPolicy: "Manual",
      });
      expect(connected.lastSuccessfulFetchAt).not.toBeNull();
      expect(response.body).not.toContain(feedUrl);
      expect(response.body).not.toContain("synthetic-secret");
      expect(reader).toHaveBeenCalledExactlyOnceWith(feedUrl);
      const stored = await pool.query<{
        id: string;
        encrypted_feed_url: string;
        snapshot: CanvasItem[];
      }>(
        "SELECT id, encrypted_feed_url, snapshot FROM canvas_connections WHERE user_id=$1",
        [own.userId],
      );
      const row = stored.rows[0]!;
      expect(row.encrypted_feed_url).toMatch(/^v1:/);
      expect(row.encrypted_feed_url).not.toContain("synthetic-secret");
      const cipher = new TokenCipher(config.tokenEncryptionKey!);
      expect(
        cipher.decrypt(
          row.encrypted_feed_url,
          JSON.stringify([row.id, own.userId]),
          "canvas-feed",
        ),
      ).toBe(feedUrl);
      expect(() =>
        cipher.decrypt(
          row.encrypted_feed_url,
          JSON.stringify([row.id, other.userId]),
          "canvas-feed",
        ),
      ).toThrow();
      expect(() =>
        cipher.decrypt(
          row.encrypted_feed_url,
          JSON.stringify([randomUUID(), own.userId]),
          "canvas-feed",
        ),
      ).toThrow();
      expect(() =>
        cipher.decrypt(
          row.encrypted_feed_url,
          JSON.stringify([row.id, own.userId]),
          "google-access",
        ),
      ).toThrow();
      expect(row.snapshot.map((entry) => entry.id)).toEqual(["a", "b"]);
      expect(await connection(other)).toMatchObject({
        connected: false,
        status: "Disconnected",
        itemCount: 0,
      });
      expect(await items(other)).toEqual({
        items: [],
        nextCursor: null,
        lastSuccessfulFetchAt: null,
      });
      expect((await items()).items).toEqual([item("a"), item("b")]);
      await connection();
      expect(reader).toHaveBeenCalledTimes(1);
      const duplicate = await connect(own, otherFeedUrl);
      expect(duplicate.statusCode).toBe(409);
      expect(reader).toHaveBeenCalledTimes(1);
      expect((await refresh(other)).statusCode).toBe(409);
      expect((await disconnect(other)).statusCode).toBe(200);
      expect((await connection()).connected).toBe(true);
    });

    it("rejects an untrusted URL before persisting or fetching it", async () => {
      const response = await connect(
        own,
        "https://untrusted.invalid/secret.ics",
      );
      expect(response.statusCode).toBe(400);
      expect(apiErrorSchema.parse(response.json()).code).toBe(
        "CANVAS_FEED_INVALID",
      );
      expect(response.body).not.toContain("untrusted.invalid");
      expect(reader).not.toHaveBeenCalled();
      expect((await connection()).connected).toBe(false);
    });

    it("atomically replaces successful snapshots, including changed dates, removals and an empty feed", async () => {
      await connect();
      const initial = await items();
      await refresh();
      expect((await items()).items).toEqual(initial.items);
      reader.mockResolvedValue([
        item("a", "2026-10-20T12:00:00.000Z"),
        item("c"),
      ]);
      const changed = await refresh();
      expect(changed.statusCode).toBe(200);
      expect((await items()).items).toEqual([
        item("a", "2026-10-20T12:00:00.000Z"),
        item("c"),
      ]);
      reader.mockResolvedValue([]);
      expect(
        canvasConnectionSchema.parse((await refresh()).json()),
      ).toMatchObject({ status: "Ready", itemCount: 0 });
      expect((await items()).items).toEqual([]);
      const writes = await pool.query<{ count: string }>(
        `SELECT (
        (SELECT count(*) FROM email_messages WHERE user_id=$1) +
        (SELECT count(*) FROM tasks WHERE user_id=$1) +
        (SELECT count(*) FROM calendar_snapshots WHERE user_id=$1) +
        (SELECT count(*) FROM sync_runs WHERE user_id=$1) +
        (SELECT count(*) FROM reminders r JOIN tasks t ON t.id=r.task_id WHERE t.user_id=$1) +
        (SELECT count(*) FROM calendar_event_links c JOIN tasks t ON t.id=c.task_id WHERE t.user_id=$1)
      )::text AS count`,
        [own.userId],
      );
      expect(writes.rows[0]?.count).toBe("0");
    });

    it("retains the encrypted pending subscription after an initial failure and retries its stored URL", async () => {
      reader.mockRejectedValueOnce(new Error(`Provider failed for ${feedUrl}`));
      const failed = await connect();
      expect(failed.statusCode).toBe(200);
      const metadata = canvasConnectionSchema.parse(failed.json());
      expect(metadata).toMatchObject({
        connected: true,
        status: "Failed",
        itemCount: 0,
        lastSuccessfulFetchAt: null,
      });
      expect(metadata.error?.code).toBe("CANVAS_UNAVAILABLE");
      expect(failed.body).not.toContain("synthetic-secret");
      expect(await items()).toEqual({
        items: [],
        nextCursor: null,
        lastSuccessfulFetchAt: null,
      });
      const stored = await pool.query(
        "SELECT id, encrypted_feed_url FROM canvas_connections WHERE user_id=$1",
        [own.userId],
      );
      expect(stored.rowCount).toBe(1);
      const retry = await refresh();
      expect(canvasConnectionSchema.parse(retry.json())).toMatchObject({
        connected: true,
        status: "Ready",
        itemCount: 2,
      });
      expect(reader).toHaveBeenNthCalledWith(2, feedUrl);
      expect(
        (
          await pool.query(
            "SELECT id FROM canvas_connections WHERE user_id=$1",
            [own.userId],
          )
        ).rows[0]?.id,
      ).toBe(stored.rows[0]?.id);
    });

    it("keeps the last good snapshot and cursor on network, invalid-feed, duplicate and oversized failures", async () => {
      await connect();
      const first = await items(own, "?limit=1");
      const before = await pool.query(
        "SELECT snapshot_revision FROM canvas_connections WHERE user_id=$1",
        [own.userId],
      );
      const failures = [
        new Error(`Network error at ${feedUrl}`),
        new ApiFailure(
          502,
          "CANVAS_FEED_INVALID",
          `Malformed calendar ${feedUrl}`,
        ),
        [item("duplicate"), item("duplicate")],
        Array.from({ length: 1001 }, (_, index) => item(String(index))),
      ];
      for (const failure of failures) {
        if (failure instanceof Error) reader.mockRejectedValueOnce(failure);
        else reader.mockResolvedValueOnce(failure);
        const response = await refresh();
        expect(response.statusCode).toBe(200);
        const metadata = canvasConnectionSchema.parse(response.json());
        expect(metadata).toMatchObject({
          connected: true,
          status: "Failed",
          itemCount: 2,
          lastSuccessfulFetchAt: first.lastSuccessfulFetchAt,
        });
        expect(metadata.error?.code).toBe(
          failure instanceof Error && !(failure instanceof ApiFailure)
            ? "CANVAS_UNAVAILABLE"
            : "CANVAS_FEED_INVALID",
        );
        expect(response.body).not.toContain(feedUrl);
        expect((await items()).items).toEqual([item("a"), item("b")]);
        expect(
          (await items(own, `?limit=1&cursor=${first.nextCursor}`)).items,
        ).toEqual([item("b")]);
        const after = await pool.query(
          "SELECT snapshot_revision FROM canvas_connections WHERE user_id=$1",
          [own.userId],
        );
        expect(after.rows).toEqual(before.rows);
      }
    });

    it("does not decrypt a credential copied from another user's connection", async () => {
      await connect();
      await connect(other, otherFeedUrl);
      await pool.query(
        "UPDATE canvas_connections SET encrypted_feed_url=(SELECT encrypted_feed_url FROM canvas_connections WHERE user_id=$1) WHERE user_id=$2",
        [own.userId, other.userId],
      );
      reader.mockClear();
      const response = await refresh(other);
      expect(response.statusCode).toBe(200);
      expect(canvasConnectionSchema.parse(response.json())).toMatchObject({
        status: "Failed",
        itemCount: 2,
        error: { code: "CANVAS_UNAVAILABLE" },
      });
      expect(response.body).not.toContain("credential");
      expect(response.body).not.toContain(feedUrl);
      expect(reader).not.toHaveBeenCalled();
      expect((await connection()).status).toBe("Ready");
      expect((await items(other)).items).toEqual([item("a"), item("b")]);
    });

    it("bounds keyset pages and rejects invalid, foreign and stale snapshot cursors", async () => {
      const all = Array.from({ length: 205 }, (_, index) =>
        item(String(index).padStart(3, "0")),
      );
      reader.mockResolvedValue([...all].reverse());
      await connect();
      const first = await items(own, "?limit=100");
      expect(first.items).toEqual(all.slice(0, 100));
      expect(first.nextCursor).not.toBeNull();
      const second = await items(own, `?limit=100&cursor=${first.nextCursor}`);
      expect(second.items).toEqual(all.slice(100, 200));
      const third = await items(own, `?limit=100&cursor=${second.nextCursor}`);
      expect(third.items).toEqual(all.slice(200));
      expect(third.nextCursor).toBeNull();
      expect((await items()).items).toHaveLength(50);
      for (const query of [
        "?limit=0",
        "?limit=101",
        "?limit=1.5",
        "?cursor=",
        "?cursor=not-a-cursor",
        `?cursor=${"x".repeat(513)}`,
      ]) {
        const response = await app.inject({
          url: `${canvasRoutes.items}${query}`,
          headers: { cookie: own.cookie },
        });
        expect(response.statusCode).toBe(400);
      }
      const foreign = await app.inject({
        url: `${canvasRoutes.items}?cursor=${first.nextCursor}`,
        headers: { cookie: other.cookie },
      });
      expect(foreign.statusCode).toBe(409);
      expect(foreign.body).not.toContain("Assignment");
      const contents = JSON.parse(
        Buffer.from(first.nextCursor!, "base64url").toString("utf8"),
      ) as Record<string, unknown>;
      const invalid = Buffer.from(
        JSON.stringify({ ...contents, id: "not-in-snapshot" }),
      ).toString("base64url");
      expect(
        (
          await app.inject({
            url: `${canvasRoutes.items}?cursor=${invalid}`,
            headers: { cookie: own.cookie },
          })
        ).statusCode,
      ).toBe(400);
      await refresh();
      const stale = await app.inject({
        url: `${canvasRoutes.items}?cursor=${first.nextCursor}`,
        headers: { cookie: own.cookie },
      });
      expect(stale.statusCode).toBe(409);
      expect(apiErrorSchema.parse(stale.json()).code).toBe("CONFLICT");
      const current = await items(own, "?limit=1");
      await disconnect();
      expect(
        (
          await app.inject({
            url: `${canvasRoutes.items}?cursor=${current.nextCursor}`,
            headers: { cookie: own.cookie },
          })
        ).statusCode,
      ).toBe(409);
      expect((await disconnect()).json()).toEqual({ ok: true });
      expect(await connection()).toMatchObject({
        connected: false,
        status: "Disconnected",
        itemCount: 0,
      });
      expect(await items()).toEqual({
        items: [],
        nextCursor: null,
        lastSuccessfulFetchAt: null,
      });
      expect(reader).toHaveBeenCalledTimes(2);
    });

    it.each(["success", "failure"] as const)(
      "fences an older refresh %s after a newer refresh succeeds",
      async (outcome) => {
        await connect();
        const entered = deferred<void>();
        const held = deferred<CanvasItem[]>();
        reader.mockImplementationOnce(async () => {
          entered.resolve();
          return held.promise;
        });
        const pending = refresh().then((response) => response);
        await entered.promise;
        try {
          expect(await connection()).toMatchObject({
            status: "Refreshing",
            itemCount: 2,
          });
          expect((await items()).items).toEqual([item("a"), item("b")]);
          reader.mockResolvedValueOnce([item("new")]);
          expect(
            canvasConnectionSchema.parse((await refresh()).json()),
          ).toMatchObject({ status: "Ready", itemCount: 1 });
        } finally {
          if (outcome === "success") held.resolve([item("stale")]);
          else held.reject(new Error(`Old request failed ${feedUrl}`));
        }
        const stale = await pending;
        expect(stale.statusCode).toBe(409);
        expect(stale.body).not.toContain(feedUrl);
        expect((await items()).items).toEqual([item("new")]);
        expect(await connection()).toMatchObject({
          status: "Ready",
          error: null,
        });
      },
    );

    for (const phase of ["initial import", "refresh"] as const) {
      for (const action of [
        "disconnect",
        "reconnect",
        "account deletion",
      ] as const) {
        it.each(["success", "failure"] as const)(
          `fences stale ${phase} %s after ${action}`,
          async (outcome) => {
            if (phase === "refresh") await connect();
            const entered = deferred<void>();
            const held = deferred<CanvasItem[]>();
            reader.mockImplementationOnce(async () => {
              entered.resolve();
              return held.promise;
            });
            const pending = (
              phase === "initial import" ? connect() : refresh()
            ).then((response) => response);
            await entered.promise;
            const old = await pool.query(
              "SELECT id, refresh_token FROM canvas_connections WHERE user_id=$1",
              [own.userId],
            );
            try {
              expect(old.rowCount).toBe(1);
              expect((await connection()).status).toBe("Refreshing");
              if (action === "account deletion") {
                const response = await app.inject({
                  method: "DELETE",
                  url: apiRoutes.deleteData,
                  headers: mutationHeaders(own),
                });
                expect(response.statusCode).toBe(200);
              } else {
                expect((await disconnect()).statusCode).toBe(200);
                if (action === "reconnect") {
                  reader.mockResolvedValueOnce([item("replacement")]);
                  expect((await connect(own, otherFeedUrl)).statusCode).toBe(
                    200,
                  );
                }
              }
            } finally {
              if (outcome === "success") held.resolve([item("stale")]);
              else held.reject(new Error(`Obsolete request ${feedUrl}`));
            }
            const response = await pending;
            expect(response.statusCode).toBe(
              action === "account deletion" ? 401 : 409,
            );
            expect(response.body).not.toContain(feedUrl);
            const stored = await pool.query(
              "SELECT id, refresh_token, snapshot FROM canvas_connections WHERE user_id=$1",
              [own.userId],
            );
            if (action === "reconnect") {
              expect(stored.rows[0]?.id).not.toBe(old.rows[0]?.id);
              expect(stored.rows[0]?.refresh_token).not.toBe(
                old.rows[0]?.refresh_token,
              );
              expect(stored.rows[0]?.snapshot).toEqual([item("replacement")]);
              expect(await connection()).toMatchObject({
                status: "Ready",
                itemCount: 1,
                error: null,
              });
            } else {
              expect(stored.rowCount).toBe(0);
            }
            if (action === "account deletion") {
              expect(
                (
                  await pool.query("SELECT id FROM users WHERE id=$1", [
                    own.userId,
                  ])
                ).rowCount,
              ).toBe(0);
              expect(
                (
                  await pool.query(
                    "SELECT session_hash FROM browser_sessions WHERE user_id=$1",
                    [own.userId],
                  )
                ).rowCount,
              ).toBe(0);
            }
          },
        );
      }
    }

    it("retains independent Canvas data on Google disconnect, then cascades it on account deletion", async () => {
      await connect();
      const before = await pool.query(
        "SELECT * FROM canvas_connections WHERE user_id=$1",
        [own.userId],
      );
      // Already-revoked Google credentials exercise the actual disconnect route
      // without making any real provider request.
      await pool.query(
        `INSERT INTO google_connections(user_id, google_subject, access_token_encrypted, access_token_expires_at, scopes, revoked_at)
       VALUES($1,$2,$3,now(),ARRAY['openid'],now())`,
        [
          own.userId,
          own.userId,
          `v1:${"a".repeat(16)}:${"b".repeat(22)}:ciphertext`,
        ],
      );
      const disconnected = await app.inject({
        method: "POST",
        url: apiRoutes.disconnect,
        headers: mutationHeaders(own),
        payload: {},
      });
      expect(disconnected.statusCode).toBe(200);
      expect(
        (
          await pool.query(
            "SELECT * FROM canvas_connections WHERE user_id=$1",
            [own.userId],
          )
        ).rows,
      ).toEqual(before.rows);
      expect(
        (
          await pool.query(
            "SELECT id FROM google_connections WHERE user_id=$1",
            [own.userId],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await app.inject({
            url: canvasRoutes.connection,
            headers: { cookie: own.cookie },
          })
        ).statusCode,
      ).toBe(401);
      const resumed = await issueSession(pool, own.userId);
      sessions.add(resumed.session.session_hash);
      own = {
        userId: own.userId,
        cookie: `${sessionCookieName(config)}=${resumed.credential}`,
        csrf: csrfToken(resumed.credential),
      };
      expect((await items()).items).toEqual([item("a"), item("b")]);
      const deleted = await app.inject({
        method: "DELETE",
        url: apiRoutes.deleteData,
        headers: mutationHeaders(own),
      });
      expect(deleted.statusCode).toBe(200);
      expect(
        (
          await pool.query(
            "SELECT id FROM canvas_connections WHERE user_id=$1",
            [own.userId],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (await pool.query("SELECT id FROM users WHERE id=$1", [own.userId]))
          .rowCount,
      ).toBe(0);
      expect(reader).toHaveBeenCalledTimes(1);
    });
  },
);
