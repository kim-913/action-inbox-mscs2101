import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "./index.js";

describe("healthResponseSchema", () => {
  it("accepts a valid API health response", () => {
    const response = {
      status: "ok",
      service: "action-inbox-api",
      timestamp: "2026-10-08T12:00:00.000Z",
      version: "0.1.0",
    };

    expect(healthResponseSchema.parse(response)).toEqual(response);
  });

  it.each([
    { field: "status", value: "degraded" },
    { field: "service", value: "another-service" },
    { field: "timestamp", value: "today" },
    { field: "version", value: "" },
  ])("rejects an invalid $field", ({ field, value }) => {
    const response = {
      status: "ok",
      service: "action-inbox-api",
      timestamp: "2026-10-08T12:00:00.000Z",
      version: "0.1.0",
      [field]: value,
    };

    expect(() => healthResponseSchema.parse(response)).toThrow();
  });
});
