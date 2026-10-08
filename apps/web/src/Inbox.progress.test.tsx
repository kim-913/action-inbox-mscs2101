// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClient } from "./api/client";
import { Inbox } from "./Inbox";

const id = "10000000-0000-4000-8000-000000000001";
const timestamp = "2026-10-07T12:00:00Z";
const unavailable = {
  code: "PROVIDER_NOT_CONFIGURED",
  message: "Extraction is disabled.",
  requestId: "fixture-extraction",
};
const running = {
  id,
  status: "Running",
  importedCount: 94,
  processedCount: 0,
  error: null,
  createdAt: timestamp,
  completedAt: null,
};
const emails = Array.from({ length: 94 }, (_, index) => ({
  id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  gmailMessageId: `fixture-${index}`,
  sender: "Fixture sender <source@example.test>",
  subject: `Fixture imported source ${index}`,
  receivedAt: timestamp,
  category: null,
  extractionStatus: "Failed",
  extractionError: unavailable,
  suggestions: [],
}));
function page(items: typeof emails, latestSyncRun = running) {
  return {
    items,
    nextCursor: null,
    dataState: { lastSuccessfulSyncAt: null, latestSyncRun },
  };
}
afterEach(cleanup);

describe("readable imports while extraction is pending", () => {
  it("refreshes cached empty inbox on import progress before the run ends", async () => {
    let reads = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/v1/inbox")
        return Response.json(
          ++reads === 1
            ? page([], { ...running, importedCount: 0 })
            : page(emails),
        );
      if (path === `/v1/sync-runs/${id}`) return Response.json(running);
      throw new Error(`Unexpected fixture request ${path}`);
    });
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const open = vi.fn();
    render(
      <QueryClientProvider client={cache}>
        <Inbox
          api={new ApiClient("http://localhost:3000", fetcher)}
          connected
          openEmail={open}
        />
      </QueryClientProvider>,
    );
    const source = await screen.findByRole("button", {
      name: "Fixture imported source 0",
    });
    expect(reads).toBe(2);
    expect(screen.getByText("94 imported · 0 processed")).toBeTruthy();
    expect(
      screen.getByText("Automatic suggestions aren’t configured."),
    ).toBeTruthy();
    expect(screen.queryByText("No synchronized messages yet.")).toBeNull();
    fireEvent.click(source);
    expect(open).toHaveBeenCalledWith(emails[0]!.id);
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(
      true,
    );
  });

  it("labels the bounded polling pause and resumes read-only checks explicitly", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/v1/inbox") return Response.json(page(emails));
      if (path === `/v1/sync-runs/${id}`) return Response.json(running);
      throw new Error(`Unexpected fixture request ${path}`);
    });
    const cache = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      },
    });
    // Keep the simulated 60 observations alive until the inbox enables its run query.
    cache.setQueryData(["private", "inbox"], {
      pages: [page(emails)],
      pageParams: [null],
    });
    for (let count = 0; count < 60; count += 1)
      cache.setQueryData(["private", "sync", id, 0], running);
    expect(
      cache.getQueryState(["private", "sync", id, 0])?.dataUpdateCount,
    ).toBe(60);
    render(
      <QueryClientProvider client={cache}>
        <Inbox
          api={new ApiClient("http://localhost:3000", fetcher)}
          connected
          openEmail={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByText("Progress checks paused");
    expect(
      screen.getByText(/94 imported · 0 processed · Last known: Running/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Check sync progress" }),
    );
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some((call) =>
          String(call[0]).endsWith(`/v1/sync-runs/${id}`),
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.queryByText("Progress checks paused")).toBeNull(),
    );
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(
      true,
    );
  });
});
