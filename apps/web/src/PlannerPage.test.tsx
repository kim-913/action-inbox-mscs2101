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
import type { EmailSummary, Task } from "@action-inbox/contracts";
import { ApiClient } from "./api/client";
import { Planner } from "./PlannerPage";

const sourceId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const timestamp = new Date().toISOString();
const due = new Date(new Date().setHours(18, 0, 0, 0)).toISOString();
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
      screen.getByRole("button", { name: "Load more source emails" }),
    );
    await screen.findByText("Fixture next-page action");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Load more source emails" }),
      ).toBeNull(),
    );
    expect(
      fetcher.mock.calls.filter((call) =>
        String(call[0]).includes("cursor=next-source"),
      ),
    ).toHaveLength(1);
  });
});
