// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CanvasConnection, CanvasItem } from "@action-inbox/contracts";
import { ApiClient } from "./api/client";
import {
  CanvasConnectionCard,
  CanvasSourceDetails,
  canvasSourceLink,
} from "./CanvasFeed";
import { Planner } from "./PlannerPage";

const privateFeed =
  "https://sofia.instructure.com/feeds/calendars/user_fixture-private-token.ics";
const timestamp = "2026-10-07T12:00:00Z";
const session = {
  authenticated: true,
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "fixture@example.test",
    displayName: "Fixture",
    timezone: "UTC",
  },
  csrfToken: "c".repeat(32),
  expiresAt: "2026-10-08T12:00:00Z",
  googleConnected: true,
};
const disconnected: CanvasConnection = {
  connected: false,
  host: "sofia.instructure.com",
  status: "Disconnected",
  itemCount: 0,
  lastSuccessfulFetchAt: null,
  error: null,
  refreshPolicy: "Manual",
  coverage:
    "Calendar feed only; undated coursework and completion are not included.",
};
const ready: CanvasConnection = {
  ...disconnected,
  connected: true,
  status: "Ready",
  itemCount: 1,
  lastSuccessfulFetchAt: timestamp,
};
const entry: CanvasItem = {
  id: "stable-assignment-42",
  kind: "Assignment",
  title: "Fixture Canvas assignment [COURSE-42]",
  description: "Read the instructions. <img src=x onerror=alert(1)>",
  sourceUrl:
    "https://sofia.instructure.com/calendar?include_contexts=course_42&month=10&year=2026#assignment_11",
  start: { kind: "date", value: "2026-10-09", timeZone: null },
  end: null,
  cancelled: false,
};
function clientCache() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("private Canvas calendar subscription", () => {
  it("uses a password input, clears it on submit, and sends the feed only in a CSRF-protected POST body", async () => {
    let state = disconnected;
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/auth/session") return Response.json(session);
        if (path === "/v1/canvas/connection" && options?.method === "POST") {
          state = ready;
          return Response.json(state);
        }
        if (path === "/v1/canvas/connection") return Response.json(state);
        throw new Error(`Unexpected fixture request ${path}`);
      });
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    const { container } = render(
      <QueryClientProvider client={clientCache()}>
        <CanvasConnectionCard api={api} />
      </QueryClientProvider>,
    );
    const input = (await screen.findByLabelText(
      "Private Sofia Canvas Calendar Feed URL",
    )) as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("off");
    fireEvent.change(input, { target: { value: privateFeed } });
    fireEvent.click(
      screen.getByRole("button", { name: "Connect Canvas calendar" }),
    );
    expect(input.value).toBe("");
    await screen.findByText("Connected · calendar feed only");
    const submitted = fetcher.mock.calls.find(
      (call) => call[1]?.method === "POST",
    );
    expect(String(submitted?.[0])).toBe(
      "http://localhost:3000/v1/canvas/connection",
    );
    expect(submitted?.[1]).toMatchObject({
      credentials: "include",
      headers: { "X-CSRF-Token": session.csrfToken },
      body: JSON.stringify({ feedUrl: privateFeed }),
    });
    expect(container.innerHTML).not.toContain(privateFeed);
    expect(window.location.href).not.toContain("fixture-private-token");
    expect(storage).not.toHaveBeenCalled();
  });

  it("clears a failed attempt and never echoes a provider error containing the private link", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/auth/session") return Response.json(session);
        if (options?.method === "POST")
          return Response.json(
            {
              code: "CANVAS_FEED_INVALID",
              message: `Invalid provider response for ${privateFeed}`,
              requestId: "safe-trace",
            },
            { status: 400 },
          );
        return Response.json(disconnected);
      });
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    const { container } = render(
      <QueryClientProvider client={clientCache()}>
        <CanvasConnectionCard api={api} />
      </QueryClientProvider>,
    );
    const input = (await screen.findByLabelText(
      "Private Sofia Canvas Calendar Feed URL",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: privateFeed } });
    fireEvent.click(
      screen.getByRole("button", { name: "Connect Canvas calendar" }),
    );
    await screen.findByText(/Canvas did not return a supported calendar feed/);
    expect(input.value).toBe("");
    expect(container.innerHTML).not.toContain("fixture-private-token");
  });

  it("rejects a non-Sofia feed before making a mutation and clears the input", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValue(Response.json(disconnected));
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    render(
      <QueryClientProvider client={clientCache()}>
        <CanvasConnectionCard api={api} />
      </QueryClientProvider>,
    );
    const input = (await screen.findByLabelText(
      "Private Sofia Canvas Calendar Feed URL",
    )) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        value: "https://other.example/feeds/calendars/user_secret.ics",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Connect Canvas calendar" }),
    );
    await screen.findByText(
      /Paste the private HTTPS Calendar Feed link from Sofia Canvas/,
    );
    expect(input.value).toBe("");
    expect(fetcher.mock.calls.some((call) => call[1]?.method === "POST")).toBe(
      false,
    );
  });

  it("labels a saved subscription with no successful import as failed, not connected successfully", async () => {
    let state = disconnected;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/auth/session") return Response.json(session);
        if (path === "/v1/canvas/connection") {
          if (options?.method === "POST")
            state = {
              ...disconnected,
              connected: true,
              status: "Failed",
              error: {
                code: "CANVAS_FEED_INVALID",
                message: "Unsupported feed.",
                requestId: "initial-failed-fixture",
              },
            };
          return Response.json(state);
        }
        throw new Error(`Unexpected fixture endpoint: ${path}`);
      });
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    render(
      <QueryClientProvider client={clientCache()}>
        <CanvasConnectionCard api={api} />
      </QueryClientProvider>,
    );
    const input = (await screen.findByLabelText(
      "Private Sofia Canvas Calendar Feed URL",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: privateFeed } });
    fireEvent.click(
      screen.getByRole("button", { name: "Connect Canvas calendar" }),
    );
    await screen.findByText("Subscription saved · import failed");
    expect(screen.queryByText("Connected · calendar feed only")).toBeNull();
    expect(
      screen.queryByLabelText("Private Sofia Canvas Calendar Feed URL"),
    ).toBeNull();
    expect(
      screen.getAllByText(
        /disconnect, then reconnect with a fresh Calendar Feed link/,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Disconnect Canvas" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Refresh Canvas feed",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(input.value).toBe("");
  });

  it("retains imported dates after provider failure, then replaces a changed date under the same item id", async () => {
    let state = ready;
    let current = entry;
    let refreshes = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/auth/session") return Response.json(session);
        if (path === "/v1/canvas/connection") return Response.json(state);
        if (path === "/v1/canvas/items")
          return Response.json({
            items: [current],
            nextCursor: null,
            lastSuccessfulFetchAt: state.lastSuccessfulFetchAt,
          });
        if (path === "/v1/canvas/refresh") {
          expect(options?.body).toBe("{}");
          refreshes += 1;
          if (refreshes === 1)
            state = {
              ...ready,
              status: "Failed",
              error: {
                code: "CANVAS_UNAVAILABLE",
                message: "Provider unavailable.",
                requestId: "refresh-fixture",
              },
            };
          else {
            current = {
              ...entry,
              start: { kind: "date", value: "2026-10-12", timeZone: null },
            };
            state = { ...ready, lastSuccessfulFetchAt: "2026-10-08T12:00:00Z" };
          }
          return Response.json(state);
        }
        if (path === "/v1/inbox")
          return Response.json({
            items: [],
            nextCursor: null,
            dataState: { latestSyncRun: null, lastSuccessfulSyncAt: null },
          });
        if (path === "/v1/tasks")
          return Response.json({ items: [], nextCursor: null });
        if (path === "/v1/calendar/upcoming")
          return Response.json({
            items: [],
            lastSuccessfulFetchAt: null,
            error: null,
          });
        throw new Error(`Unexpected fixture request ${path}`);
      });
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    const cache = clientCache();
    render(
      <QueryClientProvider client={cache}>
        <CanvasConnectionCard api={api} />
        <Planner
          api={api}
          connected
          openEmail={vi.fn()}
          openTask={vi.fn()}
          openInbox={vi.fn()}
          openConnections={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const next = screen.getByRole("region", { name: "What’s next" });
    await within(next).findByRole("heading", { name: entry.title });
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh Canvas feed" }),
    );
    await screen.findAllByText(/Any previously imported dates are kept/);
    expect(
      within(next).getByText(/2026-10-09 · date only/, { selector: "p" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Refresh Canvas feed",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh Canvas feed" }),
    );
    await within(next).findByText(/2026-10-12 · date only/, { selector: "p" });
    expect(
      within(next).queryByText(/2026-10-09 · date only/, { selector: "p" }),
    ).toBeNull();
    expect(
      within(next).getAllByRole("heading", { name: entry.title }),
    ).toHaveLength(1);
    const writes = fetcher.mock.calls.filter(
      (call) => call[1]?.method !== "GET",
    );
    expect(writes).toHaveLength(2);
    expect(
      writes.every((call) => String(call[0]).endsWith("/v1/canvas/refresh")),
    ).toBe(true);
  });

  it("requires disconnect confirmation and removes imported Canvas cache only after server success", async () => {
    let state = ready;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, options) => {
        if (new URL(String(url)).pathname === "/v1/auth/session")
          return Response.json(session);
        if (options?.method === "DELETE") {
          state = disconnected;
          return Response.json({ ok: true });
        }
        return Response.json(state);
      });
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    const cache = clientCache();
    cache.setQueryDefaults(["private", "canvas", "items"], {
      gcTime: Infinity,
    });
    cache.setQueryData(["private", "canvas", "items"], {
      pages: [
        { items: [entry], nextCursor: null, lastSuccessfulFetchAt: timestamp },
      ],
      pageParams: [null],
    });
    render(
      <QueryClientProvider client={cache}>
        <CanvasConnectionCard api={api} />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Disconnect Canvas" }),
    );
    expect(
      fetcher.mock.calls.some((call) => call[1]?.method === "DELETE"),
    ).toBe(false);
    expect(cache.getQueryData(["private", "canvas", "items"])).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm Canvas disconnect" }),
    );
    await screen.findByLabelText("Private Sofia Canvas Calendar Feed URL");
    expect(cache.getQueryData(["private", "canvas", "items"])).toBeUndefined();
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("renders source text safely, preserves date-only meaning, and never links a private feed", () => {
    const literalDescription =
      "Read vector<T>.\nLiteral <script>alert(1)</script> and <img src=x onerror=alert(1)>; &amp; stays &amp; and &lt; stays &lt;.";
    const { container } = render(
      <CanvasSourceDetails
        item={{ ...entry, description: literalDescription }}
      />,
    );
    fireEvent.click(screen.getByText("Canvas source details"));
    expect(
      screen.getByText(literalDescription, { normalizer: (text) => text })
        .textContent,
    ).toBe(literalDescription);
    expect(container.querySelector("script, img, t")).toBeNull();
    expect(
      screen.getByText(/2026-10-09 · date only; no exact time supplied/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open original Canvas source ↗" })
        .getAttribute("href"),
    ).toBe(entry.sourceUrl);
    expect(canvasSourceLink(privateFeed)).toBeUndefined();
    expect(
      canvasSourceLink(
        "https://sofia.instructure.com/f%65eds/calendars/user_secret.ics",
      ),
    ).toBeUndefined();
    expect(canvasSourceLink("javascript:alert(1)")).toBeUndefined();
    expect(canvasSourceLink("https://other.example/calendar")).toBeUndefined();
  });
});
