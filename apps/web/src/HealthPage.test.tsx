// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HealthPage } from "./HealthPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("lets the user replace a stalled health request and recover", async () => {
  let stalledSignal: AbortSignal | null | undefined;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce((_url, options) => {
      stalledSignal = options?.signal;
      return new Promise<Response>(() => {});
    })
    .mockResolvedValueOnce(
      Response.json({
        status: "ok",
        service: "action-inbox-api",
        timestamp: "2026-11-23T00:00:00.000Z",
        version: "0.1.0",
      }),
    );
  vi.stubEnv("VITE_API_URL", "http://127.0.0.1:3002");
  vi.stubGlobal("fetch", fetcher);
  render(<HealthPage />);

  const restart = screen.getByRole("button", { name: /check/i });
  expect((restart as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(restart);

  expect(stalledSignal?.aborted).toBe(true);
  await screen.findByRole("heading", { name: "Connected to Action Inbox" });
});
