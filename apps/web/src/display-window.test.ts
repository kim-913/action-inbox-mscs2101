import { afterEach, describe, expect, it, vi } from "vitest";
import { displayIntervals, windowQuery, withinWindow } from "./display-window";

afterEach(() => vi.unstubAllEnvs());

describe("local-calendar display intervals", () => {
  it("includes today once and uses opposite natural source directions", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    const { recent, upcoming } = displayIntervals(7, new Date(2026, 9, 8, 12));
    expect(recent.startDate).toBe("2026-10-02");
    expect(recent.endDate).toBe("2026-10-09");
    expect(upcoming.startDate).toBe("2026-10-08");
    expect(upcoming.endDate).toBe("2026-10-15");
    expect(withinWindow(upcoming.startAt, upcoming)).toBe(true);
    expect(withinWindow(upcoming.endAt, upcoming)).toBe(false);
    expect(withinWindow(null, upcoming)).toBe(false);
    expect(withinWindow("2026-10-08", upcoming, true)).toBe(true);
    expect(withinWindow("2026-10-15", upcoming, true)).toBe(false);
    expect(
      Object.fromEntries(new URLSearchParams(windowQuery(upcoming))),
    ).toEqual(upcoming);
  });

  it.each([
    [2026, 2, 8, 23],
    [2026, 10, 1, 25],
  ])(
    "keeps midnight boundaries on a DST transition day",
    (year, month, day, hours) => {
      vi.stubEnv("TZ", "America/Los_Angeles");
      const ranges = displayIntervals(1, new Date(year, month, day, 12));
      expect(ranges.recent).toEqual(ranges.upcoming);
      expect(
        (Date.parse(ranges.upcoming.endAt) -
          Date.parse(ranges.upcoming.startAt)) /
          3_600_000,
      ).toBe(hours);
    },
  );

  it("crosses leap days and years without turning date-only values into instants", () => {
    vi.stubEnv("TZ", "Pacific/Auckland");
    const leap = displayIntervals(2, new Date(2028, 1, 28, 12));
    expect(leap.upcoming.endDate).toBe("2028-03-01");
    expect(withinWindow("2028-02-29", leap.upcoming, true)).toBe(true);
    const year = displayIntervals(365, new Date(2026, 11, 31, 12));
    expect(year.upcoming.endDate).toBe("2027-12-31");
    expect(year.recent.startDate).toBe("2026-01-01");
  });
});
