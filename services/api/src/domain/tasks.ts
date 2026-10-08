import type { FastifyInstance } from "fastify";
import {
  apiRoutes,
  taskCreateRequestSchema,
  taskEditRequestSchema,
  tasksQuerySchema,
} from "@action-inbox/contracts";
import { authenticatedUser, type Runtime } from "../runtime.js";
import {
  conflict,
  decodeCursor,
  encodeCursor,
  lockTask,
  missing,
  parse,
  resourceId,
  serializeTask,
  serializeTasks,
  transaction,
  type TaskRow,
} from "./store.js";
import { filterKey } from "./display-window.js";

export function registerTasks(app: FastifyInstance, runtime: Runtime): void {
  app.get(
    apiRoutes.tasks,
    { preHandler: runtime.requireUser },
    async (request) => {
      const query = parse(tasksQuerySchema, request.query);
      const userId = authenticatedUser(request);
      const filter = filterKey(userId, query);
      const cursor = decodeCursor(query.cursor, filter);
      return transaction(runtime, userId, async (client) => {
        const result = await client.query<
          TaskRow & { cursor_created_at: string }
        >(
          `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
         FROM tasks WHERE user_id=$1 AND ($2::text IS NULL OR status=$2)
         AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid))
         AND ($6::timestamptz IS NULL OR (due_at >= $6::timestamptz AND due_at < $7::timestamptz) OR ($8::boolean AND due_at IS NULL))
         AND ($9::text IS NULL OR ($9='gmail' AND source_email_id IS NOT NULL) OR ($9='manual' AND source_email_id IS NULL))
         ORDER BY created_at DESC,id DESC LIMIT $5`,
          [
            userId,
            query.status ?? null,
            cursor?.createdAt ?? null,
            cursor?.id ?? null,
            query.limit + 1,
            query.startAt ?? null,
            query.endAt ?? null,
            query.includeUndated === "true",
            query.source ?? null,
          ],
        );
        const page = result.rows.slice(0, query.limit);
        return {
          items: await serializeTasks(client, page),
          nextCursor:
            result.rows.length > query.limit
              ? encodeCursor(page[page.length - 1]!, filter)
              : null,
        };
      });
    },
  );

  app.get(
    apiRoutes.task,
    { preHandler: runtime.requireUser },
    async (request) => {
      const id = resourceId(request.params);
      const userId = authenticatedUser(request);
      return transaction(runtime, userId, async (client) => {
        const result = await client.query<TaskRow>(
          "SELECT * FROM tasks WHERE user_id=$1 AND id=$2",
          [userId, id],
        );
        const row = result.rows[0];
        if (!row) return missing();
        return serializeTask(client, row);
      });
    },
  );

  app.post(
    apiRoutes.tasks,
    { preHandler: runtime.requireUser },
    async (request, reply) => {
      const body = parse(taskCreateRequestSchema, request.body);
      const userId = authenticatedUser(request);
      const content = {
        title: body.title,
        dueAt: body.dueAt === null ? null : new Date(body.dueAt).toISOString(),
      };
      const task = await transaction(runtime, userId, async (client) => {
        const existing = await client.query<TaskRow>(
          "SELECT * FROM tasks WHERE user_id=$1 AND request_id=$2",
          [userId, body.requestId],
        );
        const row = existing.rows[0];
        if (row) {
          if (
            row.request_content?.title !== content.title ||
            row.request_content.dueAt !== content.dueAt
          )
            conflict();
          return serializeTask(client, row);
        }
        const inserted = await client.query<TaskRow>(
          "INSERT INTO tasks(user_id,request_id,request_content,title,due_at) VALUES ($1,$2,$3,$4,$5) RETURNING *",
          [
            userId,
            body.requestId,
            JSON.stringify(content),
            content.title,
            content.dueAt,
          ],
        );
        return serializeTask(client, inserted.rows[0]!);
      });
      return reply.code(201).send(task);
    },
  );

  app.patch(
    apiRoutes.task,
    { preHandler: runtime.requireUser },
    async (request) => {
      const id = resourceId(request.params);
      const body = parse(taskEditRequestSchema, request.body);
      const userId = authenticatedUser(request);
      return transaction(runtime, userId, async (client) => {
        const row = await lockTask(client, userId, id);
        if (row.version !== body.version) conflict();
        const status = body.status ?? row.status;
        if (row.status === "Completed" && status === "Waiting for Reply")
          conflict();
        const completedAt =
          status === "Completed" ? (row.completed_at ?? new Date()) : null;
        const result = await client.query<TaskRow>(
          "UPDATE tasks SET title=$3,due_at=$4,status=$5,completed_at=$6,version=version+1 WHERE id=$1 AND user_id=$2 RETURNING *",
          [
            id,
            userId,
            body.title ?? row.title,
            body.dueAt === undefined ? row.due_at : body.dueAt,
            status,
            completedAt,
          ],
        );
        return serializeTask(client, result.rows[0]!);
      });
    },
  );
}
