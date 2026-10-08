import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import pg from "pg";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inboxResponseSchema, syncRunSchema } from "@action-inbox/contracts";
import { migrate } from "../db/migrate.js";
import { ApiFailure, type Runtime } from "../runtime.js";
import { registerPipeline } from "./index.js";

const connectionString = process.env.TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  "ingestion ownership, pagination and durable enqueue",
  () => {
    let pool: pg.Pool;
    let app: FastifyInstance;
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const firstEmail = randomUUID();
    const secondEmail = randomUUID();
    beforeAll(async () => {
      if (!connectionString) throw new Error("TEST_DATABASE_URL required");
      await migrate(connectionString);
      pool = new pg.Pool({ connectionString });
      await pool.query(
        "INSERT INTO users(id,email,display_name) VALUES($1,$2,'Anonymized'),($3,$4,'Other anonymized')",
        [
          userId,
          `${userId}@example.invalid`,
          otherUserId,
          `${otherUserId}@example.invalid`,
        ],
      );
      await pool.query(
        "INSERT INTO google_connections(user_id,google_subject,access_token_encrypted,access_token_expires_at,scopes) VALUES($1,$2,$3,now()+interval '1 hour',ARRAY['openid'])",
        [userId, userId, `v1:${"a".repeat(16)}:${"b".repeat(22)}:ciphertext`],
      );
      await pool.query(
        `INSERT INTO email_messages(id,user_id,gmail_message_id,gmail_thread_id,sender,subject,received_at,normalized_body,body_hash,category,extraction_status)
      VALUES($1,$3,'first','thread','sender@example.invalid','First','2026-10-07T12:00:00.000002Z','Reference body','hash1','Reference','Succeeded'),
      ($2,$3,'second','thread','sender@example.invalid','Second','2026-10-07T12:00:00.000001Z','Review body','hash2','Read / Review','Succeeded')`,
        [firstEmail, secondEmail, userId],
      );
      app = Fastify({ logger: false });
      app.setErrorHandler((error, request, reply) => {
        const status =
          error instanceof ApiFailure
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 500;
        void reply.code(status).send({
          code: error instanceof ApiFailure ? error.code : "INVALID_REQUEST",
          message: "Safe test error",
          requestId: request.id,
        });
      });
      const runtime: Runtime = {
        pool,
        requireUser: async (request) => {
          const user = request.headers["x-test-user"];
          if (user !== userId && user !== otherUserId)
            throw new ApiFailure(401, "UNAUTHENTICATED", "Sign in.");
          request.userId = user;
        },
        config: {
          webOrigin: "http://localhost",
          production: false,
          googleAllowedEmails: [],
          googleAuthorizationUrl: "http://localhost",
          googleTokenUrl: "http://localhost",
          googleUserInfoUrl: "http://localhost",
          googleJwksUrl: "http://localhost",
          googleRevokeUrl: "http://localhost",
          gmailBaseUrl: "http://localhost/gmail/v1",
          calendarBaseUrl: "http://localhost",
          openaiBaseUrl: "http://localhost",
          openaiModel: "local-test",
        },
        google: {
          async request() {
            throw new ApiFailure(
              502,
              "GOOGLE_UNAVAILABLE",
              "Local contract test blocks provider calls.",
            );
          },
          async revoke() {
            throw new Error("No revocation in ingestion route test");
          },
        },
      };
      const pipeline = await registerPipeline(app, runtime);
      app.addHook("onClose", async () => {
        await pipeline.close();
      });
    });
    afterAll(async () => {
      await app?.close();
      if (pool) {
        try {
          await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
            [userId, otherUserId],
          ]);
        } finally {
          await pool.end();
        }
      }
    });
    it("protects email source bodies and inbox ownership", async () => {
      expect((await app.inject(`/v1/emails/${firstEmail}`)).statusCode).toBe(
        401,
      );
      expect(
        (
          await app.inject({
            url: `/v1/emails/${firstEmail}`,
            headers: { "x-test-user": otherUserId },
          })
        ).statusCode,
      ).toBe(404);
      const other = await app.inject({
        url: "/v1/inbox",
        headers: { "x-test-user": otherUserId },
      });
      expect(inboxResponseSchema.parse(other.json()).items).toEqual([]);
      const own = await app.inject({
        url: `/v1/emails/${firstEmail}`,
        headers: { "x-test-user": userId },
      });
      expect(own.json().normalizedBody).toBe("Reference body");
    });
    it("uses stable microsecond keyset pagination and category filtering", async () => {
      const first = inboxResponseSchema.parse(
        (
          await app.inject({
            url: "/v1/inbox?limit=1",
            headers: { "x-test-user": userId },
          })
        ).json(),
      );
      expect(first.items.map((email) => email.id)).toEqual([firstEmail]);
      expect(first.nextCursor).not.toBeNull();
      const second = inboxResponseSchema.parse(
        (
          await app.inject({
            url: `/v1/inbox?limit=1&cursor=${first.nextCursor}`,
            headers: { "x-test-user": userId },
          })
        ).json(),
      );
      expect(second.items.map((email) => email.id)).toEqual([secondEmail]);
      expect(second.nextCursor).toBeNull();
      const filtered = inboxResponseSchema.parse(
        (
          await app.inject({
            url: "/v1/inbox?category=Reference",
            headers: { "x-test-user": userId },
          })
        ).json(),
      );
      expect(filtered.items.map((email) => email.id)).toEqual([firstEmail]);
    });
    it("filters received instants before pagination and keeps extraction-disabled mail readable", async () => {
      const range = {
        startAt: "2026-10-08T00:00:00-07:00",
        endAt: "2026-10-09T00:00:00-07:00",
        startDate: "2026-10-08",
        endDate: "2026-10-09",
      };
      const inside = randomUUID();
      const outside = randomUUID();
      try {
        for (const [id, received] of [
          [inside, range.startAt],
          [outside, range.endAt],
        ]) {
          await pool.query(
            `INSERT INTO email_messages(id,user_id,gmail_message_id,gmail_thread_id,sender,subject,received_at,normalized_body,body_hash,extraction_status)
             VALUES($1::uuid,$2,$1::text,$1::text,'sender@example.invalid','Readable mail',$3,'Readable without AI','hash','Failed')`,
            [id, userId, received],
          );
        }
        const response = await app.inject({
          url: `/v1/inbox?${new URLSearchParams({ ...range, limit: "1" })}`,
          headers: { "x-test-user": userId },
        });
        expect(response.statusCode).toBe(200);
        const filtered = inboxResponseSchema.parse(response.json());
        expect(filtered.items.map((email) => email.id)).toEqual([inside]);
        expect(filtered.items[0]!.suggestions).toEqual([]);
        expect(filtered.items[0]!.extractionStatus).toBe("Failed");
        expect(filtered.nextCursor).toBeNull();
        expect(
          (
            await app.inject({
              url: "/v1/inbox?startDate=2026-10-07",
              headers: { "x-test-user": userId },
            })
          ).statusCode,
        ).toBe(400);
        const unfiltered = inboxResponseSchema.parse(
          (
            await app.inject({
              url: "/v1/inbox?limit=1",
              headers: { "x-test-user": userId },
            })
          ).json(),
        );
        expect(
          (
            await app.inject({
              url: `/v1/inbox?${new URLSearchParams({ ...range, cursor: unfiltered.nextCursor! })}`,
              headers: { "x-test-user": userId },
            })
          ).statusCode,
        ).toBe(400);
      } finally {
        await pool.query(
          "DELETE FROM email_messages WHERE id=ANY($1::uuid[])",
          [[inside, outside]],
        );
      }
    });

    it("includes old mail only when the same suggestion matches review state and due range, with undated opt-in", async () => {
      const old = randomUUID();
      const mismatched = randomUUID();
      const undated = randomUUID();
      const ids = [old, mismatched, undated];
      try {
        for (const id of ids) {
          await pool.query(
            `INSERT INTO email_messages(id,user_id,gmail_message_id,gmail_thread_id,sender,subject,received_at,normalized_body,body_hash,extraction_status)
             VALUES($1::uuid,$2,$1::text,$1::text,'sender@example.invalid','Old mail','2020-01-01','Review this action','hash','Failed')`,
            [id, userId],
          );
        }
        for (const [email, due, state] of [
          [old, "2026-12-04T17:00:00Z", "Proposed"],
          [mismatched, "2026-12-04T17:00:00Z", "Rejected"],
          [mismatched, "2026-12-06T00:00:00Z", "Proposed"],
          [undated, null, "Proposed"],
        ]) {
          const id = randomUUID();
          await pool.query(
            `INSERT INTO suggestions(id,user_id,email_id,category,title,due_at,deadline_certainty,confidence,evidence,needs_review,review_state,fingerprint,action_key)
             VALUES($1::uuid,$2,$3,'Action Required','Review action',$4,'None',0.8,$5,true,$6,$1::text,$1::text)`,
            [
              id,
              userId,
              email,
              due,
              JSON.stringify({ quote: "Review", start: 0, end: 6 }),
              state,
            ],
          );
        }
        const query = new URLSearchParams({
          startAt: "2026-12-04T00:00:00Z",
          endAt: "2026-12-06T00:00:00Z",
          startDate: "2026-12-04",
          endDate: "2026-12-06",
          dateField: "suggestionDue",
          reviewState: "Proposed",
          limit: "1",
        });
        const first = inboxResponseSchema.parse(
          (
            await app.inject({
              url: `/v1/inbox?${query}`,
              headers: { "x-test-user": userId },
            })
          ).json(),
        );
        expect(first.items.map((email) => email.id)).toEqual([old]);
        expect(first.nextCursor).toBeNull();
        query.set("includeUndated", "true");
        const found: string[] = [];
        do {
          const page = inboxResponseSchema.parse(
            (
              await app.inject({
                url: `/v1/inbox?${query}`,
                headers: { "x-test-user": userId },
              })
            ).json(),
          );
          found.push(...page.items.map((email) => email.id));
          if (page.nextCursor) query.set("cursor", page.nextCursor);
          else query.delete("cursor");
        } while (query.has("cursor"));
        expect(found.sort()).toEqual([old, undated].sort());
        query.delete("cursor");
        query.set("dateField", "received");
        expect(
          inboxResponseSchema.parse(
            (
              await app.inject({
                url: `/v1/inbox?${query}`,
                headers: { "x-test-user": userId },
              })
            ).json(),
          ).items,
        ).toEqual([]);
        expect(
          (
            await app.inject({
              url: `/v1/emails/${old}`,
              headers: { "x-test-user": userId },
            })
          ).statusCode,
        ).toBe(200);
      } finally {
        await pool.query(
          "DELETE FROM email_messages WHERE id=ANY($1::uuid[])",
          [ids],
        );
      }
    });

    it("atomically persists a real queue job and keeps run ownership isolated", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/sync/gmail",
        headers: { "x-test-user": userId },
        payload: {},
      });
      expect(response.statusCode).toBe(202);
      const run = syncRunSchema.parse(response.json());
      const jobs = await pool.query(
        "SELECT data FROM pgboss.job WHERE name='gmail-sync-v1' AND id=$1",
        [run.id],
      );
      expect(jobs.rows[0]?.data).toEqual({ runId: run.id, userId });
      expect(
        (
          await app.inject({
            url: `/v1/sync-runs/${run.id}`,
            headers: { "x-test-user": otherUserId },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            url: `/v1/sync-runs/${run.id}`,
            headers: { "x-test-user": userId },
          })
        ).statusCode,
      ).toBe(200);
    });
  },
);
