import { describe, expect, it, vi } from "vitest";
import type {
  CalendarEvent,
  CanvasItem,
  EmailSummary,
  Suggestion,
  Task,
} from "@action-inbox/contracts";
import {
  needsDate,
  plannerDates,
  plannerDay,
  plannerItems,
  plannerOccursOnDay,
  plannerSortTime,
} from "./planner-model";
import { dueUrgency, taskUrgency } from "./urgency";

const id = "10000000-0000-4000-8000-000000000001";
const at = "2026-10-07T12:00:00Z";
const suggestion: Suggestion = {
  id,
  emailId: id,
  category: "Action Required",
  title: "Fixture review action",
  dueAt: null,
  deadlineCertainty: "None",
  confidence: 0.99,
  evidence: { quote: "Review", start: 0, end: 6 },
  deadlineEvidence: null,
  needsReview: true,
  reviewReason: null,
  reviewState: "Proposed",
  version: 0,
  createdAt: at,
};
const email: EmailSummary = {
  id,
  gmailMessageId: "fixture",
  sender: "fixture@example.test",
  subject: "Fixture source",
  receivedAt: at,
  category: "Action Required",
  extractionStatus: "Succeeded",
  extractionError: null,
  suggestions: [suggestion],
};
const task: Task = {
  id,
  title: "Fixture approved task",
  dueAt: at,
  status: "Pending",
  sourceSuggestionId: id,
  sourceEmailId: id,
  approvedAt: at,
  completedAt: null,
  version: 0,
  reminders: [],
  calendarLink: null,
  createdAt: at,
};
const event: CalendarEvent = {
  id: "google-fixture-event",
  title: "Fixture event",
  start: "2026-10-09T14:00:00Z",
  end: "2026-10-09T15:00:00Z",
  allDay: false,
  htmlLink: null,
};

describe("transparent task urgency", () => {
  const now = new Date(2026, 9, 7, 12, 0);
  it("uses actual local timestamps for overdue, today and the next seven calendar days", () => {
    expect(
      dueUrgency(new Date(now.getTime() - 1).toISOString(), now).label,
    ).toBe("Overdue");
    expect(
      dueUrgency(new Date(2026, 9, 7, 23, 59).toISOString(), now).label,
    ).toBe("Today");
    expect(
      dueUrgency(new Date(2026, 9, 14, 23, 59).toISOString(), now).label,
    ).toBe("Next 7 days");
    expect(
      dueUrgency(new Date(2026, 9, 15, 0, 0).toISOString(), now).label,
    ).toBe("Later");
    expect(dueUrgency(null, now).label).toBe("No date");
    expect(
      taskUrgency(
        { ...task, dueAt: "2000-01-01T00:00:00Z", status: "Completed" },
        now,
      ).label,
    ).toBe("Completed");
  });
});

describe("connected planner semantics", () => {
  it("shows native and timed events on each overlapping day, excluding the end", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    try {
      const [native] = plannerItems(
        [],
        [],
        [{ ...event, allDay: true, start: "2026-10-06", end: "2026-10-10" }],
      );
      expect(plannerOccursOnDay(native!, "2026-10-08")).toBe(true);
      expect(plannerOccursOnDay(native!, "2026-10-10")).toBe(false);
      const timedEvent = {
        ...event,
        start: "2026-03-07T23:00:00-08:00",
        end: "2026-03-09T00:00:00-07:00",
      };
      const [timed] = plannerItems([], [], [timedEvent]);
      expect(plannerOccursOnDay(timed!, "2026-03-08")).toBe(true);
      expect(plannerOccursOnDay(timed!, "2026-03-09")).toBe(false);
      const [linked] = plannerItems(
        [],
        [
          {
            ...task,
            calendarLink: {
              status: "Created",
              googleEventId: event.id,
              htmlLink: null,
              error: null,
            },
          },
        ],
        [timedEvent],
      );
      expect(plannerOccursOnDay(linked!, "2026-03-08")).toBe(true);
      const canvas: CanvasItem = {
        id,
        kind: "Event",
        title: "Ongoing Canvas event",
        description: "",
        sourceUrl: null,
        start: { kind: "date", value: "2026-10-06", timeZone: null },
        end: { kind: "date", value: "2026-10-10", timeZone: null },
        cancelled: false,
      };
      const [canvasItem] = plannerItems([], [], [], [canvas]);
      expect(plannerOccursOnDay(canvasItem!, "2026-10-08")).toBe(true);
      expect(plannerOccursOnDay(canvasItem!, "2026-10-10")).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("never turns email received time or model confidence into a due date", () => {
    const [item] = plannerItems([email], [], []);
    expect(item?.kind).toBe("suggestion");
    expect(plannerDates(item!)).toEqual([]);
    expect(needsDate(item!)).toBe(true);
  });

  it("keeps suggested dates unconfirmed and distinct from approved deadlines", () => {
    const [item] = plannerItems(
      [
        {
          ...email,
          suggestions: [
            { ...suggestion, dueAt: at, deadlineCertainty: "Explicit" },
          ],
        },
      ],
      [],
      [],
    );
    expect(plannerDates(item!)).toEqual([
      { at, allDay: false, meaning: "Unconfirmed date" },
    ]);
    expect(plannerItems([email], [task], []).map((item) => item.kind)).toEqual([
      "task",
    ]);
  });

  it("combines a linked external event once while preserving its actual time and the different task deadline", () => {
    const linked = {
      ...task,
      calendarLink: {
        status: "Created" as const,
        googleEventId: event.id,
        htmlLink: null,
        error: null,
      },
    };
    const items = plannerItems([], [linked], [event, event]);
    expect(items).toHaveLength(1);
    expect(plannerDates(items[0]!)).toEqual([
      { at, allDay: false, meaning: "Task deadline" },
      { at: event.start, allDay: false, meaning: "Calendar time" },
    ]);
    expect(
      needsDate({
        ...items[0]!,
        kind: "task",
        key: "undated",
        title: linked.title,
        task: { ...linked, dueAt: null },
        source: undefined,
        linkedEvent: event,
      }),
    ).toBe(true);
  });

  it("excludes completed tasks without hiding their real upcoming external event", () => {
    const completed = {
      ...task,
      status: "Completed" as const,
      calendarLink: {
        status: "Created" as const,
        googleEventId: event.id,
        htmlLink: null,
        error: null,
      },
    };
    expect(
      plannerItems([], [completed], [event]).map((item) => item.kind),
    ).toEqual(["event"]);
  });

  it("uses persisted task provenance even when its source email is not loaded", () => {
    const manual = {
      ...task,
      id: "manual-task",
      sourceEmailId: null,
      sourceSuggestionId: null,
    };
    expect(
      plannerItems([], [task, manual], [], [], "gmail").map((item) => item.key),
    ).toEqual([`task:${task.id}`]);
    expect(
      plannerItems([], [task, manual], [], [], "manual").map(
        (item) => item.key,
      ),
    ).toEqual(["task:manual-task"]);
    expect(plannerItems([], [task], [], [], "gmail")[0]).toMatchObject({
      kind: "task",
      source: undefined,
      task: { sourceEmailId: id },
    });
  });

  it("keeps linked events visible as standalone Google Calendar source items", () => {
    const linked = {
      ...task,
      calendarLink: {
        status: "Created" as const,
        googleEventId: event.id,
        htmlLink: null,
        error: null,
      },
    };
    expect(plannerItems([email], [linked], [event], [], "calendar")).toEqual([
      { kind: "event", key: `event:${event.id}`, title: event.title, event },
    ]);
    expect(plannerItems([email], [linked], [event], [], "gmail")).toMatchObject(
      [{ kind: "task", linkedEvent: undefined }],
    );
    expect(plannerItems([email], [linked], [event], [], "manual")).toEqual([]);
  });

  it("does not count an undated task as dated because it has a linked event", () => {
    const undated = {
      ...task,
      dueAt: null,
      calendarLink: {
        status: "Created" as const,
        googleEventId: event.id,
        htmlLink: null,
        error: null,
      },
    };
    const items = plannerItems([], [undated], [event]);
    expect(items.map((item) => item.kind)).toEqual(["task", "event"]);
    expect(plannerDates(items[0]!)).toEqual([]);
    expect(items.filter(needsDate)).toHaveLength(1);
  });

  it("preserves date-only all-day events and uses browser-local days for timestamps", () => {
    expect(plannerDay("2026-10-07", true)).toBe("2026-10-07");
    expect(plannerDay(new Date(2026, 9, 7, 23, 59).toISOString())).toBe(
      "2026-10-07",
    );
    expect(plannerDay("not-a-date")).toBeNull();
  });

  it("orders an October 8 local evening before an October 9 all-day event", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    try {
      const timed = {
        at: "2026-10-09T00:00:00Z",
        allDay: false,
        meaning: "Calendar time" as const,
      };
      const allDay = {
        at: "2026-10-09",
        allDay: true,
        meaning: "Calendar time" as const,
      };
      expect(plannerDay(timed.at)).toBe("2026-10-08");
      expect(plannerSortTime(allDay) - plannerSortTime(timed)).toBe(
        7 * 60 * 60 * 1000,
      );
      expect(
        [allDay, timed].sort((a, b) => plannerSortTime(a) - plannerSortTime(b)),
      ).toEqual([timed, allDay]);
      expect(plannerDay(allDay.at, true)).toBe("2026-10-09");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps native Canvas due dates distinct from event times and excludes cancellation without guessing completion", () => {
    const assignment: CanvasItem = {
      id: "canvas-assignment-1",
      kind: "Assignment",
      title: "Assignment [COURSE]",
      description: "Native source",
      sourceUrl: null,
      start: { value: "2026-10-09", kind: "date", timeZone: null },
      end: null,
      cancelled: false,
    };
    const canvasEvent: CanvasItem = {
      ...assignment,
      id: "canvas-event-1",
      kind: "Event",
      title: "Class meeting",
      start: {
        value: "2026-10-10T10:00:00Z",
        kind: "instant",
        timeZone: "UTC",
      },
    };
    const cancelled = { ...assignment, id: "cancelled", cancelled: true };
    const items = plannerItems(
      [],
      [],
      [],
      [assignment, canvasEvent, cancelled],
    );
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.kind === "canvas")).toBe(true);
    expect(plannerDates(items[0]!)).toEqual([
      { at: "2026-10-09", allDay: true, meaning: "Canvas due date" },
    ]);
    expect(plannerDates(items[1]!)).toEqual([
      {
        at: "2026-10-10T10:00:00Z",
        allDay: false,
        meaning: "Canvas event time",
      },
    ]);
  });

  it("replaces a changed Canvas date under the stable source id without creating a task or duplicate item", () => {
    const original: CanvasItem = {
      id: "canvas-stable",
      kind: "Assignment",
      title: "Source title",
      description: "",
      sourceUrl: null,
      start: { value: "2026-10-09", kind: "date", timeZone: null },
      end: null,
      cancelled: false,
    };
    const changed: CanvasItem = {
      ...original,
      start: { value: "2026-10-12", kind: "date", timeZone: null },
    };
    const items = plannerItems([], [], [], [original, changed]);
    expect(items).toHaveLength(1);
    expect(items[0]?.key).toBe("canvas:canvas-stable");
    expect(plannerDates(items[0]!)[0]?.at).toBe("2026-10-12");
    const missing = plannerItems(
      [],
      [],
      [],
      [{ ...original, start: null }],
    )[0]!;
    expect(needsDate(missing)).toBe(true);
    expect(plannerDates(missing)).toEqual([]);
  });
});
