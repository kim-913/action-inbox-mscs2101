// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EmailSummary, Task } from "@action-inbox/contracts";
import { ApiClient } from "./api/client";
import { Planner } from "./PlannerPage";
import { DisplayWindowProvider } from "./display-window";

const sourceId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const timestamp = new Date().toISOString();
const due = new Date(new Date().setHours(18, 0, 0, 0)).toISOString();
const canvasDisconnected = {
  connected: false,
  host: "sofia.instructure.com",
  status: "Disconnected",
  itemCount: 0,
  lastSuccessfulFetchAt: null,
  error: null,
  refreshPolicy: "Manual",
  coverage: "Calendar feed only.",
};
const email: EmailSummary = {
  id: sourceId,
  gmailMessageId: "fixture",
  sender: "office@example.test",
  subject: "Fixture source message",
  receivedAt: timestamp,
  category: "Action Required",
  extractionStatus: "Succeeded",
  extractionError: null,
  suggestions: [
    {
      id: sourceId,
      emailId: sourceId,
      title: "Fixture proposed action",
      category: "Action Required",
      dueAt: due,
      deadlineCertainty: "Explicit",
      confidence: 0.7,
      evidence: { quote: "Fixture", start: 0, end: 7 },
      deadlineEvidence: { quote: "Fixture", start: 0, end: 7 },
      reviewState: "Proposed",
      needsReview: false,
      reviewReason: null,
      version: 0,
      createdAt: timestamp,
    },
  ],
};
const task: Task = {
  id: taskId,
  title: "Fixture manual undated task",
  dueAt: null,
  status: "Pending",
  sourceSuggestionId: null,
  sourceEmailId: null,
  approvedAt: timestamp,
  completedAt: null,
  version: 0,
  reminders: [],
  calendarLink: null,
  createdAt: timestamp,
};
afterEach(cleanup);

describe("planner interactions", () => {
  it("opens evidence and task details, separates undated work, and excludes completed tasks", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/v1/inbox")
        return Response.json({
          items: [email],
          nextCursor: null,
          dataState: { lastSuccessfulSyncAt: timestamp, latestSyncRun: null },
        });
      if (path === "/v1/tasks")
        return Response.json({
          items: [
            task,
            {
              ...task,
              id: "20000000-0000-4000-8000-000000000002",
              title: "Fixture completed task",
              dueAt: due,
              status: "Completed",
            },
          ],
          nextCursor: null,
        });
      if (path === "/v1/canvas/connection")
        return Response.json(canvasDisconnected);
      if (path === "/v1/calendar/upcoming")
        return Response.json({
          items: [],
          lastSuccessfulFetchAt: timestamp,
          error: null,
        });
      throw new Error(`Unexpected fixture request ${path}`);
    });
    const openEmail = vi.fn(),
      openTask = vi.fn();
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={cache}>
        <Planner
          api={new ApiClient("http://localhost:3000", fetcher)}
          connected
          openEmail={openEmail}
          openTask={openTask}
          openInbox={vi.fn()}
          openConnections={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByText("Fixture manual undated task");
    const undated = screen.getByRole("region", { name: "Needs a date" });
    expect(
      within(undated).getByText("Fixture manual undated task"),
    ).toBeTruthy();
    expect(screen.queryByText("Fixture completed task")).toBeNull();
    expect(screen.getAllByText("Unconfirmed date:").length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Review source & actions →" })[0]!,
    );
    expect(openEmail).toHaveBeenCalledWith(sourceId);
    fireEvent.click(
      within(undated).getByRole("button", { name: "Open task details →" }),
    );
    expect(openTask).toHaveBeenCalledWith(taskId);
    fireEvent.click(screen.getByRole("button", { name: "+ New task" }));
    expect(openTask).toHaveBeenLastCalledWith();
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(
      true,
    );
  });

  it("labels a partial plan and loads another source page only when requested", async () => {
    const second = {
      ...email,
      id: "10000000-0000-4000-8000-000000000002",
      subject: "Fixture next-page source",
      suggestions: [
        {
          ...email.suggestions[0]!,
          id: "30000000-0000-4000-8000-000000000002",
          title: "Fixture next-page action",
          dueAt: null,
          deadlineCertainty: "None",
        },
      ],
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = new URL(String(url));
      if (address.pathname === "/v1/inbox")
        return Response.json({
          items: [address.searchParams.has("cursor") ? second : email],
          nextCursor: address.searchParams.has("cursor") ? null : "next-source",
          dataState: { lastSuccessfulSyncAt: timestamp, latestSyncRun: null },
        });
      if (address.pathname === "/v1/tasks")
        return Response.json({ items: [], nextCursor: null });
      if (address.pathname === "/v1/canvas/connection")
        return Response.json(canvasDisconnected);
      if (address.pathname === "/v1/calendar/upcoming")
        return Response.json({
          items: [],
          lastSuccessfulFetchAt: timestamp,
          error: null,
        });
      throw new Error(`Unexpected fixture request ${address.pathname}`);
    });
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={cache}>
        <Planner
          api={new ApiClient("http://localhost:3000", fetcher)}
          connected
          openEmail={vi.fn()}
          openTask={vi.fn()}
          openInbox={vi.fn()}
          openConnections={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByText(/This is a partial plan/);
    expect(
      fetcher.mock.calls.some((call) => String(call[0]).includes("cursor=")),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Load more proposal emails" }),
    );
    await screen.findByText("Fixture next-page action");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Load more proposal emails" }),
      ).toBeNull(),
    );
    expect(
      fetcher.mock.calls.filter((call) =>
        String(call[0]).includes("cursor=next-source"),
      ),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Load more source emails" }),
    ).toBeTruthy();
    const proposalPage = fetcher.mock.calls.find((call) =>
      String(call[0]).includes("cursor=next-source"),
    );
    const params = new URL(String(proposalPage![0])).searchParams;
    expect(params.get("dateField")).toBe("suggestionDue");
    expect(params.get("reviewState")).toBe("Proposed");
    expect(params.get("includeUndated")).toBe("true");
    for (const bound of ["startAt", "endAt", "startDate", "endDate"])
      expect(params.has(bound)).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Load more source emails" }),
    );
    await screen.findByText("Fixture next-page source");
    expect(
      fetcher.mock.calls.filter(([url]) => {
        const address = new URL(String(url));
        return (
          address.searchParams.get("dateField") === "received" &&
          address.searchParams.get("cursor") === "next-source"
        );
      }),
    ).toHaveLength(1);
  });

  it("keeps no-AI recent Gmail readable and older upcoming proposals separate while isolating sources", async () => {
    const oldReceivedAt = new Date(2001, 0, 1).toISOString();
    const noAiMail = {
      ...email,
      subject: "Readable without AI",
      suggestions: [],
      extractionStatus: "Failed",
      extractionError: {
        code: "PROVIDER_NOT_CONFIGURED",
        message: "Extraction unavailable",
        requestId: "fixture-request",
      },
    };
    const oldProposal = {
      ...email,
      receivedAt: oldReceivedAt,
      subject: "Older source with future work",
      suggestions: [
        { ...email.suggestions[0]!, title: "Older email upcoming action" },
        {
          ...email.suggestions[0]!,
          id: "30000000-0000-4000-8000-000000000003",
          title: "Out-of-window proposal",
          dueAt: oldReceivedAt,
        },
        {
          ...email.suggestions[0]!,
          id: "30000000-0000-4000-8000-000000000004",
          title: "Undated proposal",
          dueAt: null,
          deadlineCertainty: "None",
        },
      ],
    };
    const gmailTask = {
      ...task,
      id: "20000000-0000-4000-8000-000000000003",
      title: "Gmail task without loaded source",
      sourceEmailId: "10000000-0000-4000-8000-000000000099",
      dueAt: due,
      calendarLink: {
        status: "Created",
        googleEventId: "linked-event",
        htmlLink: null,
        error: null,
      },
    };
    const event = {
      id: "linked-event",
      title: "Overlapping linked Calendar event",
      start: new Date(
        new Date().setDate(new Date().getDate() - 2),
      ).toISOString(),
      end: due,
      allDay: false,
      htmlLink: null,
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = new URL(String(url));
      if (address.pathname === "/v1/inbox")
        return Response.json({
          items:
            address.searchParams.get("dateField") === "received"
              ? [noAiMail]
              : [oldProposal],
          nextCursor: null,
          dataState: { lastSuccessfulSyncAt: timestamp, latestSyncRun: null },
        });
      if (address.pathname === "/v1/tasks") {
        const selected = address.searchParams.get("source");
        return Response.json({
          items:
            selected === "gmail"
              ? [gmailTask]
              : selected === "manual"
                ? [task]
                : [task, gmailTask],
          nextCursor: null,
        });
      }
      if (address.pathname === "/v1/canvas/connection")
        return Response.json({
          ...canvasDisconnected,
          connected: true,
          status: "Ready",
          itemCount: 1,
        });
      if (address.pathname === "/v1/canvas/items")
        return Response.json({
          items: [
            {
              id: "canvas-fixture",
              kind: "Event",
              title: "Canvas overlapping event",
              description: "",
              sourceUrl: null,
              start: { value: event.start, kind: "instant", timeZone: "UTC" },
              end: { value: due, kind: "instant", timeZone: "UTC" },
              cancelled: false,
            },
          ],
          nextCursor: null,
          lastSuccessfulFetchAt: timestamp,
        });
      if (address.pathname === "/v1/calendar/upcoming")
        return Response.json({
          items: [event],
          lastSuccessfulFetchAt: timestamp,
          error: null,
        });
      throw new Error(`Unexpected fixture request ${address.pathname}`);
    });
    const openEmail = vi.fn();
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={cache}>
        <Planner
          api={new ApiClient("http://localhost:3000", fetcher)}
          connected
          openEmail={openEmail}
          openTask={vi.fn()}
          openInbox={vi.fn()}
          openConnections={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByText("Readable without AI");
    fireEvent.click(screen.getByRole("button", { name: "Gmail" }));
    await screen.findByText("Readable without AI");
    const recent = screen.getByRole("region", { name: "Recent Gmail emails" });
    expect(
      within(recent).queryByText("Older source with future work"),
    ).toBeNull();
    fireEvent.click(
      within(recent).getByRole("button", { name: "Open email & source →" }),
    );
    expect(openEmail).toHaveBeenLastCalledWith(sourceId);
    await screen.findAllByText("Older email upcoming action");
    expect(
      screen.getAllByText("Gmail task without loaded source").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Out-of-window proposal")).toBeNull();
    expect(screen.queryByText("Fixture manual undated task")).toBeNull();
    expect(screen.queryByText("Canvas overlapping event")).toBeNull();
    expect(screen.queryByText("Overlapping linked Calendar event")).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Needs a date" })).getByText(
        "Undated proposal",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "What’s next" })).queryByText(
        "Undated proposal",
      ),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Google Calendar" }));
    await screen.findAllByText("Overlapping linked Calendar event");
    expect(
      screen.getAllByRole("heading", {
        name: "Overlapping linked Calendar event",
      }),
    ).toHaveLength(2);
    const todayCell = screen.getByRole("button", {
      name: `${new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}, 1 loaded items`,
    });
    expect(
      within(todayCell).getByText("Overlapping linked Calendar event"),
    ).toBeTruthy();
    expect(screen.queryByText("Readable without AI")).toBeNull();
    expect(screen.queryByText("Older email upcoming action")).toBeNull();
    expect(screen.queryByText("Gmail task without loaded source")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Canvas" }));
    await screen.findAllByText("Canvas overlapping event");
    expect(
      screen.getAllByRole("heading", {
        name: "Canvas overlapping event",
      }),
    ).toHaveLength(2);
    expect(screen.queryByText("Overlapping linked Calendar event")).toBeNull();
    expect(screen.queryByText("Fixture manual undated task")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Manual tasks" }));
    await screen.findByText("Fixture manual undated task");
    expect(screen.queryByText("Canvas overlapping event")).toBeNull();
    expect(screen.queryByText("Gmail task without loaded source")).toBeNull();
    for (const [url] of fetcher.mock.calls) {
      const address = new URL(String(url));
      if (address.pathname === "/v1/canvas/connection") continue;
      for (const bound of ["startAt", "endAt", "startDate", "endDate"])
        expect(address.searchParams.has(bound)).toBe(true);
    }
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(
      true,
    );
  });

  it("resets week and selected day when the saved interval changes without importing", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = new URL(String(url));
      if (address.pathname === "/v1/preferences/display")
        return Response.json({ windowDays: 30 });
      if (address.pathname === "/v1/inbox")
        return Response.json({
          items: [],
          nextCursor: null,
          dataState: { lastSuccessfulSyncAt: null, latestSyncRun: null },
        });
      if (address.pathname === "/v1/tasks")
        return Response.json({ items: [], nextCursor: null });
      if (address.pathname === "/v1/canvas/connection")
        return Response.json(canvasDisconnected);
      if (address.pathname === "/v1/calendar/upcoming")
        return Response.json({
          items: [],
          lastSuccessfulFetchAt: null,
          error: null,
        });
      throw new Error(`Unexpected fixture request ${address.pathname}`);
    });
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const api = new ApiClient("http://localhost:3000", fetcher);
    render(
      <QueryClientProvider client={cache}>
        <DisplayWindowProvider api={api} userId="fixture-user">
          <Planner
            api={api}
            connected
            openEmail={vi.fn()}
            openTask={vi.fn()}
            openInbox={vi.fn()}
            openConnections={vi.fn()}
          />
        </DisplayWindowProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "Next week" });
    fireEvent.click(screen.getByRole("button", { name: "Gmail" }));
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    const todayLabel = `${new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })}, 0 loaded items`;
    expect(screen.queryByRole("button", { name: todayLabel })).toBeNull();
    act(() => {
      cache.setQueryData(["private", "display-preferences", "fixture-user"], {
        windowDays: 7,
      });
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: todayLabel })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(
      screen
        .getByRole("button", { name: "Gmail" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) => {
          const address = new URL(String(url));
          if (address.searchParams.get("dateField") !== "suggestionDue")
            return false;
          const start = address.searchParams.get("startDate");
          const end = address.searchParams.get("endDate");
          return (
            start &&
            end &&
            (Date.parse(end) - Date.parse(start)) / 86400000 === 7
          );
        }),
      ).toBe(true),
    );
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(
      true,
    );
  });
});
