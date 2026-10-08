import { describe, expect, it, vi } from "vitest";
import { fetchHealth } from "./health";

const healthy = {
  status: "ok",
  service: "action-inbox-api",
  timestamp: "2026-10-07T12:00:00.000Z",
  version: "0.1.0",
};

function signal() {
  return new AbortController().signal;
}

describe("fetchHealth", () => {
  it("requests the exact endpoint with cookies and validates the response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(healthy));
    const abortSignal = signal();
    await expect(
      fetchHealth("http://localhost:3000/", abortSignal, fetcher),
    ).resolves.toEqual(healthy);
    expect(fetcher).toHaveBeenCalledWith("http://localhost:3000/v1/health", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
      signal: abortSignal,
    });
  });

  it.each([
    { ...healthy, status: "down" },
    { ...healthy, service: "another-api" },
    { ...healthy, timestamp: "yesterday" },
    { ...healthy, version: "" },
    { status: "ok" },
    null,
  ])("rejects malformed health contracts: %j", async (body) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body));
    await expect(
      fetchHealth("http://localhost:3000", signal(), fetcher),
    ).rejects.toMatchObject({ kind: "malformed" });
  });

  it("rejects invalid JSON", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not JSON"));
    await expect(
      fetchHealth("http://localhost:3000", signal(), fetcher),
    ).rejects.toMatchObject({ kind: "malformed" });
  });

  it.each([401, 404, 503])(
    "reports HTTP %s without exposing response bodies",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("private provider details", { status }),
        );
      await expect(
        fetchHealth("http://localhost:3000", signal(), fetcher),
      ).rejects.toMatchObject({
        kind: "http",
        message: expect.stringContaining(`HTTP ${status}`),
      });
    },
  );

  it("reports network failures safely", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("private transport details"));
    await expect(
      fetchHealth("http://localhost:3000", signal(), fetcher),
    ).rejects.toMatchObject({
      kind: "network",
      message: expect.not.stringContaining("private"),
    });
  });

  it.each([
    undefined,
    "",
    "bad url",
    "ftp://localhost",
    "http://user:secret@localhost",
    "http://localhost/v1",
    "http://localhost?q=secret",
    "http://localhost/#fragment",
  ])("rejects invalid configuration %s without fetching", async (url) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchHealth(url, signal(), fetcher)).rejects.toMatchObject({
      kind: "configuration",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves cancellation instead of converting it to a network error", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Aborted", "AbortError");
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort();
      throw aborted;
    });
    await expect(
      fetchHealth("http://localhost:3000", controller.signal, fetcher),
    ).rejects.toBe(aborted);
  });
});
