import { describe, expect, it } from "vitest";
import { displayDate, isoDate, localDateValue } from "./ui";

describe("browser-local date handling", () => {
  it("preserves an explicitly empty deadline", () => {
    expect(isoDate("")).toBeNull();
    expect(localDateValue(null)).toBe("");
    expect(displayDate(null)).toBe("Not set");
  });
  it("does not crash or render Invalid Date for malformed provider data", () => {
    expect(localDateValue("not-a-date")).toBe("");
    expect(displayDate("not-a-date")).toBe("Invalid date — refresh this item.");
  });
  it.each([
    "not-a-date",
    "2026-02-30T12:00",
    "2026-13-01T12:00",
    "2026-10-07T25:00",
  ])("rejects invalid local input %s before serialization", (value) => {
    expect(() => isoDate(value)).toThrow("valid");
  });
  it("round-trips local form input without inventing a timezone offset", () => {
    const value = "2026-10-07T12:30";
    expect(localDateValue(isoDate(value))).toBe(value);
  });
});
