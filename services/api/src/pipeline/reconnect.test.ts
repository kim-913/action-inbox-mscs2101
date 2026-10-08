import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../db/migrate.js";
import type { Runtime } from "../runtime.js";
import type { Extractor } from "./extractor.js";
import { processSync } from "./worker.js";

const connectionString = process.env.TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  "in-flight ingestion connection fencing",
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

    it.each([
      { phase: "gmail", purgeRun: true, replaceConnection: true },
      { phase: "extractor", purgeRun: true, replaceConnection: true },
      { phase: "gmail", purgeRun: true, replaceConnection: false },
      { phase: "gmail", purgeRun: false, replaceConnection: true },
    ])(
      "rejects held $phase output after purge=$purgeRun and replacement=$replaceConnection",
      async ({ phase, purgeRun, replaceConnection }) => {
        const userId = randomUUID();
        const runId = randomUUID();
        const connectionId = randomUUID();
        const envelope = `v1:${"a".repeat(16)}:${"b".repeat(22)}:ciphertext`;
        let releaseProvider!: () => void;
        let notifyEntered!: () => void;
        const held = new Promise<void>((resolve) => {
          releaseProvider = resolve;
        });
        const entered = new Promise<void>((resolve) => {
          notifyEntered = resolve;
        });
        let extractionCalls = 0;
        const extractor: Extractor = {
          version: "held-test-v1",
          model: "local-test",
          async extract() {
            extractionCalls++;
            if (phase === "extractor") {
              notifyEntered();
              await held;
            }
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
            async request(_userId, url) {
              if (new URL(url).pathname.endsWith("/messages"))
                return { messages: [{ id: "old-message" }] };
              if (phase === "gmail") {
                notifyEntered();
                await held;
              }
              return {
                id: "old-message",
                threadId: "old-thread",
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
              throw new Error(
                "This regression applies the disconnect transaction directly",
              );
            },
          },
        };
        let processing: Promise<void> | undefined;
        await pool.query(
          "INSERT INTO users(id,email,display_name) VALUES($1,$2,'Anonymized race test')",
          [userId, `${userId}@example.invalid`],
        );
        try {
          await pool.query(
            `INSERT INTO google_connections(id,user_id,google_subject,access_token_encrypted,access_token_expires_at,scopes)
        VALUES($1,$2,$3,$4,now()+interval '1 hour',ARRAY['openid'])`,
            [connectionId, userId, userId, envelope],
          );
          await pool.query("INSERT INTO sync_runs(id,user_id) VALUES($1,$2)", [
            runId,
            userId,
          ]);
          processing = processSync(runtime, { runId, userId }, extractor);
          await entered;
          // Hold the actual provider promise while the same lock/purge/reconnect
          // sequence as disconnect removes the original run's authorization.
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
              userId,
            ]);
            await client.query(
              "UPDATE google_connections SET revoked_at=now() WHERE user_id=$1",
              [userId],
            );
            if (purgeRun) {
              await client.query(
                "DELETE FROM email_messages WHERE user_id=$1",
                [userId],
              );
              await client.query("DELETE FROM sync_runs WHERE user_id=$1", [
                userId,
              ]);
            }
            await client.query(
              "DELETE FROM google_connections WHERE user_id=$1",
              [userId],
            );
            await client.query(
              `INSERT INTO google_connections(id,user_id,google_subject,access_token_encrypted,access_token_expires_at,scopes)
          VALUES($1,$2,$3,$4,now()+interval '1 hour',ARRAY['openid'])`,
              [
                replaceConnection ? randomUUID() : connectionId,
                userId,
                userId,
                envelope,
              ],
            );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
          releaseProvider();
          await processing;
          expect(
            (
              await pool.query(
                "SELECT id FROM email_messages WHERE user_id=$1",
                [userId],
              )
            ).rowCount,
          ).toBe(0);
          expect(
            (
              await pool.query("SELECT id FROM suggestions WHERE user_id=$1", [
                userId,
              ])
            ).rowCount,
          ).toBe(0);
          expect(
            (
              await pool.query(
                "SELECT id FROM extraction_runs WHERE user_id=$1",
                [userId],
              )
            ).rowCount,
          ).toBe(0);
          const runs = await pool.query(
            "SELECT status FROM sync_runs WHERE id=$1",
            [runId],
          );
          if (purgeRun) expect(runs.rowCount).toBe(0);
          else expect(runs.rows[0].status).toBe("Failed");
          expect(extractionCalls).toBe(phase === "gmail" ? 0 : 1);
        } finally {
          releaseProvider();
          await processing;
          await pool.query("DELETE FROM users WHERE id=$1", [userId]);
        }
      },
    );
  },
);
