import type { FastifyInstance } from "fastify";
import {
  apiRoutes,
  suggestionApproveRequestSchema,
  suggestionEditRequestSchema,
  versionRequestSchema,
} from "@action-inbox/contracts";
import { authenticatedUser, type Runtime } from "../runtime.js";
import { serializeSuggestion, type SuggestionRow } from "../pipeline/store.js";
import {
  conflict,
  missing,
  parse,
  resourceId,
  serializeTask,
  transaction,
  type TaskRow,
} from "./store.js";

export function registerSuggestions(
  app: FastifyInstance,
  runtime: Runtime,
): void {
  app.patch(
    apiRoutes.suggestion,
    { preHandler: runtime.requireUser },
    async (request) => {
      const id = resourceId(request.params);
      const body = parse(suggestionEditRequestSchema, request.body);
      const userId = authenticatedUser(request);
      return transaction(runtime, userId, async (client) => {
        const result = await client.query<SuggestionRow>(
          "SELECT * FROM suggestions WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, userId],
        );
        const row = result.rows[0] ?? missing();
        if (row.review_state !== "Proposed" || row.version !== body.version)
          conflict();
        const updated = await client.query<SuggestionRow>(
          "UPDATE suggestions SET title=$3,due_at=$4,version=version+1 WHERE id=$1 AND user_id=$2 RETURNING *",
          [
            id,
            userId,
            body.title ?? row.title,
            body.dueAt === undefined ? row.due_at : body.dueAt,
          ],
        );
        return serializeSuggestion(updated.rows[0]!);
      });
    },
  );

  app.post(
    apiRoutes.reject,
    { preHandler: runtime.requireUser },
    async (request) => {
      const id = resourceId(request.params);
      const body = parse(versionRequestSchema, request.body);
      const userId = authenticatedUser(request);
      return transaction(runtime, userId, async (client) => {
        const result = await client.query<SuggestionRow>(
          "SELECT * FROM suggestions WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, userId],
        );
        const row = result.rows[0] ?? missing();
        if (row.review_state !== "Proposed" || row.version !== body.version)
          conflict();
        const updated = await client.query<SuggestionRow>(
          "UPDATE suggestions SET review_state='Rejected',version=version+1 WHERE id=$1 AND user_id=$2 RETURNING *",
          [id, userId],
        );
        return serializeSuggestion(updated.rows[0]!);
      });
    },
  );

  app.post(
    apiRoutes.approve,
    { preHandler: runtime.requireUser },
    async (request) => {
      const id = resourceId(request.params);
      const body = parse(suggestionApproveRequestSchema, request.body);
      const userId = authenticatedUser(request);
      return transaction(runtime, userId, async (client) => {
        const result = await client.query<SuggestionRow>(
          "SELECT * FROM suggestions WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, userId],
        );
        const row = result.rows[0] ?? missing();
        if (row.review_state === "Approved") {
          const tasks = await client.query<TaskRow>(
            "SELECT * FROM tasks WHERE source_suggestion_id=$1 AND user_id=$2",
            [id, userId],
          );
          return serializeTask(client, tasks.rows[0] ?? missing());
        }
        if (row.review_state !== "Proposed" || row.version !== body.version)
          conflict();
        const title = body.title ?? row.title;
        const dueAt = body.dueAt === undefined ? row.due_at : body.dueAt;
        await client.query(
          "UPDATE suggestions SET title=$3,due_at=$4,review_state='Approved',version=version+1 WHERE id=$1 AND user_id=$2",
          [id, userId, title, dueAt],
        );
        const task = await client.query<TaskRow>(
          "INSERT INTO tasks(user_id,source_suggestion_id,source_email_id,title,due_at) VALUES ($1,$2,$3,$4,$5) RETURNING *",
          [userId, id, row.email_id, title, dueAt],
        );
        return serializeTask(client, task.rows[0]!);
      });
    },
  );
}
