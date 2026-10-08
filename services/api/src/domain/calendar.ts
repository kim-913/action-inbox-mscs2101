import type { FastifyInstance } from "fastify";
import type pg from "pg";
import {
  apiRoutes,
  calendarEventCreateRequestSchema,
  upcomingCalendarQuerySchema,
  type ApiError,
  type CalendarEvent,
} from "@action-inbox/contracts";
import { ApiFailure, authenticatedUser, type Runtime } from "../runtime.js";
import {
  conflict,
  lockTask,
  missing,
  parse,
  requireConnection,
  resourceId,
  serializeLink,
  transaction,
  type CalendarIntent,
} from "./store.js";
import {
  createOrReconcileEvent,
  deterministicEventId,
  eventsUrl,
  googleErrorBody,
  parseUpcoming,
  safeGoogleFailure,
  validTimezone,
} from "./calendar-provider.js";
import { calendarInRange } from "./display-window.js";

interface SnapshotRow extends pg.QueryResultRow {
  items: CalendarEvent[];
  last_successful_fetch_at: Date | null;
  error: ApiError | null;
}

export function registerCalendar(app: FastifyInstance, runtime: Runtime): void {
  app.get(
    apiRoutes.upcoming,
    { preHandler: runtime.requireUser },
    async (request) => {
      const userId = authenticatedUser(request);
      const query = parse(upcomingCalendarQuerySchema, request.query);
      const users = await runtime.pool.query<{ timezone: string }>(
        "SELECT timezone FROM users WHERE id=$1",
        [userId],
      );
      const timezone = users.rows[0]?.timezone ?? "UTC";
      const url = new URL(eventsUrl(runtime));
      url.searchParams.set(
        "timeMin",
        query.startAt ?? new Date().toISOString(),
      );
      if (query.endAt) url.searchParams.set("timeMax", query.endAt);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "100");
      url.searchParams.set(
        "timeZone",
        validTimezone(timezone) ? timezone : "UTC",
      );
      let items: CalendarEvent[] | undefined;
      let error: ApiError | null = null;
      try {
        items = parseUpcoming(
          await runtime.google.request(userId, url.toString()),
        );
      } catch (failure) {
        error = googleErrorBody(safeGoogleFailure(failure), request.id);
      }
      return transaction(runtime, userId, async (client) => {
        if (items !== undefined) {
          await requireConnection(client, userId);
          await client.query(
            `INSERT INTO calendar_snapshots(user_id,items,last_successful_fetch_at) VALUES ($1,$2,now())
           ON CONFLICT(user_id) DO UPDATE SET items=EXCLUDED.items,last_successful_fetch_at=EXCLUDED.last_successful_fetch_at,error=NULL,updated_at=now()`,
            [userId, JSON.stringify(items)],
          );
        } else {
          // A completed disconnect must not recreate retained provider data.
          await client.query(
            `INSERT INTO calendar_snapshots(user_id,error) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM google_connections WHERE user_id=$1)
           ON CONFLICT(user_id) DO UPDATE SET error=EXCLUDED.error,updated_at=now()`,
            [userId, JSON.stringify(error)],
          );
        }
        const snapshots = await client.query<SnapshotRow>(
          "SELECT * FROM calendar_snapshots WHERE user_id=$1",
          [userId],
        );
        const snapshot = snapshots.rows[0];
        return {
          items: (snapshot?.items ?? []).filter((item) =>
            calendarInRange(item, query),
          ),
          lastSuccessfulFetchAt:
            snapshot?.last_successful_fetch_at?.toISOString() ?? null,
          error: error ?? snapshot?.error ?? null,
        };
      });
    },
  );

  app.post(
    apiRoutes.createEvent,
    { preHandler: runtime.requireUser },
    async (request) => {
      const taskId = resourceId(request.params);
      const body = parse(calendarEventCreateRequestSchema, request.body);
      if (!validTimezone(body.timezone))
        throw new ApiFailure(
          400,
          "INVALID_REQUEST",
          "Choose a valid IANA timezone.",
        );
      const userId = authenticatedUser(request);
      const content = {
        title: body.title,
        startAt: new Date(body.startAt).toISOString(),
        endAt: new Date(body.endAt).toISOString(),
        timezone: body.timezone,
      };
      const intent = await transaction(runtime, userId, async (client) => {
        await lockTask(client, userId, taskId);
        await requireConnection(client, userId);
        const existing = await client.query<CalendarIntent>(
          "SELECT * FROM calendar_event_links WHERE task_id=$1",
          [taskId],
        );
        const row = existing.rows[0];
        if (row) {
          if (
            row.request_content.title !== content.title ||
            row.request_content.startAt !== content.startAt ||
            row.request_content.endAt !== content.endAt ||
            row.request_content.timezone !== content.timezone
          )
            conflict();
          // The task owns the durable intent. A reloaded browser may have a new
          // request UUID, but must reuse the original provider identity/markers.
          return row;
        }
        const inserted = await client.query<CalendarIntent>(
          "INSERT INTO calendar_event_links(task_id,google_event_id,request_id,request_content) VALUES ($1,$2,$3,$4) RETURNING *",
          [
            taskId,
            deterministicEventId(userId, taskId),
            body.requestId,
            JSON.stringify(content),
          ],
        );
        return inserted.rows[0]!;
      });
      if (intent.status === "Created") return serializeLink(intent);
      let htmlLink: string | null = null;
      let failure: ApiFailure | null = null;
      try {
        htmlLink = await createOrReconcileEvent(runtime, userId, intent);
      } catch (error) {
        failure = safeGoogleFailure(error);
      }
      const link = await transaction(runtime, userId, async (client) => {
        await lockTask(client, userId, taskId);
        if (!failure) {
          await requireConnection(client, userId);
          const updated = await client.query<CalendarIntent>(
            "UPDATE calendar_event_links SET status='Created',html_link=$2,error=NULL,updated_at=now() WHERE task_id=$1 RETURNING *",
            [taskId, htmlLink],
          );
          return updated.rows[0] ?? missing();
        }
        await client.query(
          "UPDATE calendar_event_links SET status='Failed',error=$2,updated_at=now() WHERE task_id=$1 AND status<>'Created'",
          [taskId, JSON.stringify(googleErrorBody(failure, request.id))],
        );
        const current = await client.query<CalendarIntent>(
          "SELECT * FROM calendar_event_links WHERE task_id=$1",
          [taskId],
        );
        return current.rows[0] ?? missing();
      });
      // A concurrent successful response wins over a failed request for the same
      // durable intent. In particular, failure cannot downgrade Created.
      if (link.status === "Created") return serializeLink(link);
      throw failure ?? safeGoogleFailure(null);
    },
  );
}
