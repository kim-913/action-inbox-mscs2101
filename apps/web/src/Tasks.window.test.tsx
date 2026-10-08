// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Task } from "@action-inbox/contracts";
import { ApiClient } from "./api/client";
import { displayIntervals } from "./display-window";
import { Tasks } from "./Tasks";

const id = "10000000-0000-4000-8000-000000000001";
const timestamp = "2026-10-08T12:00:00Z";
const task: Task = {
  id,
  title: "Dated Gmail task",
  dueAt: timestamp,
  status: "Pending",
  sourceSuggestionId: id,
  sourceEmailId: id,
  approvedAt: timestamp,
  completedAt: null,
  version: 0,
  reminders: [],
  calendarLink: null,
  createdAt: timestamp,
};

function mount(api: ApiClient, initialTaskId: string | null = null) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const openEmail = vi.fn();
  const view = render(
    <QueryClientProvider client={cache}>
      <Tasks
        api={api}
        timezone="UTC"
        connected
        openEmail={openEmail}
        initialTaskId={initialTaskId}
      />
    </QueryClientProvider>,
  );
  return { ...view, cache, openEmail };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 8, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Task display window", () => {
  it("sends four bounds and source before pagination, resets the cursor on source change, and separates undated counts", async () => {
    const undated = {
      ...task,
      id: "10000000-0000-4000-8000-000000000002",
      title: "Undated manual task",
      dueAt: null,
      sourceEmailId: null,
      sourceSuggestionId: null,
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const source = url.searchParams.get("source");
      return Response.json({
        items: url.searchParams.has("cursor")
          ? []
          : source === "gmail"
            ? [task]
            : source === "manual"
              ? [undated]
              : [task, undated],
        nextCursor:
          source || url.searchParams.has("cursor") ? null : "second-page",
      });
    });
    mount(new ApiClient("http://localhost:3002", fetcher));
    await screen.findByRole("button", { name: /Dated Gmail task/ });
    const dated = screen.getByRole("region", {
      name: "Dated tasks in this window",
    });
    const noDate = screen.getByRole("region", { name: "Undated tasks" });
    expect(
      within(dated).getByText(
        "1 loaded · 1 active · 0 completed · More tasks available below",
      ),
    ).toBeTruthy();
    expect(
      within(noDate).getByText(
        "1 loaded · 1 active · 0 completed · More tasks available below",
      ),
    ).toBeTruthy();
    expect(within(dated).queryByText("Undated manual task")).toBeNull();
    const first = new URL(String(fetcher.mock.calls[0]![0]));
    for (const [key, value] of Object.entries(displayIntervals(30).upcoming)) {
      expect(first.searchParams.get(key)).toBe(value);
    }
    expect(first.searchParams.get("includeUndated")).toBe("true");
    expect(first.searchParams.has("source")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Load more tasks" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(
      new URL(String(fetcher.mock.calls[1]![0])).searchParams.get("cursor"),
    ).toBe("second-page");
    fireEvent.change(screen.getByLabelText("Task source"), {
      target: { value: "gmail" },
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.queryByText("Undated manual task")).toBeNull(),
    );
    const gmail = new URL(String(fetcher.mock.calls[2]![0]));
    expect(gmail.searchParams.get("source")).toBe("gmail");
    expect(gmail.searchParams.has("cursor")).toBe(false);
    fireEvent.change(screen.getByLabelText("Task source"), {
      target: { value: "manual" },
    });
    await screen.findByRole("button", { name: /Undated manual task/ });
    const manual = new URL(String(fetcher.mock.calls[3]![0]));
    expect(manual.searchParams.get("source")).toBe("manual");
    expect(manual.searchParams.has("cursor")).toBe(false);
  });

  it("opens and completes a directly selected task outside the list window and preserves source and action controls", async () => {
    let stored: Task = {
      ...task,
      title: "Older linked task",
      dueAt: "2026-01-01T12:00:00Z",
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, options) => {
        const path = new URL(String(input)).pathname;
        if (path === "/v1/auth/session")
          return Response.json({
            authenticated: true,
            user: {
              id,
              email: "test@example.com",
              displayName: "Test",
              timezone: "UTC",
            },
            csrfToken: "c".repeat(32),
            expiresAt: "2027-01-01T00:00:00Z",
            googleConnected: true,
          });
        if (path === "/v1/tasks")
          return Response.json({ items: [], nextCursor: null });
        if (path === `/v1/tasks/${id}`) {
          if (options?.method === "PATCH") {
            const body = JSON.parse(String(options.body));
            expect(body.version).toBe(stored.version);
            stored = { ...stored, ...body, version: stored.version + 1 };
          }
          return Response.json(stored);
        }
        throw new Error(`Unexpected test request ${path}`);
      });
    const api = new ApiClient("http://localhost:3002", fetcher);
    await api.session();
    const { openEmail } = mount(api, id);
    await screen.findByRole("button", { name: "Save task" });
    const detail = screen.getByRole("region", { name: "Selected task" });
    expect(
      within(detail).getByText(/Not counted in the lists below/),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("region", { name: "Dated tasks in this window" }),
      ).getByText("0 loaded · 0 active · 0 completed"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Task source"), {
      target: { value: "manual" },
    });
    expect(screen.getByLabelText("Title")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "Completed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));
    await waitFor(() => expect(stored.status).toBe("Completed"));
    await screen.findByText(/Version 1/);
    fireEvent.click(
      screen.getByRole("button", { name: "View source email and evidence" }),
    );
    expect(openEmail).toHaveBeenCalledWith(id);
    expect(
      screen.getByText("In-app reminder metadata", {
        exact: false,
        selector: "summary",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Google Calendar event", {
        exact: false,
        selector: "summary",
      }),
    ).toBeTruthy();
    const requests = fetcher.mock.calls.filter(
      ([input, options]) =>
        new URL(String(input)).pathname === `/v1/tasks/${id}` &&
        options?.method === "GET",
    );
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(
      requests.every(([input]) => new URL(String(input)).search === ""),
    ).toBe(true);
  });

  it("shows direct-detail loading and a retryable error without claiming the task is in the filtered list", async () => {
    let resolveDetail!: (response: Response) => void;
    let attempts = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (new URL(String(input)).pathname === "/v1/tasks")
        return Response.json({ items: [], nextCursor: null });
      attempts += 1;
      if (attempts === 1)
        return new Promise<Response>((resolve) => {
          resolveDetail = resolve;
        });
      return Response.json(task);
    });
    mount(new ApiClient("http://localhost:3002", fetcher), id);
    await screen.findByText("Loading selected task…");
    resolveDetail(
      Response.json(
        {
          code: "NOT_FOUND",
          message: "This task is unavailable.",
          requestId: "task-detail-trace",
        },
        { status: 404 },
      ),
    );
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry selected task" }),
    );
    await screen.findByRole("button", { name: "Save task" });
    expect(attempts).toBe(2);
  });
});
