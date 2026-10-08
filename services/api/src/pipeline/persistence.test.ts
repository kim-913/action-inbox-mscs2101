import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../db/migrate.js";
import { ApiFailure, type Runtime } from "../runtime.js";
import { type Extractor } from "./extractor.js";
import { processSync, finishFailedRun } from "./worker.js";
import { importMessage, safePipelineError } from "./store.js";

const connectionString = process.env.TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  "persisted ingestion retry and decisions",
  () => {
    let pool: pg.Pool;
    beforeAll(async () => {
      if (!connectionString) throw new Error("TEST_DATABASE_URL required");
      await migrate(connectionString);
      pool = new pg.Pool({ connectionString });
    });
    afterAll(async () => {
      await pool?.end();
    });
    it("retains imported data and last success, retries stored failure, and never duplicates or overwrites decisions", async () => {
      const userId = randomUUID();
      await pool.query(
        "INSERT INTO users(id,email,display_name) VALUES($1,$2,'Anonymized test')",
        [userId, `${userId}@example.invalid`],
      );
      let visible = ["message-one"];
      let failing = false;
      let calls = 0;
      const extractor: Extractor = {
        version: "test-v1",
        model: "local-test",
        async extract() {
          calls++;
          if (failing)
            throw new ApiFailure(502, "AI_UNAVAILABLE", "private-test-error");
          return {
            category: "Action Required",
            categoryConfidence: 1,
            actions: [
              {
                title: "Reply",
                evidenceQuote: "Please reply.",
                deadlineQuote: null,
                dueAt: null,
                deadlineCertainty: "None",
                confidence: 1,
              },
            ],
          };
        },
      };
      const runtime: Runtime = {
        pool,
        requireUser: async () => {
          throw new Error("Worker has no HTTP auth hook");
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
          async request(_user, url) {
            const parsed = new URL(url);
            if (parsed.pathname.endsWith("/messages"))
              return { messages: visible.map((id) => ({ id })) };
            return {
              id: parsed.pathname.split("/").at(-1),
              threadId: "thread",
              internalDate: String(Date.now()),
              payload: {
                mimeType: "text/plain",
                body: {
                  data: Buffer.from("Please reply.").toString("base64url"),
                },
              },
            };
          },
          async revoke() {
            throw new Error("No revocation in ingestion test");
          },
        },
      };
      async function sync(): Promise<string> {
        const id = randomUUID();
        await pool.query("INSERT INTO sync_runs(id,user_id) VALUES($1,$2)", [
          id,
          userId,
        ]);
        await processSync(runtime, { runId: id, userId }, extractor);
        return id;
      }
      try {
        await pool.query(
          "INSERT INTO google_connections(user_id,google_subject,access_token_encrypted,access_token_expires_at,scopes) VALUES($1,$2,$3,now()+interval '1 hour',ARRAY['openid'])",
          [userId, userId, `v1:${"a".repeat(16)}:${"b".repeat(22)}:ciphertext`],
        );
        const first = await sync();
        visible = ["message-one", "message-two"];
        failing = true;
        const second = await sync();
        const failed = await pool.query(
          "SELECT status,error FROM sync_runs WHERE id=$1",
          [second],
        );
        expect(failed.rows[0].status).toBe("Failed");
        expect(JSON.stringify(failed.rows[0].error)).not.toContain(
          "private-test-error",
        );
        expect(
          (
            await pool.query("SELECT status FROM sync_runs WHERE id=$1", [
              first,
            ])
          ).rows[0].status,
        ).toBe("Succeeded");
        expect(
          (
            await pool.query("SELECT * FROM email_messages WHERE user_id=$1", [
              userId,
            ])
          ).rowCount,
        ).toBe(2);
        expect(
          (
            await pool.query(
              "SELECT extraction_status FROM email_messages WHERE user_id=$1 AND gmail_message_id='message-two'",
              [userId],
            )
          ).rows[0].extraction_status,
        ).toBe("Failed");
        visible = []; // Failed stored message must be retried even outside Gmail's current window.
        failing = false;
        await sync();
        expect(
          (
            await pool.query("SELECT * FROM suggestions WHERE user_id=$1", [
              userId,
            ])
          ).rowCount,
        ).toBe(2);
        await pool.query(
          "UPDATE suggestions SET review_state=CASE WHEN email_id=(SELECT id FROM email_messages WHERE user_id=$1 AND gmail_message_id='message-one') THEN 'Approved' ELSE 'Rejected' END,title='Human decision',version=4 WHERE user_id=$1",
          [userId],
        );
        await pool.query(
          "UPDATE email_messages SET extraction_status='Failed' WHERE user_id=$1",
          [userId],
        );
        await sync();
        visible = ["message-one", "message-two"];
        await sync();
        const rows = await pool.query(
          "SELECT title,version,review_state FROM suggestions WHERE user_id=$1 ORDER BY review_state",
          [userId],
        );
        expect(rows.rows).toEqual([
          { title: "Human decision", version: 4, review_state: "Approved" },
          { title: "Human decision", version: 4, review_state: "Rejected" },
        ]);
        expect(calls).toBe(5);
      } finally {
        await pool.query("DELETE FROM users WHERE id=$1", [userId]);
      }
    });
    it("reflects terminal worker failure and cannot resurrect content after disconnect", async () => {
      const userId = randomUUID();
      const runId = randomUUID();
      await pool.query(
        "INSERT INTO users(id,email,display_name) VALUES($1,$2,'Anonymized test')",
        [userId, `${userId}@example.invalid`],
      );
      await pool.query("INSERT INTO sync_runs(id,user_id) VALUES($1,$2)", [
        runId,
        userId,
      ]);
      try {
        await expect(
          importMessage(
            pool,
            userId,
            runId,
            {
              gmailMessageId: "removed",
              gmailThreadId: "thread",
              sender: "person@example.invalid",
              subject: "Safe",
              receivedAt: "2026-01-01T00:00:00Z",
              normalizedBody: "Please reply.",
              bodyHash: "hash",
            },
            randomUUID(),
          ),
        ).rejects.toMatchObject({ code: "GOOGLE_RECONNECT_REQUIRED" });
        expect(
          (
            await pool.query("SELECT * FROM email_messages WHERE user_id=$1", [
              userId,
            ])
          ).rowCount,
        ).toBe(0);
        await pool.query(
          "INSERT INTO google_connections(user_id,google_subject,access_token_encrypted,access_token_expires_at,scopes) VALUES($1,$2,$3,now()+interval '1 hour',ARRAY['openid'])",
          [userId, userId, `v1:${"a".repeat(16)}:${"b".repeat(22)}:ciphertext`],
        );
        await finishFailedRun(
          { pool } as Runtime,
          { runId, userId },
          safePipelineError(null, runId),
        );
        expect(
          (
            await pool.query("SELECT status FROM sync_runs WHERE id=$1", [
              runId,
            ])
          ).rows[0].status,
        ).toBe("Failed");
      } finally {
        await pool.query("DELETE FROM users WHERE id=$1", [userId]);
      }
    });
  },
);
