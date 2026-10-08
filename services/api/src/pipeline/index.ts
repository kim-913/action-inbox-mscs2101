import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { PgBoss } from "pg-boss";
import { z } from "zod";
import {
  apiRoutes,
  emptyRequestSchema,
  inboxQuerySchema,
} from "@action-inbox/contracts";
import { ApiFailure, authenticatedUser, type Runtime } from "../runtime.js";
import { OpenAIExtractor } from "./extractor.js";
import {
  safePipelineError,
  serializeEmail,
  serializeRun,
  serializeSuggestion,
  withConnectedUser,
  type EmailRow,
  type SuggestionRow,
  type SyncRow,
} from "./store.js";
import { finishFailedRun, processSync, type SyncJob } from "./worker.js";

const QUEUE = "gmail-sync-v1";
const DEAD_QUEUE = "gmail-sync-failed-v1";
const idParams = z.strictObject({ id: z.uuid() });
const cursorSchema = z.strictObject({
  receivedAt: z.iso.datetime(),
  id: z.uuid(),
});
interface InboxRow extends EmailRow {
  received_cursor: string;
}
export interface SyncPipeline {
  close(): Promise<void>;
  enqueue(client: pg.PoolClient, userId: string): Promise<SyncRow>;
}
export async function registerPipeline(
  app: FastifyInstance,
  runtime: Runtime,
): Promise<SyncPipeline> {
  const boss = new PgBoss({
    db: { executeSql: (text, values) => runtime.pool.query(text, values) },
  });
  boss.on("error", () =>
    app.log.error(
      { code: "QUEUE_UNAVAILABLE" },
      "Background queue is unavailable.",
    ),
  );
  const extractor = new OpenAIExtractor(
    runtime.config.openaiApiKey,
    runtime.config.openaiBaseUrl,
    runtime.config.openaiModel,
  );
  await boss.start();
  try {
    await boss.createQueue(DEAD_QUEUE, { retryLimit: 20, retryDelay: 30 });
    await boss.createQueue(QUEUE, {
      retryLimit: 2,
      retryDelay: 30,
      expireInSeconds: 7200,
      deadLetter: DEAD_QUEUE,
    });
    await boss.work<SyncJob>(QUEUE, { batchSize: 1 }, async (jobs) => {
      try {
        for (const job of jobs) await processSync(runtime, job.data, extractor);
      } catch {
        throw new Error("Synchronization storage is temporarily unavailable.");
      }
    });
    await boss.work<SyncJob>(DEAD_QUEUE, { batchSize: 1 }, async (jobs) => {
      try {
        for (const job of jobs)
          await finishFailedRun(
            runtime,
            job.data,
            safePipelineError(null, job.data.runId),
          );
      } catch {
        throw new Error(
          "Synchronization failure storage is temporarily unavailable.",
        );
      }
    });
  } catch {
    await boss.stop();
    throw new ApiFailure(
      503,
      "INTERNAL_ERROR",
      "Background processing could not start.",
    );
  }
  // Callers hold the user's row lock and commit the run and job together.
  const enqueue = async (client: pg.PoolClient, userId: string) => {
    const existing = await client.query<SyncRow>(
      "SELECT * FROM sync_runs WHERE user_id=$1 AND status IN ('Queued','Running')",
      [userId],
    );
    if (existing.rows[0]) return existing.rows[0];
    const id = randomUUID();
    const result = await client.query<SyncRow>(
      "INSERT INTO sync_runs(id,user_id) VALUES($1,$2) RETURNING *",
      [id, userId],
    );
    const queued = await boss.send(
      QUEUE,
      { runId: id, userId },
      {
        id,
        retryLimit: 2,
        retryDelay: 30,
        expireInSeconds: 7200,
        deadLetter: DEAD_QUEUE,
        db: { executeSql: (text, values) => client.query(text, values) },
      },
    );
    if (!queued)
      throw new ApiFailure(
        503,
        "INTERNAL_ERROR",
        "Synchronization could not be queued. Retry synchronization.",
      );
    return result.rows[0]!;
  };
  const options = { preHandler: runtime.requireUser };
  app.post(apiRoutes.sync, options, async (request, reply) => {
    emptyRequestSchema.parse(request.body);
    const userId = authenticatedUser(request);
    const run = await withConnectedUser(runtime.pool, userId, (client) =>
      enqueue(client, userId),
    );
    return reply.code(202).send(serializeRun(run));
  });
  app.get(apiRoutes.syncRun, options, async (request) => {
    const { id } = idParams.parse(request.params);
    const result = await runtime.pool.query<SyncRow>(
      "SELECT * FROM sync_runs WHERE id=$1 AND user_id=$2",
      [id, authenticatedUser(request)],
    );
    if (!result.rows[0])
      throw new ApiFailure(
        404,
        "NOT_FOUND",
        "This synchronization does not exist.",
      );
    return serializeRun(result.rows[0]);
  });
  app.get(apiRoutes.inbox, options, async (request) => {
    const userId = authenticatedUser(request);
    const query = inboxQuerySchema.parse(request.query);
    let cursor: z.infer<typeof cursorSchema> | null = null;
    if (query.cursor) {
      try {
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
        );
      } catch {
        throw new ApiFailure(
          400,
          "INVALID_REQUEST",
          "The page cursor is invalid.",
        );
      }
    }
    const messages = await runtime.pool.query<InboxRow>(
      `SELECT e.*,
      to_char(e.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS received_cursor
      FROM email_messages e WHERE e.user_id=$1
      AND ($2::text IS NULL OR e.category=$2)
      AND ($3::text IS NULL OR EXISTS(SELECT 1 FROM suggestions s WHERE s.email_id=e.id AND s.user_id=$1 AND s.review_state=$3))
      AND ($4::timestamptz IS NULL OR (e.received_at,e.id)<($4::timestamptz,$5::uuid))
      ORDER BY e.received_at DESC,e.id DESC LIMIT $6`,
      [
        userId,
        query.category ?? null,
        query.reviewState ?? null,
        cursor?.receivedAt ?? null,
        cursor?.id ?? null,
        query.limit + 1,
      ],
    );
    const page = messages.rows.slice(0, query.limit);
    const suggestions = await runtime.pool.query<SuggestionRow>(
      "SELECT * FROM suggestions WHERE user_id=$1 AND email_id=ANY($2::uuid[]) ORDER BY created_at,id",
      [userId, page.map((row) => row.id)],
    );
    const grouped = new Map<string, SuggestionRow[]>();
    for (const row of suggestions.rows) {
      const group = grouped.get(row.email_id) ?? [];
      group.push(row);
      grouped.set(row.email_id, group);
    }
    const latest = await runtime.pool.query<SyncRow>(
      "SELECT * FROM sync_runs WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
      [userId],
    );
    const success = await runtime.pool.query<{ completed_at: Date }>(
      "SELECT completed_at FROM sync_runs WHERE user_id=$1 AND status='Succeeded' ORDER BY completed_at DESC LIMIT 1",
      [userId],
    );
    const last = page.at(-1);
    return {
      items: page.map((row) =>
        serializeEmail(
          row,
          (grouped.get(row.id) ?? []).map(serializeSuggestion),
        ),
      ),
      nextCursor:
        messages.rows.length > query.limit && last
          ? Buffer.from(
              JSON.stringify({ receivedAt: last.received_cursor, id: last.id }),
            ).toString("base64url")
          : null,
      dataState: {
        latestSyncRun: latest.rows[0] ? serializeRun(latest.rows[0]) : null,
        lastSuccessfulSyncAt:
          success.rows[0]?.completed_at.toISOString() ?? null,
      },
    };
  });
  app.get(apiRoutes.email, options, async (request) => {
    const { id } = idParams.parse(request.params);
    const userId = authenticatedUser(request);
    const result = await runtime.pool.query<EmailRow>(
      "SELECT * FROM email_messages WHERE id=$1 AND user_id=$2",
      [id, userId],
    );
    const email = result.rows[0];
    if (!email)
      throw new ApiFailure(404, "NOT_FOUND", "This email does not exist.");
    const suggestions = await runtime.pool.query<SuggestionRow>(
      "SELECT * FROM suggestions WHERE email_id=$1 AND user_id=$2 ORDER BY created_at,id",
      [id, userId],
    );
    return {
      ...serializeEmail(email, suggestions.rows.map(serializeSuggestion)),
      normalizedBody: email.normalized_body,
    };
  });
  return {
    enqueue,
    close: async () => {
      await boss.stop({ graceful: true, timeout: 30_000 });
    },
  };
}
