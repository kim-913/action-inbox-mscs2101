import { describe, expect, it, vi } from "vitest";
import { createHealthController, type HealthState } from "./health-controller";

const healthy = {
  status: "ok",
  service: "action-inbox-api",
  timestamp: "2026-10-07T12:00:00.000Z",
  version: "0.1.0",
};

function pendingResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("health controller", () => {
  it("publishes loading, a retryable failure, and a successful retry", async () => {
    const states: HealthState[] = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json(healthy));
    const controller = createHealthController(
      "http://localhost:3000",
      (state) => states.push(state),
      fetcher,
    );
    const first = controller.check();
    expect(states).toEqual([{ status: "loading" }]);
    await first;
    expect(states[1]).toMatchObject({ status: "error", kind: "http" });
    await controller.check();
    expect(states.slice(2)).toEqual([
      { status: "loading" },
      { status: "connected", health: healthy },
    ]);
    controller.dispose();
  });

  it.each(["success", "failure"])(
    "aborts superseded requests and ignores late %s even when fetch ignores abort",
    async (outcome) => {
      const stale = pendingResponse();
      const states: HealthState[] = [];
      let firstSignal: AbortSignal | null | undefined;
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce((_url, options) => {
          firstSignal = options?.signal;
          return stale.promise;
        })
        .mockResolvedValueOnce(
          Response.json({ ...healthy, version: "newest" }),
        );
      const controller = createHealthController(
        "http://localhost:3000",
        (state) => states.push(state),
        fetcher,
      );
      const first = controller.check();
      await controller.check();
      expect(firstSignal?.aborted).toBe(true);
      const count = states.length;
      if (outcome === "success") stale.resolve(Response.json(healthy));
      else stale.reject(new Error("late network error"));
      await first;
      expect(states).toHaveLength(count);
      expect(states.at(-1)).toEqual({
        status: "connected",
        health: { ...healthy, version: "newest" },
      });
      controller.dispose();
    },
  );

  it.each(["success", "failure"])(
    "does not publish a late %s after unmount/disposal",
    async (outcome) => {
      const pending = pendingResponse();
      const changed = vi.fn<(state: HealthState) => void>();
      let abortSignal: AbortSignal | null | undefined;
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation((_url, options) => {
          abortSignal = options?.signal;
          return pending.promise;
        });
      const controller = createHealthController(
        "http://localhost:3000",
        changed,
        fetcher,
      );
      const request = controller.check();
      controller.dispose();
      expect(abortSignal?.aborted).toBe(true);
      if (outcome === "success") pending.resolve(Response.json(healthy));
      else pending.reject(new Error("late failure"));
      await request;
      await controller.check();
      expect(changed).toHaveBeenCalledExactlyOnceWith({ status: "loading" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
});
