import { createHash } from "node:crypto";
import { z } from "zod";
import type { ApiError, CalendarEvent } from "@action-inbox/contracts";
import { ApiFailure, type Runtime } from "../runtime.js";
import type { CalendarIntent } from "./store.js";

const date = z.iso.date();
const instant = z.iso.datetime({ offset: true });
const htmlLink = z
  .url()
  .refine((value) => new URL(value).protocol === "https:");
const boundary = z.object({
  date: date.optional(),
  dateTime: instant.optional(),
  timeZone: z.string().optional(),
});
const eventSchema = z.object({
  id: z.string().min(1),
  summary: z.string().optional(),
  status: z.string().optional(),
  start: boundary.optional(),
  end: boundary.optional(),
  htmlLink: htmlLink.optional(),
  extendedProperties: z
    .object({ private: z.record(z.string(), z.string()).optional() })
    .optional(),
});

export function safeGoogleFailure(error: unknown): ApiFailure {
  if (error instanceof ApiFailure) {
    if (error.code === "GOOGLE_RECONNECT_REQUIRED")
      return new ApiFailure(401, error.code, "Reconnect Google to continue.");
    if (error.code === "PROVIDER_NOT_CONFIGURED")
      return new ApiFailure(
        503,
        error.code,
        "Google integration is not configured.",
      );
    if (error.code === "RATE_LIMITED")
      return new ApiFailure(
        429,
        error.code,
        "Google is busy. Try again later.",
      );
    if (error.code === "CONFLICT")
      return new ApiFailure(
        409,
        error.code,
        "The calendar event does not match this request.",
      );
    if (error.code === "GOOGLE_UNAVAILABLE" && error.status === 504)
      return new ApiFailure(
        504,
        error.code,
        "Google did not respond in time. Retry the same request.",
      );
  }
  return new ApiFailure(
    502,
    "GOOGLE_UNAVAILABLE",
    "Google Calendar is unavailable. Try again later.",
  );
}

export function googleErrorBody(
  error: ApiFailure,
  requestId: string,
): ApiError {
  return {
    code: error.code as ApiError["code"],
    message: error.message,
    requestId,
  };
}

export function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function eventsUrl(runtime: Runtime): string {
  return `${runtime.config.calendarBaseUrl.replace(/\/$/, "")}/calendars/primary/events`;
}

export function deterministicEventId(userId: string, taskId: string): string {
  return createHash("sha256")
    .update(`action-inbox:${userId}:${taskId}`)
    .digest("hex");
}

export function parseUpcoming(input: unknown): CalendarEvent[] {
  const parsed = z
    .object({ items: z.array(eventSchema).default([]) })
    .safeParse(input);
  if (!parsed.success) throw safeGoogleFailure(null);
  const items: CalendarEvent[] = [];
  for (const event of parsed.data.items) {
    if (event.status === "cancelled") continue;
    const allDay =
      event.start?.date !== undefined && event.end?.date !== undefined;
    const start = allDay ? event.start?.date : event.start?.dateTime;
    const end = allDay ? event.end?.date : event.end?.dateTime;
    if (!start || !end || Date.parse(end) <= Date.parse(start))
      throw safeGoogleFailure(null);
    items.push({
      id: event.id,
      title: event.summary ?? "",
      start,
      end,
      allDay,
      htmlLink: event.htmlLink ?? null,
    });
  }
  return items;
}

function verifyCreatedEvent(
  input: unknown,
  intent: CalendarIntent,
  userId: string,
  intentHash: string,
): string | null {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) throw safeGoogleFailure(null);
  const event = parsed.data;
  const marker = event.extendedProperties?.private;
  if (
    event.id !== intent.google_event_id ||
    event.status === "cancelled" ||
    marker?.actionInboxTaskId !== intent.task_id ||
    marker.actionInboxUserId !== userId ||
    marker.actionInboxIntentHash !== intentHash ||
    event.summary !== intent.request_content.title ||
    !event.start?.dateTime ||
    !event.end?.dateTime ||
    Date.parse(event.start.dateTime) !==
      Date.parse(intent.request_content.startAt) ||
    Date.parse(event.end.dateTime) !== Date.parse(intent.request_content.endAt)
  )
    throw new ApiFailure(
      409,
      "CONFLICT",
      "The calendar event does not match this request.",
    );
  return event.htmlLink ?? null;
}

export async function createOrReconcileEvent(
  runtime: Runtime,
  userId: string,
  intent: CalendarIntent,
): Promise<string | null> {
  const collectionUrl = eventsUrl(runtime);
  const eventUrl = `${collectionUrl}/${intent.google_event_id}`;
  const content = intent.request_content;
  // The remote approval marker survives removal of local provider data. It is
  // tied to immutable approved content, never a browser's disposable UUID.
  const intentHash = createHash("sha256")
    .update(
      JSON.stringify([
        content.title,
        content.startAt,
        content.endAt,
        content.timezone,
      ]),
    )
    .digest("hex");
  try {
    return verifyCreatedEvent(
      await runtime.google.request(userId, eventUrl),
      intent,
      userId,
      intentHash,
    );
  } catch (error) {
    if (!(error instanceof ApiFailure && error.code === "NOT_FOUND"))
      throw error;
  }
  try {
    const event = await runtime.google.request(userId, collectionUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: intent.google_event_id,
        summary: content.title,
        start: { dateTime: content.startAt, timeZone: content.timezone },
        end: { dateTime: content.endAt, timeZone: content.timezone },
        extendedProperties: {
          private: {
            actionInboxTaskId: intent.task_id,
            actionInboxUserId: userId,
            actionInboxIntentHash: intentHash,
          },
        },
      }),
    });
    return verifyCreatedEvent(event, intent, userId, intentHash);
  } catch (error) {
    // A lost response or a competing insertion is not evidence that Google did
    // not create the event. The persisted deterministic ID is the authority.
    try {
      return verifyCreatedEvent(
        await runtime.google.request(userId, eventUrl),
        intent,
        userId,
        intentHash,
      );
    } catch (reconciliationError) {
      if (
        reconciliationError instanceof ApiFailure &&
        reconciliationError.code === "CONFLICT"
      )
        throw reconciliationError;
      throw error;
    }
  }
}
