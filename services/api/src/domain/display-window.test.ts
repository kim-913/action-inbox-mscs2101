import { describe, expect, it } from "vitest";
import type { CalendarEvent, CanvasItem } from "@action-inbox/contracts";
import { calendarInRange, canvasInRange } from "./display-window.js";

const range = {
  startAt: "2026-10-31T00:00:00-04:00",
  endAt: "2026-11-02T00:00:00-05:00",
  startDate: "2026-10-31",
  endDate: "2026-11-02",
};
const event: CalendarEvent = {
  id: "event",
  title: "Event",
  start: "2026-10-30",
  end: "2026-11-01",
  allDay: true,
  htmlLink: null,
};
const assignment: CanvasItem = {
  id: "assignment",
  title: "Assignment",
  kind: "Assignment",
  description: "",
  start: { kind: "date", value: "2026-10-31", timeZone: null },
  end: null,
  sourceUrl: null,
  cancelled: false,
};

describe("source-native display intervals", () => {
  it("uses date labels for all-day intervals without converting to UTC", () => {
    expect(calendarInRange(event, range)).toBe(true);
    expect(calendarInRange({ ...event, end: range.startDate }, range)).toBe(
      false,
    );
    expect(
      calendarInRange(
        { ...event, start: range.endDate, end: "2026-11-03" },
        range,
      ),
    ).toBe(false);
    expect(
      calendarInRange(
        { ...event, start: range.startDate, end: range.endDate },
        range,
      ),
    ).toBe(true);
    const east = {
      ...range,
      startAt: "2026-10-31T00:00:00+14:00",
      endAt: "2026-11-02T00:00:00+14:00",
    };
    expect(calendarInRange(event, east)).toBe(true);
    expect(canvasInRange(assignment, east)).toBe(true);
    expect(
      canvasInRange(
        {
          ...assignment,
          start: { kind: "date", value: range.endDate, timeZone: null },
        },
        east,
      ),
    ).toBe(false);
  });

  it("compares timed overlap by instants through a 49-hour DST window", () => {
    const timed = {
      ...event,
      allDay: false,
      start: "2026-10-31T03:00:00Z",
      end: "2026-10-31T05:00:00Z",
    };
    expect(calendarInRange(timed, range)).toBe(true);
    expect(
      calendarInRange({ ...timed, end: "2026-10-31T04:00:00Z" }, range),
    ).toBe(false);
    expect(
      calendarInRange(
        {
          ...timed,
          start: "2026-11-02T05:00:00Z",
          end: "2026-11-02T06:00:00Z",
        },
        range,
      ),
    ).toBe(false);
    expect(
      canvasInRange(
        {
          ...assignment,
          start: {
            kind: "instant",
            value: "2026-11-02T04:30:00Z",
            timeZone: "UTC",
          },
        },
        range,
      ),
    ).toBe(true);
    expect(
      canvasInRange(
        {
          ...assignment,
          start: {
            kind: "instant",
            value: "2026-11-02T05:00:00Z",
            timeZone: "UTC",
          },
        },
        range,
      ),
    ).toBe(false);
  });

  it("does not infer an assignment deadline from event end or place missing dates inside a range", () => {
    const extended = {
      ...assignment,
      start: { kind: "date" as const, value: "2026-10-30", timeZone: null },
      end: { kind: "date" as const, value: "2026-11-01", timeZone: null },
    };
    expect(canvasInRange(extended, range)).toBe(false);
    expect(canvasInRange({ ...extended, kind: "Event" }, range)).toBe(true);
    expect(canvasInRange({ ...assignment, start: null }, range)).toBe(false);
    expect(canvasInRange({ ...assignment, start: null }, {})).toBe(true);
  });
});
