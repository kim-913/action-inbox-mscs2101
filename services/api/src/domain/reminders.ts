import type { FastifyInstance } from "fastify";
import {
  apiRoutes,
  reminderCreateRequestSchema,
  reminderEditRequestSchema,
} from "@action-inbox/contracts";
import { authenticatedUser, type Runtime } from "../runtime.js";
import {
  conflict,
  lockTask,
  missing,
  parse,
  resourceId,
  serializeReminder,
  transaction,
  type ReminderRow,
} from "./store.js";

export function registerReminders(
  app: FastifyInstance,
  runtime: Runtime,
): void {
  app.post(
    apiRoutes.reminders,
    { preHandler: runtime.requireUser },
    async (request, reply) => {
      const taskId = resourceId(request.params);
      const body = parse(reminderCreateRequestSchema, request.body);
      const userId = authenticatedUser(request);
      const scheduledAt = new Date(body.scheduledAt);
      const reminder = await transaction(runtime, userId, async (client) => {
        await lockTask(client, userId, taskId);
        const existing = await client.query<ReminderRow>(
          "SELECT * FROM reminders WHERE task_id=$1 AND request_id=$2",
          [taskId, body.requestId],
        );
        const row = existing.rows[0];
        if (row) {
          if (row.requested_at.getTime() !== scheduledAt.getTime()) conflict();
          return serializeReminder(row);
        }
        const inserted = await client.query<ReminderRow>(
          "INSERT INTO reminders(task_id,request_id,requested_at,scheduled_at) VALUES ($1,$2,$3,$3) RETURNING *",
          [taskId, body.requestId, scheduledAt],
        );
        return serializeReminder(inserted.rows[0]!);
      });
      return reply.code(201).send(reminder);
    },
  );

  app.patch(
    apiRoutes.reminder,
    { preHandler: runtime.requireUser },
    async (request) => {
      const id = resourceId(request.params);
      const body = parse(reminderEditRequestSchema, request.body);
      const userId = authenticatedUser(request);
      return transaction(runtime, userId, async (client) => {
        const existing = await client.query<ReminderRow>(
          "SELECT r.* FROM reminders r JOIN tasks t ON t.id=r.task_id WHERE r.id=$1 AND t.user_id=$2 FOR UPDATE OF r",
          [id, userId],
        );
        const row = existing.rows[0] ?? missing();
        if (row.status === "Cancelled") conflict();
        const updated = await client.query<ReminderRow>(
          "UPDATE reminders SET scheduled_at=$2 WHERE id=$1 RETURNING *",
          [row.id, body.scheduledAt],
        );
        return serializeReminder(updated.rows[0]!);
      });
    },
  );

  app.delete(
    apiRoutes.reminder,
    { preHandler: runtime.requireUser },
    async (request) => {
      const id = resourceId(request.params);
      const userId = authenticatedUser(request);
      return transaction(runtime, userId, async (client) => {
        const result = await client.query(
          "UPDATE reminders r SET status='Cancelled' FROM tasks t WHERE r.id=$1 AND r.task_id=t.id AND t.user_id=$2 RETURNING r.id",
          [id, userId],
        );
        if (!result.rowCount) missing();
        return { ok: true };
      });
    },
  );
}
