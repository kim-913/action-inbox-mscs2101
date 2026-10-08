import { createHash } from "node:crypto";
import type {
  CalendarEvent,
  CanvasItem,
  DisplayRangeQuery,
} from "@action-inbox/contracts";

// Pagination can change its page size, but never its owner or selection predicates.
export function filterKey(
  userId: string,
  query: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        userId,
        Object.entries(query)
          .filter(([key]) => key !== "cursor" && key !== "limit")
          .sort(([left], [right]) => left.localeCompare(right)),
      ]),
    )
    .digest("hex");
}

export function canvasInRange(
  item: CanvasItem,
  range: DisplayRangeQuery,
): boolean {
  if (!range.startAt) return true;
  const start = item.start;
  if (!start) return false;
  const lower =
    start.kind === "date" ? range.startDate! : Date.parse(range.startAt);
  const upper =
    start.kind === "date" ? range.endDate! : Date.parse(range.endAt!);
  const value = start.kind === "date" ? start.value : Date.parse(start.value);
  if (item.kind === "Assignment" || !item.end || item.end.kind !== start.kind) {
    return value >= lower && value < upper;
  }
  const end =
    item.end.kind === "date" ? item.end.value : Date.parse(item.end.value);
  // A zero-duration source event is a point, not an interval ending at its start.
  return end > value
    ? value < upper && end > lower
    : value >= lower && value < upper;
}

export function calendarInRange(
  item: CalendarEvent,
  range: DisplayRangeQuery,
): boolean {
  if (!range.startAt) return true;
  if (item.allDay)
    return item.start < range.endDate! && item.end > range.startDate!;
  return (
    Date.parse(item.start) < Date.parse(range.endAt!) &&
    Date.parse(item.end) > Date.parse(range.startAt)
  );
}
