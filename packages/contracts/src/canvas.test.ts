import { describe, expect, it } from "vitest";
import {
  canvasConnectRequestSchema,
  canvasConnectionSchema,
  canvasDateSchema,
  canvasItemsQuerySchema,
} from "./canvas.js";

describe("Canvas calendar subscription wire boundaries", () => {
  it("accepts only the submitted credential, never caller-selected ownership", () => {
    const request = {
      feedUrl:
        "https://sofia.instructure.com/feeds/calendars/user_synthetic.ics",
    };
    expect(canvasConnectRequestSchema.safeParse(request).success).toBe(true);
    expect(
      canvasConnectRequestSchema.safeParse({
        ...request,
        userId: "someone-else",
      }).success,
    ).toBe(false);
    expect(
      canvasConnectRequestSchema.safeParse({ feedUrl: "x".repeat(2049) })
        .success,
    ).toBe(false);
  });
  it("keeps date-only values distinct from exact instants", () => {
    expect(
      canvasDateSchema.parse({
        value: "2026-10-09",
        kind: "date",
        timeZone: null,
      }).value,
    ).toBe("2026-10-09");
    expect(
      canvasDateSchema.safeParse({
        value: "2026-10-09",
        kind: "instant",
        timeZone: null,
      }).success,
    ).toBe(false);
    expect(
      canvasDateSchema.safeParse({
        value: "2026-10-09T09:00:00",
        kind: "instant",
        timeZone: null,
      }).success,
    ).toBe(false);
    expect(
      canvasDateSchema.safeParse({
        value: "2026-02-30",
        kind: "date",
        timeZone: null,
      }).success,
    ).toBe(false);
  });
  it("never admits credential fields into public connection state", () => {
    const state = {
      connected: true,
      host: "sofia.instructure.com",
      status: "Ready",
      itemCount: 2,
      lastSuccessfulFetchAt: "2026-10-08T00:00:00Z",
      error: null,
      refreshPolicy: "Manual",
      coverage: "Returned calendar feed only",
    };
    expect(canvasConnectionSchema.safeParse(state).success).toBe(true);
    expect(
      canvasConnectionSchema.safeParse({ ...state, feedUrl: "private" })
        .success,
    ).toBe(false);
    expect(
      canvasConnectionSchema.safeParse({
        ...state,
        encryptedFeedUrl: "private",
      }).success,
    ).toBe(false);
    expect(canvasItemsQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
  });
});
