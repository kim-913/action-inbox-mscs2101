// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { displayPreferencesSchema } from "@action-inbox/contracts";
import { ApiClient } from "./api/client";
import { DisplayWindowProvider } from "./display-window";
import { Inbox } from "./Inbox";

const userId = "10000000-0000-4000-8000-000000000001";
const session = {
  authenticated: true,
  user: {
    id: userId,
    email: "test@example.com",
    displayName: "Test User",
    timezone: "UTC",
  },
  csrfToken: "c".repeat(32),
  expiresAt: "2027-01-01T00:00:00Z",
  googleConnected: true,
};
const email = {
  id: userId,
  gmailMessageId: "synthetic-received-message",
  sender: "Synthetic sender",
  subject: "Readable without extraction",
  receivedAt: "2026-10-08T12:00:00Z",
  category: null,
  extractionStatus: "Pending",
  extractionError: null,
  suggestions: [],
};

function fixture(initialDays = 30) {
  let savedDays = initialDays;
  let failSave = false;
  let failLoad = false;
  const requests: URL[] = [];
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input, options) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname === "/v1/auth/session") return Response.json(session);
      if (url.pathname === "/v1/preferences/display") {
        if (
          (options?.method === "PUT" && failSave) ||
          (options?.method === "GET" && failLoad)
        )
          return Response.json(
            {
              code: "INTERNAL_ERROR",
              message: "Preferences unavailable.",
              requestId: "synthetic-preferences",
            },
            { status: 503 },
          );
        if (options?.method === "PUT")
          savedDays = displayPreferencesSchema.parse(
            JSON.parse(String(options.body)),
          ).windowDays;
        return Response.json({ windowDays: savedDays });
      }
      if (url.pathname === "/v1/inbox")
        return Response.json({
          items: url.searchParams.has("cursor")
            ? [
                {
                  ...email,
                  id: "10000000-0000-4000-8000-000000000002",
                  subject: "Second matching page",
                },
              ]
            : [email],
          nextCursor: url.searchParams.has("cursor")
            ? null
            : "next-matching-page",
          dataState: { lastSuccessfulSyncAt: null, latestSyncRun: null },
        });
      throw new Error(`Unexpected request ${url.pathname}`);
    });
  const api = new ApiClient("http://localhost:3000", fetcher);
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  function View({ identity = userId }: { identity?: string }) {
    return (
      <QueryClientProvider client={cache}>
        <DisplayWindowProvider key={identity} userId={identity} api={api}>
          <Inbox api={api} connected={true} openEmail={() => undefined} />
        </DisplayWindowProvider>
      </QueryClientProvider>
    );
  }
  return {
    api,
    cache,
    View,
    fetcher,
    requests,
    failSave: (value: boolean) => {
      failSave = value;
    },
    failLoad: (value: boolean) => {
      failLoad = value;
    },
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("saved display window", () => {
  it("loads saved custom days before listing mail, saves with CSRF and persists across remount", async () => {
    const test = fixture(14);
    await test.api.session();
    const view = render(<test.View />);
    await screen.findByText("Readable without extraction");
    expect(screen.getByText("Saved: 14 days, including today")).toBeTruthy();
    const customInput = screen.getByLabelText("Custom days (1–365)");
    expect(customInput).toBeInstanceOf(HTMLInputElement);
    if (customInput instanceof HTMLInputElement)
      expect(customInput.value).toBe("14");
    fireEvent.change(screen.getByLabelText("Display days"), {
      target: { value: "7" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Apply display window" }),
    );
    await screen.findByText("Saved: 7 days, including today");
    await waitFor(() =>
      expect(
        test.requests.filter((url) => url.pathname === "/v1/inbox"),
      ).toHaveLength(2),
    );
    const put = test.fetcher.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(put?.[1]).toMatchObject({
      credentials: "include",
      headers: { "X-CSRF-Token": session.csrfToken },
      body: JSON.stringify({ windowDays: 7 }),
    });
    expect(test.requests.every((url) => !url.pathname.includes("sync"))).toBe(
      true,
    );
    view.unmount();
    render(<test.View />);
    await screen.findByText("Saved: 7 days, including today");
  });

  it("does not change the active range or refetch lists on invalid or failed save", async () => {
    const test = fixture();
    await test.api.session();
    render(<test.View />);
    await screen.findByText("Readable without extraction");
    fireEvent.change(screen.getByLabelText("Display days"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Custom days (1–365)"), {
      target: { value: "366" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Apply display window" })
        .closest("form")!,
    );
    await screen.findByText("Choose a whole number of days from 1 to 365.");
    expect(
      test.fetcher.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(false);
    test.failSave(true);
    fireEvent.change(screen.getByLabelText("Custom days (1–365)"), {
      target: { value: "8" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Apply display window" }),
    );
    await screen.findByText("Preferences unavailable.");
    expect(screen.getByText("Saved: 30 days, including today")).toBeTruthy();
    expect(
      test.requests.filter((url) => url.pathname === "/v1/inbox"),
    ).toHaveLength(1);
    test.failSave(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Apply display window" }),
    );
    await screen.findByText("Saved: 8 days, including today");
  });

  it("keeps failed preference loads explicit and retries before requesting any list", async () => {
    const test = fixture();
    test.failLoad(true);
    await test.api.session();
    render(<test.View />);
    await screen.findByText("Preferences unavailable.");
    expect(test.requests.some((url) => url.pathname === "/v1/inbox")).toBe(
      false,
    );
    test.failLoad(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry display preferences" }),
    );
    await screen.findByText("Readable without extraction");
  });

  it("paginates within the received range and discards old cursors at local day rollover", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 23, 59));
    const test = fixture(7);
    await test.api.session();
    render(<test.View />);
    await screen.findByText("Readable without extraction");
    fireEvent.click(screen.getByRole("button", { name: "Load more messages" }));
    await screen.findByText("Second matching page");
    let queries = test.requests.filter((url) => url.pathname === "/v1/inbox");
    expect(queries[1]?.searchParams.get("cursor")).toBe("next-matching-page");
    for (const query of queries) {
      expect(query.searchParams.get("dateField")).toBe("received");
      expect(query.searchParams.get("startDate")).toBe("2026-10-02");
      expect(query.searchParams.get("endDate")).toBe("2026-10-09");
      expect(query.searchParams.has("startAt")).toBe(true);
      expect(query.searchParams.has("endAt")).toBe(true);
    }
    await act(async () => {
      vi.setSystemTime(new Date(2026, 9, 9, 0, 1));
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(screen.queryByText("Second matching page")).toBeNull(),
    );
    await waitFor(() =>
      expect(
        test.requests.filter((url) => url.pathname === "/v1/inbox"),
      ).toHaveLength(3),
    );
    queries = test.requests.filter((url) => url.pathname === "/v1/inbox");
    expect(queries[2]?.searchParams.get("cursor")).toBeNull();
    expect(queries[2]?.searchParams.get("startDate")).toBe("2026-10-03");
    expect(queries[2]?.searchParams.get("endDate")).toBe("2026-10-10");
  });

  it("clears private cached pages when the authenticated account identity changes", async () => {
    const test = fixture();
    await test.api.session();
    const view = render(<test.View />);
    await screen.findByText("Readable without extraction");
    test.cache.setQueryData(["private", "email", "old-account"], {
      body: "Previous private message",
    });
    view.rerender(
      <test.View identity="10000000-0000-4000-8000-000000000099" />,
    );
    await screen.findByText("Readable without extraction");
    expect(
      test.cache.getQueryData(["private", "email", "old-account"]),
    ).toBeUndefined();
    expect(
      test.requests.filter((url) => url.pathname === "/v1/preferences/display"),
    ).toHaveLength(2);
  });
});
