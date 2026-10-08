import { describe, expect, it, vi } from "vitest";
import type {
  CalendarEvent,
  EmailSummary,
  Suggestion,
  Task,
} from "@action-inbox/contracts";
import {
  needsDate,
  plannerDates,
  plannerDay,
  plannerItems,
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
});
