import { describe, expect, it } from "vitest";
import {
  canvasItemsQuerySchema,
  displayPreferencesSchema,
  inboxQuerySchema,
  tasksQuerySchema,
  upcomingCalendarQuerySchema,
} from "./index.js";

const range = {
  startAt: "2026-10-31T00:00:00-04:00",
  endAt: "2026-11-02T00:00:00-05:00",
  startDate: "2026-10-31",
  endDate: "2026-11-02",
};
describe("shared display window boundaries", () => {
  it("accepts only an integer preference from 1 through 365", () => {
    for (const windowDays of [1, 7, 30, 365]) {
      expect(displayPreferencesSchema.parse({ windowDays })).toEqual({
        windowDays,
      });
    }
    for (const windowDays of [0, -1, 366, 1.5, "7", null]) {
      expect(displayPreferencesSchema.safeParse({ windowDays }).success).toBe(
        false,
      );
    }
    expect(displayPreferencesSchema.safeParse({}).success).toBe(false);
    expect(
      displayPreferencesSchema.safeParse({ windowDays: 7, userId: "someone" })
        .success,
    ).toBe(false);
  });

  it.each([
    inboxQuerySchema,
    tasksQuerySchema,
    canvasItemsQuerySchema,
    upcomingCalendarQuerySchema,
  ])(
    "requires complete ordered native-date and offset-instant bounds without assuming fixed-length days",
    (schema) => {
      expect(schema.safeParse({}).success).toBe(true);
      expect(schema.safeParse(range).success).toBe(true);
      for (const key of Object.keys(range)) {
        const partial: Partial<typeof range> = { ...range };
        delete partial[key as keyof typeof partial];
        expect(schema.safeParse(partial).success).toBe(false);
      }
      for (const invalid of [
        { endAt: range.startAt },
        { endAt: "2026-10-30T00:00:00Z" },
        { endDate: range.startDate },
        { endDate: "2026-10-30" },
        { startDate: "2026-02-30" },
        { startAt: "2026-10-31T00:00:00" },
      ]) {
        expect(schema.safeParse({ ...range, ...invalid }).success).toBe(false);
      }
    },
  );

  it("keeps source and undated selection explicit", () => {
    expect(
      tasksQuerySchema.parse({ source: "gmail", includeUndated: "true" }),
    ).toMatchObject({ source: "gmail", includeUndated: "true" });
    expect(tasksQuerySchema.parse({}).includeUndated).toBe("false");
    expect(tasksQuerySchema.safeParse({ source: "canvas" }).success).toBe(
      false,
    );
    expect(tasksQuerySchema.safeParse({ includeUndated: true }).success).toBe(
      false,
    );
    expect(inboxQuerySchema.parse({}).dateField).toBe("received");
    expect(
      inboxQuerySchema.parse({
        dateField: "suggestionDue",
        reviewState: "Proposed",
        ...range,
      }),
    ).toMatchObject({ dateField: "suggestionDue" });
  });
});
