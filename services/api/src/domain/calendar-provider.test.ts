import { describe, expect, it } from "vitest";
import { ApiFailure } from "../runtime.js";
import {
  deterministicEventId,
  parseUpcoming,
  safeGoogleFailure,
  validTimezone,
} from "./calendar-provider.js";

describe("Calendar provider boundary", () => {
  it("uses a stable Google-compatible ID scoped to the user and task", () => {
    const id = deterministicEventId("user-a", "task-a");
    expect(id).toMatch(/^[0-9a-v]{64}$/);
    expect(deterministicEventId("user-a", "task-a")).toBe(id);
    expect(deterministicEventId("user-b", "task-a")).not.toBe(id);
    expect(deterministicEventId("user-a", "task-b")).not.toBe(id);
  });

  it("preserves all-day exclusive dates and offset-bearing instants without server-local conversion", () => {
    expect(
      parseUpcoming({
        items: [
          {
            id: "day",
            summary: "Day",
            start: { date: "2026-12-05" },
            end: { date: "2026-12-06" },
          },
          {
            id: "timed",
            start: {
              dateTime: "2026-11-01T01:30:00-04:00",
              timeZone: "America/New_York",
            },
            end: {
              dateTime: "2026-11-01T01:30:00-05:00",
              timeZone: "America/New_York",
            },
          },
          { id: "cancelled", status: "cancelled" },
        ],
      }),
    ).toEqual([
      {
        id: "day",
        title: "Day",
        start: "2026-12-05",
        end: "2026-12-06",
        allDay: true,
        htmlLink: null,
      },
      {
        id: "timed",
        title: "",
        start: "2026-11-01T01:30:00-04:00",
        end: "2026-11-01T01:30:00-05:00",
        allDay: false,
        htmlLink: null,
      },
    ]);
  });

  it("rejects a provider response above the bounded 100-event snapshot", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      id: `event-${index}`,
      start: { date: "2026-12-05" },
      end: { date: "2026-12-06" },
    }));
    expect(parseUpcoming({ items })).toHaveLength(100);
    expect(() =>
      parseUpcoming({ items: [...items, { ...items[0], id: "overflow" }] }),
    ).toThrow(ApiFailure);
  });

  it.each([
    {
      items: [
        {
          id: "private",
          start: { date: "2026-12-05" },
          end: { dateTime: "2026-12-06T00:00:00Z" },
        },
      ],
    },
    {
      items: [
        {
          id: "private",
          start: { dateTime: "2026-12-05T10:00:00" },
          end: { dateTime: "2026-12-05T11:00:00" },
        },
      ],
    },
    {
      items: [
        {
          id: "private",
          start: { date: "2026-12-05" },
          end: { date: "2026-12-04" },
        },
      ],
    },
    {
      items: [
        {
          id: "private",
          start: { date: "2026-12-05" },
          end: { date: "2026-12-06" },
          htmlLink: "javascript:private",
        },
      ],
    },
  ])(
    "rejects malformed provider events instead of silently losing cached data",
    (input) => {
      expect(() => parseUpcoming(input)).toThrow(ApiFailure);
      expect(() => parseUpcoming(input)).toThrow(
        "Google Calendar is unavailable.",
      );
    },
  );

  it("does not reflect upstream exception messages in safe errors", () => {
    const failure = safeGoogleFailure(
      new ApiFailure(502, "GOOGLE_UNAVAILABLE", "private provider body"),
    );
    expect(failure.code).toBe("GOOGLE_UNAVAILABLE");
    expect(failure.message).not.toContain("private");
    expect(
      safeGoogleFailure(new ApiFailure(429, "RATE_LIMITED", "private")).status,
    ).toBe(429);
    expect(
      safeGoogleFailure(new ApiFailure(504, "GOOGLE_UNAVAILABLE", "private"))
        .status,
    ).toBe(504);
    expect(
      safeGoogleFailure(
        new ApiFailure(401, "GOOGLE_RECONNECT_REQUIRED", "private"),
      ).status,
    ).toBe(401);
    expect(validTimezone("America/New_York")).toBe(true);
    expect(validTimezone("UTC")).toBe(true);
    expect(validTimezone("Not/AZone")).toBe(false);
  });
});
