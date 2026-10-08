import type {
  CalendarEvent,
  EmailSummary,
  Suggestion,
  Task,
} from "@action-inbox/contracts";

export type PlannerItem =
  | {
      kind: "task";
      key: string;
      title: string;
      task: Task;
      source: EmailSummary | undefined;
      linkedEvent: CalendarEvent | undefined;
    }
  | {
      kind: "suggestion";
      key: string;
      title: string;
      suggestion: Suggestion;
      source: EmailSummary;
    }
  | { kind: "event"; key: string; title: string; event: CalendarEvent };
export type PlannerDate = {
  at: string;
  allDay: boolean;
  meaning: "Task deadline" | "Unconfirmed date" | "Calendar time";
};

export function plannerItems(
  emails: EmailSummary[],
  tasks: Task[],
  events: CalendarEvent[],
): PlannerItem[] {
  const sources = new Map(emails.map((email) => [email.id, email]));
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const linkedEventIds = new Set<string>();
  const representedSuggestions = new Set(
    tasks.map((task) => task.sourceSuggestionId).filter((id) => id !== null),
  );
  const result: PlannerItem[] = [];
  for (const task of tasks) {
    // A completed task does not hide a real upcoming Calendar event.
    if (task.status === "Completed") continue;
    const eventId = task.calendarLink?.googleEventId;
    const linkedEvent = eventId ? eventsById.get(eventId) : undefined;
    if (linkedEvent) linkedEventIds.add(linkedEvent.id);
    result.push({
      kind: "task",
      key: `task:${task.id}`,
      title: task.title,
      task,
      source: task.sourceEmailId ? sources.get(task.sourceEmailId) : undefined,
      linkedEvent,
    });
  }
  for (const source of emails) {
    for (const suggestion of source.suggestions) {
      if (
        suggestion.reviewState === "Proposed" &&
        !representedSuggestions.has(suggestion.id)
      )
        result.push({
          kind: "suggestion",
          key: `suggestion:${suggestion.id}`,
          title: suggestion.title,
          suggestion,
          source,
        });
    }
  }
  for (const event of eventsById.values()) {
    if (!linkedEventIds.has(event.id))
      result.push({
        kind: "event",
        key: `event:${event.id}`,
        title: event.title || "Untitled event",
        event,
      });
  }
  return result;
}

export function plannerDates(item: PlannerItem): PlannerDate[] {
  if (item.kind === "event")
    return [
      {
        at: item.event.start,
        allDay: item.event.allDay,
        meaning: "Calendar time",
      },
    ];
  if (item.kind === "suggestion")
    return item.suggestion.dueAt
      ? [
          {
            at: item.suggestion.dueAt,
            allDay: false,
            meaning: "Unconfirmed date",
          },
        ]
      : [];
  const dates: PlannerDate[] = item.task.dueAt
    ? [{ at: item.task.dueAt, allDay: false, meaning: "Task deadline" }]
    : [];
  if (item.linkedEvent)
    dates.push({
      at: item.linkedEvent.start,
      allDay: item.linkedEvent.allDay,
      meaning: "Calendar time",
    });
  return dates;
}

export function plannerDay(value: string, allDay = false): string | null {
  if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Presentation ordering only: a date-only event occupies its local calendar day,
// not UTC midnight, and this key never becomes a persisted deadline.
export function plannerSortTime(date: PlannerDate): number {
  if (date.allDay && /^\d{4}-\d{2}-\d{2}$/.test(date.at)) {
    if (!plannerDay(date.at, true)) return Number.POSITIVE_INFINITY;
    return new Date(`${date.at}T00:00:00`).getTime();
  }
  const timestamp = Date.parse(date.at);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

export function needsDate(item: PlannerItem): boolean {
  if (item.kind === "event") return false;
  return !(item.kind === "task" ? item.task.dueAt : item.suggestion.dueAt);
}
