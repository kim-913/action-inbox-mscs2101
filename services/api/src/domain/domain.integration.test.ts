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
import {
  suggestionSchema,
  taskSchema,
  tasksResponseSchema,
  upcomingCalendarResponseSchema,
  displayPreferencesSchema,
  displayRoutes,
} from "@action-inbox/contracts";
import { registerAuth } from "../auth/index.js";
import { connectionIdentity } from "../auth/google.js";
import { csrfToken, TokenCipher } from "../auth/crypto.js";
import { issueSession } from "../auth/sessions.js";
import { readConfiguration } from "../config.js";
import { migrate } from "../db/migrate.js";
import { ApiFailure, type Runtime, type ServerConfig } from "../runtime.js";
import { registerDomain } from "./index.js";
import { deterministicEventId } from "./calendar-provider.js";

const connectionString = process.env.TEST_DATABASE_URL;
const dueAt = "2026-12-04T17:00:00.000Z";
const evidence = { quote: "Send the documents", start: 0, end: 18 };

describe.skipIf(!connectionString)(
  "Domain PostgreSQL and local Google HTTP integration",
  () => {
    let pool: pg.Pool;
    let app: FastifyInstance;
    let runtime: Runtime;
    let config: ServerConfig;
    let provider: Server;
    let providerOrigin: string;
    let users: string[];
    let owner: { id: string; headers: Record<string, string> };
    let outsider: { id: string; headers: Record<string, string> };
    let emailId: string;
    let suggestionId: string;
    let events: Map<string, Record<string, unknown>>;
    let listStatus: number;
    let revokeStatus: number;
    let insertMode:
      | "normal"
      | "conflict"
      | "lost-response"
      | "lost-unreconciled"
      | "unavailable";
    let insertionCount: number;
    let listTimezone: string | null;
    let authorizationSeen: boolean;
    let listBounds: {
      min: string | null;
      max: string | null;
      limit: string | null;
    };
    let failEventRead: boolean;

    beforeAll(async () => {
      if (!connectionString) throw new Error("TEST_DATABASE_URL required");
      await migrate(connectionString);
      pool = new pg.Pool({ connectionString });
      provider = createServer(async (request, response) => {
        const url = new URL(request.url ?? "/", providerOrigin);
        response.setHeader("content-type", "application/json");
        if (url.pathname === "/revoke") {
          response
            .writeHead(revokeStatus)
            .end(JSON.stringify({ private: "provider-revocation-secret" }));
          return;
        }
        authorizationSeen ||=
          request.headers.authorization === "Bearer local-test-access";
        if (url.searchParams.has("hang")) return;
        const collection = "/calendar/v3/calendars/primary/events";
        if (url.pathname === collection && request.method === "GET") {
          listTimezone = url.searchParams.get("timeZone");
          listBounds = {
            min: url.searchParams.get("timeMin"),
            max: url.searchParams.get("timeMax"),
            limit: url.searchParams.get("maxResults"),
          };
          response.writeHead(listStatus).end(
            JSON.stringify(
              listStatus === 200
                ? {
                    items: [
                      {
                        id: "all-day",
                        summary: "All day",
                        start: { date: "2026-12-05" },
                        end: { date: "2026-12-06" },
                      },
                      {
                        id: "timed",
                        summary: "Meeting",
                        start: {
                          dateTime: "2026-12-05T10:00:00-05:00",
                          timeZone: "America/New_York",
                        },
                        end: {
                          dateTime: "2026-12-05T11:00:00-05:00",
                          timeZone: "America/New_York",
                        },
                      },
                    ],
                  }
                : { private: "private-calendar-provider-error" },
            ),
          );
          return;
        }
        if (url.pathname === collection && request.method === "POST") {
          let text = "";
          for await (const chunk of request) text += String(chunk);
          const event = JSON.parse(text) as Record<string, unknown>;
          if (insertMode === "unavailable") {
            response
              .writeHead(503)
              .end(JSON.stringify({ private: "private-event-provider-error" }));
            return;
          }
          const id = String(event.id);
          if (events.has(id)) {
            response.writeHead(409).end("{}");
            return;
          }
          insertionCount++;
          event.htmlLink = `https://calendar.google.com/calendar/event?eid=${id}`;
          events.set(id, event);
          if (
            insertMode === "lost-response" ||
            insertMode === "lost-unreconciled"
          ) {
            failEventRead = insertMode === "lost-unreconciled";
            request.socket.destroy();
            return;
          }
          response
            .writeHead(insertMode === "conflict" ? 409 : 200)
            .end(JSON.stringify(event));
          return;
        }
        if (failEventRead) {
          response.writeHead(503).end("{}");
          return;
        }
        const event = events.get(url.pathname.slice(collection.length + 1));
        response.writeHead(event ? 200 : 404).end(JSON.stringify(event ?? {}));
      });
      await new Promise<void>((resolve) =>
        provider.listen(0, "127.0.0.1", resolve),
      );
      providerOrigin = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
      config = {
        ...readConfiguration({ NODE_ENV: "test" }).config,
        tokenEncryptionKey: randomBytes(32).toString("base64"),
        googleClientId: "local-client",
        googleClientSecret: "local-secret",
        googleRedirectUri: "http://127.0.0.1:3000/v1/auth/google/callback",
        googleRevokeUrl: `${providerOrigin}/revoke`,
        googleJwksUrl: `${providerOrigin}/jwks`,
        calendarBaseUrl: `${providerOrigin}/calendar/v3`,
      };
    });

    async function createUser() {
      const id = randomUUID();
      users.push(id);
      await pool.query(
        "INSERT INTO users(id,email,display_name,timezone) VALUES ($1,$2,'Local test','America/New_York')",
        [id, `${id}@example.test`],
      );
      return connectUser(id);
    }

    async function connectUser(id: string) {
      const connectionId = randomUUID();
      const cipher = new TokenCipher(config.tokenEncryptionKey!);
      const identity = connectionIdentity({
        id: connectionId,
        user_id: id,
        google_subject: id,
      });
      await pool.query(
        `INSERT INTO google_connections(id,user_id,google_subject,access_token_encrypted,refresh_token_encrypted,access_token_expires_at,scopes)
       VALUES ($1,$2,$3,$4,$5,now()+interval '1 hour',ARRAY['openid','https://www.googleapis.com/auth/calendar.events'])`,
        [
          connectionId,
          id,
          id,
          cipher.encrypt("local-test-access", identity, "google-access"),
          cipher.encrypt("local-test-refresh", identity, "google-refresh"),
        ],
      );
      const issued = await issueSession(pool, id);
      return {
        id,
        headers: {
          origin: config.webOrigin,
          cookie: `ai_session=${issued.credential}`,
          "x-csrf-token": csrfToken(issued.credential),
        },
      };
    }

    beforeEach(async () => {
      users = [];
      events = new Map();
      listStatus = 200;
      revokeStatus = 200;
      insertMode = "normal";
      insertionCount = 0;
      listTimezone = null;
      authorizationSeen = false;
      failEventRead = false;
      listBounds = { min: null, max: null, limit: null };
      owner = await createUser();
      outsider = await createUser();
      emailId = randomUUID();
      suggestionId = randomUUID();
      await pool.query(
        `INSERT INTO email_messages(id,user_id,gmail_message_id,gmail_thread_id,sender,subject,received_at,normalized_body,body_hash)
       VALUES ($1,$2,$3,$3,'sender@example.test','Documents',now(),'Send the documents by Friday.','hash')`,
        [emailId, owner.id, emailId],
      );
      await pool.query(
        `INSERT INTO suggestions(id,user_id,email_id,category,title,due_at,deadline_certainty,confidence,evidence,deadline_evidence,needs_review,review_reason,fingerprint,action_key)
       VALUES ($1,$2,$3,'Action Required','Send documents',$4,'Explicit',0.9,$5,$6,false,NULL,$7,$7)`,
        [
          suggestionId,
          owner.id,
          emailId,
          dueAt,
          JSON.stringify(evidence),
          JSON.stringify({ quote: "Friday", start: 22, end: 28 }),
          suggestionId,
        ],
      );
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
      runtime = { pool, config, ...(await registerAuth(app, pool, config)) };
      await registerDomain(app, runtime);
    });

    afterEach(async () => {
      await app.close();
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
    });
    afterAll(async () => {
      provider.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        provider.close((error) => (error ? reject(error) : resolve())),
      );
      await pool.end();
    });

    async function manualTask(title = "Manual task") {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: owner.headers,
        payload: { requestId: randomUUID(), title, dueAt: null },
      });
      expect(response.statusCode).toBe(201);
      return taskSchema.parse(response.json());
    }

    it("persists isolated display preferences across sessions and rejects unauthenticated or unsafe writes", async () => {
      expect((await app.inject(displayRoutes.preferences)).statusCode).toBe(
        401,
      );
      expect(
        (
          await app.inject({
            method: "PUT",
            url: displayRoutes.preferences,
            headers: { origin: config.webOrigin },
            payload: { windowDays: 7 },
          })
        ).statusCode,
      ).toBe(401);
      const initial = await app.inject({
        url: displayRoutes.preferences,
        headers: owner.headers,
      });
      expect(initial.headers["cache-control"]).toBe("no-store");
      expect(displayPreferencesSchema.parse(initial.json())).toEqual({
        windowDays: 30,
      });
      for (const headers of [
        { cookie: owner.headers.cookie!, origin: config.webOrigin },
        { ...owner.headers, origin: "https://untrusted.example" },
        { ...owner.headers, "x-csrf-token": "wrong" },
      ]) {
        const response = await app.inject({
          method: "PUT",
          url: displayRoutes.preferences,
          headers,
          payload: { windowDays: 7 },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("CSRF_INVALID");
      }
      for (const windowDays of [0, -1, 366, 7.5, "7", null]) {
        expect(
          (
            await app.inject({
              method: "PUT",
              url: displayRoutes.preferences,
              headers: owner.headers,
              payload: { windowDays },
            })
          ).statusCode,
        ).toBe(400);
      }
      expect(
        (
          await app.inject({
            method: "PUT",
            url: displayRoutes.preferences,
            headers: owner.headers,
            payload: { windowDays: 7, userId: outsider.id },
          })
        ).statusCode,
      ).toBe(400);
      const saved = await app.inject({
        method: "PUT",
        url: displayRoutes.preferences,
        headers: owner.headers,
        payload: { windowDays: 7 },
      });
      expect(saved.statusCode).toBe(200);
      expect(displayPreferencesSchema.parse(saved.json())).toEqual({
        windowDays: 7,
      });
      const issued = await issueSession(pool, owner.id);
      const reloaded = await app.inject({
        url: displayRoutes.preferences,
        headers: { cookie: `ai_session=${issued.credential}` },
      });
      expect(reloaded.json()).toEqual({ windowDays: 7 });
      expect(
        (
          await app.inject({
            url: displayRoutes.preferences,
            headers: outsider.headers,
          })
        ).json(),
      ).toEqual({ windowDays: 30 });
      expect(
        (
          await pool.query(
            "SELECT display_window_days FROM users WHERE id=$1",
            [owner.id],
          )
        ).rows[0],
      ).toMatchObject({ display_window_days: 7 });
    });

    it("filters task dates and persisted provenance before pagination with separately opt-in undated tasks", async () => {
      const range = {
        startAt: "2026-12-04T00:00:00-05:00",
        endAt: "2026-12-06T00:00:00-05:00",
        startDate: "2026-12-04",
        endDate: "2026-12-06",
      };
      const ids: string[] = [];
      for (const date of [
        range.startAt,
        "2026-12-05T18:00:00Z",
        range.endAt,
        "2026-12-04T04:59:59Z",
        null,
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/v1/tasks",
          headers: owner.headers,
          payload: {
            requestId: randomUUID(),
            title: "Same task title",
            dueAt: date,
          },
        });
        expect(response.statusCode).toBe(201);
        ids.push(taskSchema.parse(response.json()).id);
      }
      const approved = taskSchema.parse(
        (
          await app.inject({
            method: "POST",
            url: `/v1/suggestions/${suggestionId}/approve`,
            headers: owner.headers,
            payload: { version: 0, title: "Same task title" },
          })
        ).json(),
      );
      await pool.query(
        "UPDATE email_messages SET received_at='2020-01-01' WHERE id=$1",
        [emailId],
      );
      const query = new URLSearchParams({
        ...range,
        source: "manual",
        limit: "1",
      });
      const first = tasksResponseSchema.parse(
        (
          await app.inject({
            url: `/v1/tasks?${query}`,
            headers: owner.headers,
          })
        ).json(),
      );
      expect(first.items).toHaveLength(1);
      expect([ids[0], ids[1]]).toContain(first.items[0]!.id);
      expect(first.nextCursor).not.toBeNull();
      query.set("cursor", first.nextCursor!);
      const second = tasksResponseSchema.parse(
        (
          await app.inject({
            url: `/v1/tasks?${query}`,
            headers: owner.headers,
          })
        ).json(),
      );
      expect(
        new Set([...first.items, ...second.items].map((task) => task.id)),
      ).toEqual(new Set(ids.slice(0, 2)));
      expect(second.nextCursor).toBeNull();
      query.set("source", "gmail");
      expect(
        (
          await app.inject({
            url: `/v1/tasks?${query}`,
            headers: owner.headers,
          })
        ).statusCode,
      ).toBe(400);
      query.delete("cursor");
      const gmail = tasksResponseSchema.parse(
        (
          await app.inject({
            url: `/v1/tasks?${query}`,
            headers: owner.headers,
          })
        ).json(),
      );
      expect(gmail.items.map((task) => task.id)).toEqual([approved.id]);
      expect(gmail.items[0]!.sourceEmailId).toBe(emailId);
      query.set("source", "manual");
      query.set("includeUndated", "true");
      query.set("limit", "100");
      const including = tasksResponseSchema.parse(
        (
          await app.inject({
            url: `/v1/tasks?${query}`,
            headers: owner.headers,
          })
        ).json(),
      );
      expect(new Set(including.items.map((task) => task.id))).toEqual(
        new Set([ids[0], ids[1], ids[4]]),
      );
      expect(
        including.items.find((task) => task.id === ids[4])?.dueAt,
      ).toBeNull();
      // A list filter must not make an owned task's detail inaccessible.
      const detail = await app.inject({
        url: `/v1/tasks/${ids[2]}`,
        headers: owner.headers,
      });
      expect(detail.statusCode).toBe(200);
      expect(taskSchema.parse(detail.json())).toMatchObject({
        id: ids[2],
        dueAt: new Date(range.endAt).toISOString(),
      });
      expect(
        (
          await app.inject({
            url: `/v1/tasks/${ids[2]}`,
            headers: outsider.headers,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ url: `/v1/tasks/${ids[2]}` })).statusCode,
      ).toBe(401);
      expect(
        tasksResponseSchema.parse(
          (
            await app.inject({ url: "/v1/tasks", headers: owner.headers })
          ).json(),
        ).items,
      ).toHaveLength(6);
    });

    it("bounds Calendar transport and re-filters the preserved snapshot during outages", async () => {
      const range = {
        startAt: "2026-12-05T00:00:00-05:00",
        endAt: "2026-12-06T00:00:00-05:00",
        startDate: "2026-12-05",
        endDate: "2026-12-06",
      };
      const first = upcomingCalendarResponseSchema.parse(
        (
          await app.inject({
            url: `/v1/calendar/upcoming?${new URLSearchParams(range)}`,
            headers: owner.headers,
          })
        ).json(),
      );
      expect(first.items.map((item) => item.id)).toEqual(["all-day", "timed"]);
      expect(listBounds).toEqual({
        min: range.startAt,
        max: range.endAt,
        limit: "100",
      });
      listStatus = 503;
      const later = {
        startAt: range.endAt,
        endAt: "2026-12-07T00:00:00-05:00",
        startDate: range.endDate,
        endDate: "2026-12-07",
      };
      const failed = upcomingCalendarResponseSchema.parse(
        (
          await app.inject({
            url: `/v1/calendar/upcoming?${new URLSearchParams(later)}`,
            headers: owner.headers,
          })
        ).json(),
      );
      expect(failed.items).toEqual([]);
      expect(failed.error?.code).toBe("GOOGLE_UNAVAILABLE");
      expect(failed.lastSuccessfulFetchAt).toBe(first.lastSuccessfulFetchAt);
      const retained = upcomingCalendarResponseSchema.parse(
        (
          await app.inject({
            url: `/v1/calendar/upcoming?${new URLSearchParams(range)}`,
            headers: owner.headers,
          })
        ).json(),
      );
      expect(retained.items).toEqual(first.items);
      // Native date overlap wins even when a UTC conversion would put the date elsewhere.
      const native = {
        startAt: "2026-12-04T00:00:00+14:00",
        endAt: "2026-12-05T00:00:00+14:00",
        startDate: "2026-12-04",
        endDate: "2026-12-05",
      };
      expect(
        upcomingCalendarResponseSchema.parse(
          (
            await app.inject({
              url: `/v1/calendar/upcoming?${new URLSearchParams(native)}`,
              headers: owner.headers,
            })
          ).json(),
        ).items,
      ).toEqual([]);
      expect(
        (
          await app.inject({
            url: "/v1/calendar/upcoming?startAt=2026-12-04T00:00:00Z",
            headers: owner.headers,
          })
        ).statusCode,
      ).toBe(400);
    });

    it("creates no task until approval and locks concurrent approval into one complete task", async () => {
      expect(
        (await pool.query("SELECT id FROM tasks WHERE user_id=$1", [owner.id]))
          .rowCount,
      ).toBe(0);
      const approve = () =>
        app.inject({
          method: "POST",
          url: `/v1/suggestions/${suggestionId}/approve`,
          headers: owner.headers,
          payload: { version: 0, title: "Reviewed documents" },
        });
      const responses = await Promise.all([approve(), approve(), approve()]);
      expect(responses.map((response) => response.statusCode)).toEqual([
        200, 200, 200,
      ]);
      const tasks = responses.map((response) =>
        taskSchema.parse(response.json()),
      );
      expect(tasks[1]).toEqual(tasks[0]);
      expect(tasks[2]).toEqual(tasks[0]);
      expect(tasks[0]).toMatchObject({
        title: "Reviewed documents",
        sourceSuggestionId: suggestionId,
        sourceEmailId: emailId,
        reminders: [],
        calendarLink: null,
      });
      expect(
        (
          await pool.query(
            "SELECT id FROM tasks WHERE source_suggestion_id=$1",
            [suggestionId],
          )
        ).rowCount,
      ).toBe(1);
      const stored = await pool.query(
        "SELECT evidence,deadline_evidence,review_state FROM suggestions WHERE id=$1",
        [suggestionId],
      );
      expect(stored.rows[0]).toMatchObject({
        evidence,
        review_state: "Approved",
      });
      expect(stored.rows[0]?.deadline_evidence).not.toBeNull();
    });

    it("retains extraction evidence while versioning edits and rejects stale approval and terminal edits", async () => {
      const edited = await app.inject({
        method: "PATCH",
        url: `/v1/suggestions/${suggestionId}`,
        headers: owner.headers,
        payload: { version: 0, title: "User edit", dueAt: null },
      });
      expect(edited.statusCode).toBe(200);
      expect(suggestionSchema.parse(edited.json())).toMatchObject({
        version: 1,
        evidence,
        dueAt: null,
      });
      const stale = await app.inject({
        method: "POST",
        url: `/v1/suggestions/${suggestionId}/approve`,
        headers: owner.headers,
        payload: { version: 0 },
      });
      expect(stale.statusCode).toBe(409);
      const rejected = await app.inject({
        method: "POST",
        url: `/v1/suggestions/${suggestionId}/reject`,
        headers: owner.headers,
        payload: { version: 1 },
      });
      expect(rejected.statusCode).toBe(200);
      expect(suggestionSchema.parse(rejected.json()).reviewState).toBe(
        "Rejected",
      );
      const terminal = await app.inject({
        method: "PATCH",
        url: `/v1/suggestions/${suggestionId}`,
        headers: owner.headers,
        payload: { version: 2, title: "Cannot edit" },
      });
      expect(terminal.statusCode).toBe(409);
      expect(
        (await pool.query("SELECT id FROM tasks WHERE user_id=$1", [owner.id]))
          .rowCount,
      ).toBe(0);
    });

    it("uses a per-user manual UUID key atomically and conflicts when its original content changes", async () => {
      const payload = {
        requestId: randomUUID(),
        title: "Manual documents",
        dueAt,
      };
      const create = () =>
        app.inject({
          method: "POST",
          url: "/v1/tasks",
          headers: owner.headers,
          payload,
        });
      const responses = await Promise.all([create(), create(), create()]);
      expect(responses.map((response) => response.statusCode)).toEqual([
        201, 201, 201,
      ]);
      const task = taskSchema.parse(responses[0]!.json());
      expect(responses[1]!.json()).toEqual(task);
      expect(task.sourceSuggestionId).toBeNull();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/tasks",
            headers: owner.headers,
            payload: { ...payload, title: "Different intent" },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/tasks",
            headers: outsider.headers,
            payload,
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (
          await pool.query(
            "SELECT id FROM tasks WHERE user_id=$1 AND request_id=$2",
            [owner.id, payload.requestId],
          )
        ).rowCount,
      ).toBe(1);
      const edited = await app.inject({
        method: "PATCH",
        url: `/v1/tasks/${task.id}`,
        headers: owner.headers,
        payload: { version: 0, title: "Edited later" },
      });
      expect(edited.statusCode).toBe(200);
      expect((await create()).json()).toMatchObject({
        id: task.id,
        title: "Edited later",
      });
    });

    it("versions task changes, records completion, and reopens only to Pending", async () => {
      const task = await manualTask();
      const update = (version: number, status: string) =>
        app.inject({
          method: "PATCH",
          url: `/v1/tasks/${task.id}`,
          headers: owner.headers,
          payload: { version, status },
        });
      const races = await Promise.all([
        update(0, "Waiting for Reply"),
        update(0, "Completed"),
      ]);
      expect(races.map((response) => response.statusCode).sort()).toEqual([
        200, 409,
      ]);
      const completed = await update(1, "Completed");
      expect(taskSchema.parse(completed.json()).completedAt).not.toBeNull();
      expect((await update(2, "Waiting for Reply")).statusCode).toBe(409);
      const reopened = await update(2, "Pending");
      expect(taskSchema.parse(reopened.json())).toMatchObject({
        status: "Pending",
        completedAt: null,
        version: 3,
      });
    });

    it("pages without skipping timestamps that differ only below millisecond precision", async () => {
      const older = await manualTask("Older");
      const newer = await manualTask("Newer");
      await pool.query("UPDATE tasks SET created_at=$2 WHERE id=$1", [
        older.id,
        "2026-12-01T12:00:00.123100Z",
      ]);
      await pool.query("UPDATE tasks SET created_at=$2 WHERE id=$1", [
        newer.id,
        "2026-12-01T12:00:00.123900Z",
      ]);
      const first = tasksResponseSchema.parse(
        (
          await app.inject({ url: "/v1/tasks?limit=1", headers: owner.headers })
        ).json(),
      );
      expect(first.items.map((task) => task.id)).toEqual([newer.id]);
      expect(first.nextCursor).not.toBeNull();
      const next = tasksResponseSchema.parse(
        (
          await app.inject({
            url: `/v1/tasks?limit=1&cursor=${first.nextCursor}`,
            headers: owner.headers,
          })
        ).json(),
      );
      expect(next.items.map((task) => task.id)).toEqual([older.id]);
      expect(next.nextCursor).toBeNull();
      expect(
        (
          await app.inject({
            url: "/v1/tasks?cursor=invalid",
            headers: owner.headers,
          })
        ).statusCode,
      ).toBe(400);
    });

    it("retains editable/cancelled due metadata without claiming delivery", async () => {
      const task = await manualTask();
      const payload = { requestId: randomUUID(), scheduledAt: dueAt };
      const create = () =>
        app.inject({
          method: "POST",
          url: `/v1/tasks/${task.id}/reminders`,
          headers: owner.headers,
          payload,
        });
      const reminder = (await create()).json<{ id: string }>();
      expect((await create()).json()).toMatchObject({
        id: reminder.id,
        delivery: "Not configured",
      });
      const edit = await app.inject({
        method: "PATCH",
        url: `/v1/reminders/${reminder.id}`,
        headers: owner.headers,
        payload: { scheduledAt: "2026-12-03T17:00:00Z" },
      });
      expect(edit.statusCode).toBe(200);
      expect(edit.json()).toMatchObject({
        scheduledAt: "2026-12-03T17:00:00.000Z",
        delivery: "Not configured",
      });
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/v1/reminders/${reminder.id}`,
            headers: owner.headers,
          })
        ).statusCode,
      ).toBe(200);
      expect((await create()).json()).toMatchObject({
        id: reminder.id,
        status: "Cancelled",
        delivery: "Not configured",
      });
      const listed = tasksResponseSchema.parse(
        (await app.inject({ url: "/v1/tasks", headers: owner.headers })).json(),
      );
      expect(listed.items[0]?.reminders).toHaveLength(1);
      expect(listed.items[0]?.reminders[0]?.status).toBe("Cancelled");
    });

    it("enforces source ownership and one approved task at the database boundary", async () => {
      await expect(
        pool.query(
          "INSERT INTO tasks(user_id,source_suggestion_id,source_email_id,title) VALUES ($1,$2,$3,'Invalid owner')",
          [outsider.id, suggestionId, emailId],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      const response = await app.inject({
        method: "POST",
        url: `/v1/suggestions/${suggestionId}/approve`,
        headers: owner.headers,
        payload: { version: 0 },
      });
      expect(response.statusCode).toBe(200);
      await expect(
        pool.query(
          "INSERT INTO tasks(user_id,source_suggestion_id,source_email_id,title) VALUES ($1,$2,$3,'Duplicate approval')",
          [owner.id, suggestionId, emailId],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    });

    it("enforces the full Google ID length range without unsupported PostgreSQL regex bounds", async () => {
      const task = await manualTask();
      const content = JSON.stringify({
        title: "Calendar constraint",
        startAt: dueAt,
        endAt: "2026-12-04T18:00:00Z",
        timezone: "UTC",
      });
      for (const invalidId of ["abcd", "a".repeat(1025), "w".repeat(64)]) {
        await expect(
          pool.query(
            "INSERT INTO calendar_event_links(task_id,google_event_id,request_id,request_content) VALUES ($1,$2,$3,$4)",
            [task.id, invalidId, randomUUID(), content],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      }
      await pool.query(
        "INSERT INTO calendar_event_links(task_id,google_event_id,request_id,request_content) VALUES ($1,$2,$3,$4)",
        [task.id, "a".repeat(1024), randomUUID(), content],
      );
      await pool.query(
        "UPDATE calendar_event_links SET google_event_id=$2 WHERE task_id=$1",
        [task.id, "abcde"],
      );
      const result = await pool.query(
        "UPDATE calendar_event_links SET google_event_id=$2 WHERE task_id=$1 RETURNING google_event_id",
        [task.id, deterministicEventId(owner.id, task.id)],
      );
      expect(result.rows[0]?.google_event_id).toBe(
        deterministicEventId(owner.id, task.id),
      );
    });

    it("isolates all resource IDs and enforces CSRF before domain mutations", async () => {
      const task = await manualTask();
      const reminder = (
        await app.inject({
          method: "POST",
          url: `/v1/tasks/${task.id}/reminders`,
          headers: owner.headers,
          payload: { requestId: randomUUID(), scheduledAt: dueAt },
        })
      ).json<{ id: string }>();
      const attempts = [
        app.inject({
          method: "PATCH",
          url: `/v1/suggestions/${suggestionId}`,
          headers: outsider.headers,
          payload: { version: 0, title: "No" },
        }),
        app.inject({
          method: "POST",
          url: `/v1/suggestions/${suggestionId}/approve`,
          headers: outsider.headers,
          payload: { version: 0 },
        }),
        app.inject({
          method: "POST",
          url: `/v1/suggestions/${suggestionId}/reject`,
          headers: outsider.headers,
          payload: { version: 0 },
        }),
        app.inject({
          method: "PATCH",
          url: `/v1/tasks/${task.id}`,
          headers: outsider.headers,
          payload: { version: 0, title: "No" },
        }),
        app.inject({
          method: "POST",
          url: `/v1/tasks/${task.id}/reminders`,
          headers: outsider.headers,
          payload: { requestId: randomUUID(), scheduledAt: dueAt },
        }),
        app.inject({
          method: "PATCH",
          url: `/v1/reminders/${reminder.id}`,
          headers: outsider.headers,
          payload: { scheduledAt: dueAt },
        }),
        app.inject({
          method: "DELETE",
          url: `/v1/reminders/${reminder.id}`,
          headers: outsider.headers,
        }),
        app.inject({
          method: "POST",
          url: `/v1/tasks/${task.id}/calendar-event`,
          headers: outsider.headers,
          payload: {
            requestId: randomUUID(),
            title: "No",
            startAt: dueAt,
            endAt: "2026-12-04T18:00:00Z",
            timezone: "UTC",
          },
        }),
      ];
      expect(
        (await Promise.all(attempts)).map((response) => response.statusCode),
      ).toEqual(Array(8).fill(404));
      expect(
        tasksResponseSchema.parse(
          (
            await app.inject({ url: "/v1/tasks", headers: outsider.headers })
          ).json(),
        ).items,
      ).toEqual([]);
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/v1/tasks/${task.id}`,
            headers: { ...owner.headers, "x-csrf-token": "incorrect" },
            payload: { version: 0, title: "No" },
          })
        ).statusCode,
      ).toBe(403);
    });

    it("keeps a timezone-aware/all-day last-success snapshot and persists safe provider errors", async () => {
      const first = upcomingCalendarResponseSchema.parse(
        (
          await app.inject({
            url: "/v1/calendar/upcoming",
            headers: owner.headers,
          })
        ).json(),
      );
      expect(first.error).toBeNull();
      expect(first.items).toHaveLength(2);
      expect(first.items[0]).toMatchObject({
        allDay: true,
        start: "2026-12-05",
        end: "2026-12-06",
      });
      expect(first.items[1]?.start).toBe("2026-12-05T10:00:00-05:00");
      expect(listTimezone).toBe("America/New_York");
      expect(authorizationSeen).toBe(true);
      listStatus = 503;
      const failed = await app.inject({
        url: "/v1/calendar/upcoming",
        headers: owner.headers,
      });
      expect(failed.statusCode).toBe(200);
      expect(failed.body).not.toContain("private-calendar");
      const cached = upcomingCalendarResponseSchema.parse(failed.json());
      expect(cached.items).toEqual(first.items);
      expect(cached.lastSuccessfulFetchAt).toBe(first.lastSuccessfulFetchAt);
      expect(cached.error?.code).toBe("GOOGLE_UNAVAILABLE");
      const stored = await pool.query(
        "SELECT error FROM calendar_snapshots WHERE user_id=$1",
        [owner.id],
      );
      expect(stored.rows[0]?.error).toEqual(cached.error);
      listStatus = 429;
      expect(
        (
          await app.inject({
            url: "/v1/calendar/upcoming",
            headers: owner.headers,
          })
        ).json(),
      ).toMatchObject({ error: { code: "RATE_LIMITED" } });
    });

    it.each(["normal", "conflict", "lost-response"] as const)(
      "reconciles %s insertion and concurrent retries into one external event",
      async (mode) => {
        const task = await manualTask();
        insertMode = mode;
        const payload = {
          requestId: randomUUID(),
          title: "Approved event",
          startAt: dueAt,
          endAt: "2026-12-04T18:00:00Z",
          timezone: "America/New_York",
        };
        const create = () =>
          app.inject({
            method: "POST",
            url: `/v1/tasks/${task.id}/calendar-event`,
            headers: owner.headers,
            payload,
          });
        const responses = await Promise.all([create(), create(), create()]);
        expect(responses.map((response) => response.statusCode)).toEqual([
          200, 200, 200,
        ]);
        expect(insertionCount).toBe(1);
        expect(events.size).toBe(1);
        const eventId = deterministicEventId(owner.id, task.id);
        expect(responses[0]!.json()).toMatchObject({
          status: "Created",
          googleEventId: eventId,
          error: null,
        });
        expect(responses[1]!.json()).toEqual(responses[0]!.json());
        expect((await create()).json()).toEqual(responses[0]!.json());
        expect(
          (
            await app.inject({
              method: "POST",
              url: `/v1/tasks/${task.id}/calendar-event`,
              headers: owner.headers,
              payload: { ...payload, title: "Changed request" },
            })
          ).statusCode,
        ).toBe(409);
        const listed = tasksResponseSchema.parse(
          (
            await app.inject({ url: "/v1/tasks", headers: owner.headers })
          ).json(),
        );
        expect(listed.items[0]?.calendarLink?.googleEventId).toBe(eventId);
      },
    );

    it("persists failed event intent and retries using its original Google event ID", async () => {
      const task = await manualTask();
      insertMode = "unavailable";
      const payload = {
        requestId: randomUUID(),
        title: "Retry event",
        startAt: dueAt,
        endAt: "2026-12-04T18:00:00Z",
        timezone: "UTC",
      };
      const create = () =>
        app.inject({
          method: "POST",
          url: `/v1/tasks/${task.id}/calendar-event`,
          headers: owner.headers,
          payload,
        });
      const failed = await create();
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("private-event");
      const stored = await pool.query(
        "SELECT status,google_event_id,error FROM calendar_event_links WHERE task_id=$1",
        [task.id],
      );
      expect(stored.rows[0]).toMatchObject({
        status: "Failed",
        google_event_id: deterministicEventId(owner.id, task.id),
        error: { code: "GOOGLE_UNAVAILABLE" },
      });
      insertMode = "normal";
      expect((await create()).statusCode).toBe(200);
      expect(insertionCount).toBe(1);
    });

    it("reuses a persisted intent after an ambiguous failure and a browser-generated replacement UUID", async () => {
      const task = await manualTask();
      insertMode = "lost-unreconciled";
      const payload = {
        requestId: randomUUID(),
        title: "Survives reload",
        startAt: dueAt,
        endAt: "2026-12-04T18:00:00Z",
        timezone: "UTC",
      };
      const failed = await app.inject({
        method: "POST",
        url: `/v1/tasks/${task.id}/calendar-event`,
        headers: owner.headers,
        payload,
      });
      expect(failed.statusCode).toBe(504);
      expect(insertionCount).toBe(1);
      expect(events.size).toBe(1);
      const stored = await pool.query(
        "SELECT status,request_id,google_event_id FROM calendar_event_links WHERE task_id=$1",
        [task.id],
      );
      expect(stored.rows[0]).toMatchObject({
        status: "Failed",
        request_id: payload.requestId,
        google_event_id: deterministicEventId(owner.id, task.id),
      });
      failEventRead = false;
      insertMode = "normal";
      const reloadedPayload = { ...payload, requestId: randomUUID() };
      const retried = await app.inject({
        method: "POST",
        url: `/v1/tasks/${task.id}/calendar-event`,
        headers: owner.headers,
        payload: reloadedPayload,
      });
      expect(retried.statusCode).toBe(200);
      expect(retried.json()).toMatchObject({
        status: "Created",
        googleEventId: deterministicEventId(owner.id, task.id),
        error: null,
      });
      expect(insertionCount).toBe(1);
      expect(events.size).toBe(1);
      const persisted = await pool.query(
        "SELECT request_id FROM calendar_event_links WHERE task_id=$1",
        [task.id],
      );
      expect(persisted.rows[0]?.request_id).toBe(payload.requestId);
      const mismatch = await app.inject({
        method: "POST",
        url: `/v1/tasks/${task.id}/calendar-event`,
        headers: owner.headers,
        payload: {
          ...reloadedPayload,
          requestId: randomUUID(),
          title: "Changed intent",
        },
      });
      expect(mismatch.statusCode).toBe(409);
    });

    it("reconciles a manual-task event after disconnect and reconnect without retaining local provider data", async () => {
      const task = await manualTask();
      const payload = {
        requestId: randomUUID(),
        title: "Reconnect approval",
        startAt: dueAt,
        endAt: "2026-12-04T18:00:00Z",
        timezone: "UTC",
      };
      const created = await app.inject({
        method: "POST",
        url: `/v1/tasks/${task.id}/calendar-event`,
        headers: owner.headers,
        payload,
      });
      expect(created.statusCode).toBe(200);
      const disconnect = await app.inject({
        method: "POST",
        url: "/v1/connections/google/disconnect",
        headers: owner.headers,
        payload: {},
      });
      expect(disconnect.statusCode).toBe(200);
      expect(
        (await pool.query("SELECT id FROM tasks WHERE id=$1", [task.id]))
          .rowCount,
      ).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT task_id FROM calendar_event_links WHERE task_id=$1",
            [task.id],
          )
        ).rowCount,
      ).toBe(0);
      expect(events.size).toBe(1);
      owner = await connectUser(owner.id);
      const retried = await app.inject({
        method: "POST",
        url: `/v1/tasks/${task.id}/calendar-event`,
        headers: owner.headers,
        payload: { ...payload, requestId: randomUUID() },
      });
      expect(retried.statusCode).toBe(200);
      expect(retried.json()).toEqual(created.json());
      expect(insertionCount).toBe(1);
      expect(events.size).toBe(1);
      const disconnectedAgain = await app.inject({
        method: "POST",
        url: "/v1/connections/google/disconnect",
        headers: owner.headers,
        payload: {},
      });
      expect(disconnectedAgain.statusCode).toBe(200);
      owner = await connectUser(owner.id);
      // Equal instants are insufficient: the surviving remote approval hash
      // must also match the original timezone and all other immutable content.
      const changed = await app.inject({
        method: "POST",
        url: `/v1/tasks/${task.id}/calendar-event`,
        headers: owner.headers,
        payload: {
          ...payload,
          requestId: randomUUID(),
          timezone: "America/New_York",
        },
      });
      expect(changed.statusCode).toBe(409);
      expect(insertionCount).toBe(1);
      expect(events.size).toBe(1);
    });

    it("bounds a real local HTTP request and returns a safe timeout", async () => {
      await expect(
        runtime.google.request(
          owner.id,
          `${config.calendarBaseUrl}/calendars/primary/events?hang=1`,
          { signal: AbortSignal.timeout(25) },
        ),
      ).rejects.toMatchObject({ status: 504, code: "GOOGLE_UNAVAILABLE" });
    });

    it("retains all data on failed revocation, then purges derived data but preserves manual tasks", async () => {
      const manual = await manualTask();
      await app.inject({
        method: "POST",
        url: `/v1/suggestions/${suggestionId}/approve`,
        headers: owner.headers,
        payload: { version: 0 },
      });
      await app.inject({
        url: "/v1/calendar/upcoming",
        headers: owner.headers,
      });
      revokeStatus = 503;
      for (const method of ["POST", "DELETE"] as const) {
        const response = await app.inject({
          method,
          url:
            method === "POST"
              ? "/v1/connections/google/disconnect"
              : "/v1/account/data",
          headers: owner.headers,
          ...(method === "POST" ? { payload: {} } : {}),
        });
        expect(response.statusCode).toBe(502);
        expect(response.body).not.toContain("provider-revocation-secret");
        expect(
          (
            await pool.query("SELECT id FROM email_messages WHERE user_id=$1", [
              owner.id,
            ])
          ).rowCount,
        ).toBe(1);
        expect(
          (
            await pool.query("SELECT id FROM tasks WHERE user_id=$1", [
              owner.id,
            ])
          ).rowCount,
        ).toBe(2);
        expect(
          (await pool.query("SELECT id FROM users WHERE id=$1", [owner.id]))
            .rowCount,
        ).toBe(1);
        expect(
          (
            await pool.query(
              "SELECT revoked_at FROM google_connections WHERE user_id=$1",
              [owner.id],
            )
          ).rows[0]?.revoked_at,
        ).toBeNull();
      }
      revokeStatus = 200;
      const disconnected = await app.inject({
        method: "POST",
        url: "/v1/connections/google/disconnect",
        headers: owner.headers,
        payload: {},
      });
      expect(disconnected.statusCode).toBe(200);
      expect(disconnected.headers["set-cookie"]).toBeDefined();
      expect(
        (
          await pool.query("SELECT id FROM email_messages WHERE user_id=$1", [
            owner.id,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT * FROM calendar_snapshots WHERE user_id=$1",
            [owner.id],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (await pool.query("SELECT id FROM tasks WHERE user_id=$1", [owner.id]))
          .rows,
      ).toEqual([{ id: manual.id }]);
      expect(
        (
          await pool.query("SELECT * FROM browser_sessions WHERE user_id=$1", [
            owner.id,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (await pool.query("SELECT id FROM users WHERE id=$1", [outsider.id]))
          .rowCount,
      ).toBe(1);
    });

    it("deletes the user and all dependent sessions and tasks only after real revocation", async () => {
      await manualTask();
      const response = await app.inject({
        method: "DELETE",
        url: "/v1/account/data",
        headers: owner.headers,
      });
      expect(response.statusCode).toBe(200);
      for (const table of [
        "tasks",
        "browser_sessions",
        "google_connections",
        "email_messages",
      ]) {
        expect(
          (
            await pool.query(`SELECT user_id FROM ${table} WHERE user_id=$1`, [
              owner.id,
            ])
          ).rowCount,
        ).toBe(0);
      }
      expect(
        (await pool.query("SELECT id FROM users WHERE id=$1", [owner.id]))
          .rowCount,
      ).toBe(0);
    });
  },
);
