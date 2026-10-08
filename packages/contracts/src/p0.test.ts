import { describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  calendarEventCreateRequestSchema,
  evidenceSchema,
  taskCreateRequestSchema,
  taskEditRequestSchema,
} from "./p0.js";

const requestId = "b0a09c3f-fc61-4c43-babd-b18875213ff4";
describe("P0 request boundaries", () => {
  it("rejects client-supplied ownership and trims manual task titles", () => {
    const task = { requestId, title: "  Submit registration  ", dueAt: null };
    expect(taskCreateRequestSchema.parse(task).title).toBe(
      "Submit registration",
    );
    expect(
      taskCreateRequestSchema.safeParse({ ...task, userId: requestId }).success,
    ).toBe(false);
  });
  it("requires an actual optimistic-concurrency edit", () => {
    expect(taskEditRequestSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(
      taskEditRequestSchema.safeParse({ version: 0, status: "Completed" })
        .success,
    ).toBe(true);
    expect(
      taskEditRequestSchema.safeParse({ version: -1, title: "Task" }).success,
    ).toBe(false);
  });
  it("rejects inverted calendar ranges and evidence offsets", () => {
    expect(
      calendarEventCreateRequestSchema.safeParse({
        requestId,
        title: "Review",
        startAt: "2026-10-08T12:00:00Z",
        endAt: "2026-10-08T11:00:00Z",
        timezone: "UTC",
      }).success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({ quote: "Submit", start: 8, end: 2 }).success,
    ).toBe(false);
  });
  it("does not permit provider payloads in the public error contract", () => {
    expect(
      apiErrorSchema.safeParse({
        code: "GOOGLE_UNAVAILABLE",
        message: "Try again.",
        requestId,
        providerResponse: "private",
      }).success,
    ).toBe(false);
  });
});
