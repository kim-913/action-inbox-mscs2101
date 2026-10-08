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
import type { ReactNode } from "react";
import type { Reminder, Suggestion, Task } from "@action-inbox/contracts";
import { ApiClient } from "./api/client";
import { Application } from "./App";
import { Calendar } from "./Calendar";
import { Inbox, SuggestionReview } from "./Inbox";
import { EventCreator, ManualTask, Tasks } from "./Tasks";

const id = "10000000-0000-4000-8000-000000000001";
const timestamp = "2026-10-07T12:00:00Z";
const session = {
  authenticated: true,
  user: {
    id,
    email: "test@example.com",
    displayName: "Test User",
    timezone: "UTC",
  },
  csrfToken: "c".repeat(32),
  expiresAt: "2026-10-08T00:00:00Z",
  googleConnected: true,
};
const task: Task = {
  id,
  title: "Send documents",
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
const suggestion: Suggestion = {
  id,
  emailId: id,
  category: "Action Required",
  title: "Send documents",
  dueAt: null,
  deadlineCertainty: "Uncertain",
  confidence: 0.7,
  evidence: { quote: "Send documents", start: 0, end: 14 },
  deadlineEvidence: null,
  needsReview: true,
  reviewReason: "No exact date in the message.",
  reviewState: "Proposed",
  version: 3,
  createdAt: timestamp,
};
function mount(children: ReactNode) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return {
    ...render(
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>,
    ),
    cache,
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("P0 browser interactions", () => {
  it("loads the anonymous session and redirects only after an explicit Google connection", async () => {
    const navigate = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          ...session,
          authenticated: false,
          user: null,
          googleConnected: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          authorizationUrl:
            "https://accounts.google.com/o/oauth2/v2/auth?state=opaque",
        }),
      );
    mount(
      <Application
        api={new ApiClient("http://localhost:3000", fetcher)}
        navigate={navigate}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect Google account" }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth?state=opaque",
      ),
    );
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      headers: { "X-CSRF-Token": session.csrfToken },
      credentials: "include",
    });
  });

  it("keeps separate source evidence and uncertainty visible and approves edited intent at the observed version", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(task));
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    mount(
      <SuggestionReview
        api={api}
        suggestion={suggestion}
        source="Send documents when ready."
      />,
    );
    expect(screen.getByText("No supported deadline quotation.")).toBeTruthy();
    expect(screen.getByText(/Review required: No exact date/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Send registration documents" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve task" }));
    await screen.findByText(/Approved. The task is available/);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({
        version: 3,
        title: "Send registration documents",
        dueAt: null,
      }),
    );
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      `/suggestions/${id}/approve`,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retains the same manual creation idempotency key after an ambiguous network failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json(task));
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    mount(<ManualTask api={api} />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Send documents" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry creating this task" }),
    );
    await screen.findByText("Manual task created.");
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(
      fetcher.mock.calls[2]?.[1]?.body,
    );
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toMatchObject({
      requestId: expect.any(String),
      title: "Send documents",
    });
  });

  it("uses a new creation key when a definitely rejected input is corrected", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(
        Response.json(
          {
            code: "INVALID_REQUEST",
            message: "Correct this input.",
            requestId: "invalid-trace",
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(Response.json(task));
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    mount(<ManualTask api={api} />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Rejected title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(
      false,
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Corrected title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    await screen.findByText("Manual task created.");
    const first = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
      requestId: string;
    };
    const second = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body)) as {
      requestId: string;
      title: string;
    };
    expect(second.requestId).not.toBe(first.requestId);
    expect(second.title).toBe("Corrected title");
  });

  it("requires calendar confirmation and retries the identical event after failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        Response.json({
          status: "Created",
          googleEventId: "event-1",
          htmlLink: "https://calendar.google.com/event",
          error: null,
        }),
      );
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    mount(<EventCreator api={api} task={task} timezone="UTC" connected />);
    const submit = screen.getByRole("button", {
      name: "Create confirmed calendar event",
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Event start (local time)"), {
      target: { value: "2026-10-08T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Event end (local time)"), {
      target: { value: "2026-10-08T13:00" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same calendar request" }),
    );
    await screen.findByText("Google Calendar event creation confirmed.");
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(
      fetcher.mock.calls[2]?.[1]?.body,
    );
  });

  it("retains successful calendar events after refresh failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              id: "event-1",
              title: "Existing appointment",
              start: timestamp,
              end: "2026-10-07T13:00:00Z",
              allDay: false,
              htmlLink: null,
            },
          ],
          lastSuccessfulFetchAt: timestamp,
          error: null,
        }),
      )
      .mockRejectedValueOnce(new TypeError("offline"));
    mount(<Calendar api={new ApiClient("http://localhost:3000", fetcher)} />);
    await screen.findByText("Existing appointment");
    fireEvent.click(screen.getByRole("button", { name: "Refresh calendar" }));
    await screen.findByRole("alert");
    expect(screen.getByText("Existing appointment")).toBeTruthy();
    expect(
      screen.getByText(/Showing the last successful calendar data/),
    ).toBeTruthy();
  });

  it.each(["Save suggestion edits", "Reject suggestion"])(
    "sends the observed version for %s and explains conflicts",
    async (label) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(session))
        .mockResolvedValueOnce(
          Response.json(
            {
              code: "CONFLICT",
              message: "This suggestion changed.",
              requestId: "conflict-trace",
            },
            { status: 409 },
          ),
        );
      const api = new ApiClient("http://localhost:3000", fetcher);
      await api.session();
      mount(
        <SuggestionReview
          api={api}
          suggestion={suggestion}
          source="Send documents when ready."
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: label }));
      await screen.findByText(/Another change was saved first/);
      expect(
        JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)),
      ).toMatchObject({ version: 3 });
      expect(fetcher.mock.calls[1]?.[1]?.method).toBe(
        label === "Reject suggestion" ? "POST" : "PATCH",
      );
    },
  );

  it("retains messages and exposes a retry after a failed sync", async () => {
    const failure = {
      code: "AI_UNAVAILABLE",
      message: "Extraction unavailable.",
      requestId: "sync-trace",
    };
    const run = {
      id,
      status: "Failed",
      importedCount: 1,
      processedCount: 0,
      error: failure,
      createdAt: timestamp,
      completedAt: timestamp,
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/v1/auth/session") return Response.json(session);
      if (path === "/v1/inbox")
        return Response.json({
          items: [
            {
              id,
              gmailMessageId: "gmail-1",
              sender: "office@example.com",
              subject: "Retained source message",
              receivedAt: timestamp,
              category: null,
              extractionStatus: "Failed",
              extractionError: failure,
              suggestions: [],
            },
          ],
          nextCursor: null,
          dataState: { lastSuccessfulSyncAt: timestamp, latestSyncRun: run },
        });
      if (path === `/v1/sync-runs/${id}`) return Response.json(run);
      if (path === "/v1/sync/gmail")
        return Response.json({
          ...run,
          status: "Queued",
          error: null,
          completedAt: null,
        });
      throw new Error(`Unexpected request ${path}`);
    });
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    const open = vi.fn();
    mount(<Inbox api={api} connected openEmail={open} />);
    await screen.findByText("Retained source message");
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry Gmail sync" }),
    );
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some((call) =>
          String(call[0]).endsWith("/v1/sync/gmail"),
        ),
      ).toBe(true),
    );
    expect(screen.getByText("Retained source message")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Retained source message" }),
    );
    expect(open).toHaveBeenCalledWith(id);
  });

  it("edits task status through waiting, completion and reopen and stores, edits and cancels reminder metadata", async () => {
    let stored: Task = { ...task, sourceEmailId: id };
    const reminderId = "10000000-0000-4000-8000-000000000002";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/auth/session") return Response.json(session);
        if (path === "/v1/tasks")
          return Response.json({ items: [stored], nextCursor: null });
        if (path === `/v1/tasks/${id}` && options?.method === "PATCH") {
          const body = JSON.parse(String(options.body)) as {
            title: string;
            dueAt: string | null;
            status: Task["status"];
            version: number;
          };
          expect(body.version).toBe(stored.version);
          stored = { ...stored, ...body, version: stored.version + 1 };
          return Response.json(stored);
        }
        if (path === `/v1/tasks/${id}/reminders`) {
          const body = JSON.parse(String(options?.body)) as {
            scheduledAt: string;
            requestId: string;
          };
          expect(body.requestId).toBeTruthy();
          const reminder: Reminder = {
            id: reminderId,
            taskId: id,
            scheduledAt: body.scheduledAt,
            status: "Scheduled",
            delivery: "Not configured",
          };
          stored = { ...stored, reminders: [reminder] };
          return Response.json(reminder);
        }
        if (path === `/v1/reminders/${reminderId}`) {
          const previous = stored.reminders[0]!;
          if (options?.method === "DELETE") {
            stored = {
              ...stored,
              reminders: [{ ...previous, status: "Cancelled" }],
            };
            return Response.json({ ok: true });
          }
          const body = JSON.parse(String(options?.body)) as {
            scheduledAt: string;
          };
          const edited = { ...previous, scheduledAt: body.scheduledAt };
          stored = { ...stored, reminders: [edited] };
          return Response.json(edited);
        }
        throw new Error(`Unexpected request ${path}`);
      });
    const api = new ApiClient("http://localhost:3000", fetcher);
    await api.session();
    const open = vi.fn();
    mount(<Tasks api={api} timezone="UTC" connected openEmail={open} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Send documents/ }),
    );
    await screen.findByRole("button", { name: "Save task" });
    for (const status of ["Waiting for Reply", "Completed", "Pending"]) {
      fireEvent.change(screen.getByLabelText("Status"), {
        target: { value: status },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save task" }));
      await waitFor(() => expect(stored.status).toBe(status));
      await waitFor(() =>
        expect(
          (screen.getByLabelText("Status") as HTMLSelectElement).disabled,
        ).toBe(false),
      );
    }
    fireEvent.click(
      screen.getByRole("button", { name: "View source email and evidence" }),
    );
    expect(open).toHaveBeenCalledWith(id);
    fireEvent.click(
      screen.getByText("In-app reminder metadata", {
        exact: false,
        selector: "summary",
      }),
    );
    fireEvent.change(screen.getByLabelText("Reminder date and time (local)"), {
      target: { value: "2026-10-08T12:00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save reminder metadata" }),
    );
    await screen.findByRole("heading", { name: "Edit in-app reminder" });
    fireEvent.change(
      screen.getAllByLabelText("Reminder date and time (local)")[1]!,
      { target: { value: "2026-10-08T14:00" } },
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Save reminder metadata" })[1]!,
    );
    await waitFor(() =>
      expect(stored.reminders[0]?.scheduledAt).toBe(
        new Date("2026-10-08T14:00").toISOString(),
      ),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Cancel reminder metadata",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel reminder metadata" }),
    );
    await screen.findByText(/Cancelled in-app reminder:/);
    expect(stored.reminders[0]?.status).toBe("Cancelled");
  });

  it("requires account confirmation then removes cached private data after logout", async () => {
    let loggedOut = false;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/v1/auth/session")
        return Response.json(
          loggedOut
            ? {
                ...session,
                authenticated: false,
                user: null,
                googleConnected: false,
              }
            : session,
        );
      if (path === "/v1/inbox")
        return Response.json({
          items: [],
          nextCursor: null,
          dataState: { lastSuccessfulSyncAt: null, latestSyncRun: null },
        });
      if (path === "/v1/tasks")
        return Response.json({ items: [], nextCursor: null });
      if (path === "/v1/canvas/connection")
        return Response.json({
          connected: false,
          host: "sofia.instructure.com",
          status: "Disconnected",
          itemCount: 0,
          lastSuccessfulFetchAt: null,
          error: null,
          refreshPolicy: "Manual",
          coverage: "Calendar feed only.",
        });
      if (path === "/v1/calendar/upcoming")
        return Response.json({
          items: [],
          lastSuccessfulFetchAt: null,
          error: null,
        });
      if (path === "/v1/auth/logout") {
        loggedOut = true;
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected test request ${path}`);
    });
    const { cache } = mount(
      <Application api={new ApiClient("http://localhost:3000", fetcher)} />,
    );
    await screen.findByText("Signed in as Test User");
    cache.setQueryData(["private", "secret"], { body: "private data" });
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Main navigation" }),
      ).getByRole("button", { name: "Connections" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(
      fetcher.mock.calls.some((call) => String(call[0]).endsWith("/logout")),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm logout" }));
    await waitFor(() =>
      expect(cache.getQueryData(["private", "secret"])).toBeUndefined(),
    );
    await screen.findByRole("heading", {
      name: "Turn email into a next step you approve.",
    });
    expect(screen.queryByText("Signed in as Test User")).toBeNull();
  });
});
