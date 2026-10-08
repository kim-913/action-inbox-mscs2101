import { afterEach, describe, expect, it } from "vitest";
import { healthResponseSchema } from "@action-inbox/contracts";
import { buildApp } from "./app.js";

const applications: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});
function application() {
  const app = buildApp();
  applications.push(app);
  return app;
}

describe("API liveness", () => {
  it("returns exactly the shared contract without listening or provider configuration", async () => {
    const before = Date.now();
    const response = await application().inject({
      method: "GET",
      url: "/v1/health",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    const body: unknown = response.json();
    const health = healthResponseSchema.parse(body);
    expect(body).toEqual(health);
    expect(Object.keys(health).sort()).toEqual([
      "service",
      "status",
      "timestamp",
      "version",
    ]);
    expect(Date.parse(health.timestamp)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(health.timestamp)).toBeLessThanOrEqual(Date.now());
    expect(health.version).toBe("0.1.0");
  });

  it("does not echo untrusted request IDs or URLs in errors", async () => {
    const response = await application().inject({
      method: "GET",
      url: "/unknown?code=private-code",
      headers: {
        "x-request-id": "private-request-id",
        authorization: "Bearer private-token",
      },
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("private-");
    expect(response.json()).toMatchObject({
      code: "NOT_FOUND",
      message: "This resource does not exist.",
    });
  });

  it("does not accept a write as a health request", async () => {
    const response = await application().inject({
      method: "POST",
      url: "/v1/health",
    });
    expect(response.statusCode).toBe(404);
  });

  it("does not expose internal exception messages", async () => {
    const app = application();
    app.get("/failure", () => {
      throw new Error("private-provider-token");
    });
    const response = await app.inject("/failure");
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("private-provider-token");
    expect(response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("allows credentials only for the configured web origin", async () => {
    const app = application();
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/v1/health",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "GET",
      },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:5173",
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    const denied = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: { origin: "https://untrusted.example" },
    });
    expect(denied.headers["access-control-allow-origin"]).not.toBe(
      "https://untrusted.example",
    );
    expect(denied.headers["access-control-allow-origin"]).not.toBe("*");
  });
});
