import { describe, expect, it, vi } from "vitest";
import {
  apiRoutes,
  googleStartResponseSchema,
  successResponseSchema,
} from "@action-inbox/contracts";
import {
  ApiClient,
  authorizationRedirect,
  callbackOutcome,
  safeExternalLink,
} from "./client";

const session = {
  authenticated: false,
  user: null,
  csrfToken: "c".repeat(32),
  expiresAt: "2026-10-08T00:00:00Z",
  googleConnected: false,
};
describe("browser API transport", () => {
  it("binds the native fetch receiver to the browser global", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(function (
      this: unknown,
    ) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json(session));
    });
    try {
      const api = new ApiClient("http://localhost:3000");
      await expect(api.session()).resolves.toEqual(session);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      fetcher.mockRestore();
    }
  });

  it("establishes an anonymous cookie session before CSRF-protected Google start", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(
        Response.json({
          authorizationUrl:
            "https://accounts.google.com/o/oauth2/v2/auth?state=opaque",
        }),
      );
    const api = new ApiClient("http://localhost:3000", fetcher);
    await expect(
      api.request(apiRoutes.googleStart, googleStartResponseSchema, {
        method: "POST",
        body: {},
      }),
    ).rejects.toMatchObject({ code: "CSRF_INVALID" });
    expect(fetcher).not.toHaveBeenCalled();
    await api.session();
    await api.request(apiRoutes.googleStart, googleStartResponseSchema, {
      method: "POST",
      body: {},
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "GET",
    });
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
      headers: { "X-CSRF-Token": session.csrfToken },
      body: "{}",
    });
    api.clear();
    await expect(
      api.request(apiRoutes.logout, successResponseSchema, {
        method: "POST",
        body: {},
      }),
    ).rejects.toMatchObject({ code: "CSRF_INVALID" });
  });

  it("surfaces safe errors and correlation IDs without rendering a provider response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: "CONFLICT",
            message: "Version changed.",
            requestId: "trace-123",
          },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response("<script>private upstream response</script>", {
          status: 502,
        }),
      );
    const api = new ApiClient("http://localhost:3000", fetcher);
    await expect(
      api.request(apiRoutes.tasks, successResponseSchema),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Version changed.",
      requestId: "trace-123",
    });
    await expect(
      api.request(apiRoutes.tasks, successResponseSchema),
    ).rejects.toThrow("HTTP 502");
  });

  it("drops a late successful private response after clearing the session", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const api = new ApiClient("http://localhost:3000", fetcher);
    const request = api.request(apiRoutes.tasks, successResponseSchema);
    api.clear();
    finish(Response.json({ ok: true }));
    await expect(request).rejects.toThrow("interrupted");
  });

  it("clears concurrent query and mutation 401s once and discards pending private intents", async () => {
    const failure = {
      code: "UNAUTHENTICATED",
      message: "Session expired.",
      requestId: "expired",
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(failure, { status: 401 }))
      .mockResolvedValueOnce(Response.json(failure, { status: 401 }));
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    api.pendingTask = {
      requestId: "pending",
      title: "Private draft",
      dueAt: null,
    };
    api.pendingReminders.set("task", {
      requestId: "pending-reminder",
      scheduledAt: session.expiresAt,
    });
    api.onUnauthenticated = vi.fn();
    const results = await Promise.allSettled([
      api.request(apiRoutes.tasks, successResponseSchema),
      api.request(apiRoutes.logout, successResponseSchema, {
        method: "POST",
        body: {},
      }),
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(api.onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(api.pendingTask).toBeNull();
    expect(api.pendingReminders.size).toBe(0);
    await expect(
      api.request(apiRoutes.logout, successResponseSchema, {
        method: "POST",
        body: {},
      }),
    ).rejects.toMatchObject({ code: "CSRF_INVALID" });
  });

  it("does not restore a stale CSRF token when a session response resolves across generations", async () => {
    const api = new ApiClient("http://localhost:3000", vi.fn<typeof fetch>());
    const response = vi.spyOn(api, "request").mockResolvedValue(session);
    const pending = api.session();
    api.clear();
    await expect(pending).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    response.mockRestore();
    await expect(
      api.request(apiRoutes.logout, successResponseSchema, {
        method: "POST",
        body: {},
      }),
    ).rejects.toMatchObject({ code: "CSRF_INVALID" });
  });

  it("accepts only fixed callback messages and Google authorization origins", () => {
    expect(callbackOutcome("?auth=denied&message=unsafe")).toContain(
      "not granted",
    );
    expect(callbackOutcome("?auth=<script>")).toBeNull();
    expect(
      authorizationRedirect("https://accounts.google.com/o/oauth2/v2/auth"),
    ).toContain("accounts.google.com");
    expect(() =>
      authorizationRedirect(
        "https://accounts.google.com.attacker.example/auth",
      ),
    ).toThrow();
    expect(() => authorizationRedirect("javascript:alert(1)")).toThrow();
    expect(safeExternalLink("javascript:alert(1)")).toBeUndefined();
    expect(
      safeExternalLink("https://calendar.google.com/event?id=1"),
    ).toContain("calendar.google.com");
  });
});
