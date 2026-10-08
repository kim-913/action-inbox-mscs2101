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
