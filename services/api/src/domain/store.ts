import type pg from "pg";
import { z } from "zod";
import type { ApiError, Reminder, Task } from "@action-inbox/contracts";
import { ApiFailure, type Runtime } from "../runtime.js";

export interface TaskRow extends pg.QueryResultRow {
  id: string;
  user_id: string;
  source_suggestion_id: string | null;
  source_email_id: string | null;
  request_id: string | null;
  request_content: { title: string; dueAt: string | null } | null;
  title: string;
  due_at: Date | null;
  status: Task["status"];
  approved_at: Date;
  completed_at: Date | null;
  version: number;
  created_at: Date;
}

export interface ReminderRow extends pg.QueryResultRow {
  id: string;
  task_id: string;
  request_id: string;
  requested_at: Date;
  scheduled_at: Date;
  status: Reminder["status"];
}

export interface CalendarIntent extends pg.QueryResultRow {
  task_id: string;
  google_event_id: string;
  request_id: string;
  request_content: {
    title: string;
    startAt: string;
    endAt: string;
    timezone: string;
  };
  status: "Requested" | "Created" | "Failed";
  html_link: string | null;
  error: ApiError | null;
}

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiFailure(
      400,
      "INVALID_REQUEST",
      "Check the request fields and try again.",
    );
  return result.data;
}

export function resourceId(params: unknown): string {
  return parse(z.strictObject({ id: z.uuid() }), params).id;
}

export function conflict(): never {
  throw new ApiFailure(
    409,
    "CONFLICT",
    "This item changed or the request key was already used. Refresh and try again.",
  );
}

export function missing(): never {
  throw new ApiFailure(404, "NOT_FOUND", "This resource does not exist.");
}

export async function transaction<T>(
  runtime: Runtime,
  userId: string,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await runtime.pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      "SELECT id FROM users WHERE id=$1 FOR UPDATE",
      [userId],
    );
    if (!user.rowCount)
      throw new ApiFailure(401, "UNAUTHENTICATED", "Sign in to continue.");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function requireConnection(
  client: pg.PoolClient,
  userId: string,
): Promise<void> {
  const result = await client.query(
    "SELECT id FROM google_connections WHERE user_id=$1 AND revoked_at IS NULL",
    [userId],
  );
  if (!result.rowCount)
    throw new ApiFailure(
      401,
      "GOOGLE_RECONNECT_REQUIRED",
      "Connect Google to continue.",
    );
}

export async function lockTask(
  client: pg.PoolClient,
  userId: string,
  id: string,
): Promise<TaskRow> {
  const result = await client.query<TaskRow>(
    "SELECT * FROM tasks WHERE user_id=$1 AND id=$2 FOR UPDATE",
    [userId, id],
  );
  return result.rows[0] ?? missing();
}

export function serializeReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    taskId: row.task_id,
    scheduledAt: row.scheduled_at.toISOString(),
    status: row.status,
    delivery: "Not configured",
  };
}

export function serializeLink(
  row: CalendarIntent,
): NonNullable<Task["calendarLink"]> {
  return {
    status: row.status,
    googleEventId: row.google_event_id,
    htmlLink: row.html_link,
    error: row.error,
  };
}

export async function serializeTasks(
  client: pg.PoolClient,
  rows: TaskRow[],
): Promise<Task[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const reminders = await client.query<ReminderRow>(
    "SELECT * FROM reminders WHERE task_id=ANY($1::uuid[]) ORDER BY created_at,id",
    [ids],
  );
  const links = await client.query<CalendarIntent>(
    "SELECT * FROM calendar_event_links WHERE task_id=ANY($1::uuid[])",
    [ids],
  );
  const byTask = new Map<string, Reminder[]>();
  for (const reminder of reminders.rows) {
    const values = byTask.get(reminder.task_id) ?? [];
    values.push(serializeReminder(reminder));
    byTask.set(reminder.task_id, values);
  }
  const linkByTask = new Map(
    links.rows.map((link) => [link.task_id, serializeLink(link)]),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueAt: row.due_at?.toISOString() ?? null,
    status: row.status,
    sourceSuggestionId: row.source_suggestion_id,
    sourceEmailId: row.source_email_id,
    approvedAt: row.approved_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    version: row.version,
    reminders: byTask.get(row.id) ?? [],
    calendarLink: linkByTask.get(row.id) ?? null,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function serializeTask(
  client: pg.PoolClient,
  row: TaskRow,
): Promise<Task> {
  const tasks = await serializeTasks(client, [row]);
  return tasks[0]!;
}

const cursorSchema = z.strictObject({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  filter: z.string().length(64),
});
export function decodeCursor(
  cursor: string | undefined,
  filter: string,
): z.infer<typeof cursorSchema> | null {
  if (cursor === undefined) return null;
  try {
    const decoded = parse(
      cursorSchema,
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown,
    );
    if (decoded.filter !== filter) throw new Error("Changed filters");
    return decoded;
  } catch {
    throw new ApiFailure(400, "INVALID_REQUEST", "The page cursor is invalid.");
  }
}

export function encodeCursor(
  row: {
    id: string;
    cursor_created_at: string;
  },
  filter: string,
): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.cursor_created_at, id: row.id, filter }),
  ).toString("base64url");
}
