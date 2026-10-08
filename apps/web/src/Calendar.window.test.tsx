// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClient } from "./api/client";
import { Calendar } from "./Calendar";
import { DisplayWindowProvider, displayIntervals } from "./display-window";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 8, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Google Calendar display window", () => {
  it("uses saved upcoming bounds, fetches a distinct window after a preference change, and preserves all-day source dates", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/calendar/upcoming")
        return Response.json({
          items: [
            {
              id: "all-day",
              title: `Snapshot through ${url.searchParams.get("endDate")}`,
              start: "2026-10-07",
              end: "2026-10-09",
              allDay: true,
              htmlLink: null,
            },
          ],
          lastSuccessfulFetchAt: "2026-10-08T12:00:00Z",
          error: null,
        });
      return Response.json({ windowDays: 7 });
    });
    const api = new ApiClient("http://localhost:3002", fetcher);
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={cache}>
        <DisplayWindowProvider api={api} userId="calendar-user">
          <Calendar api={api} />
        </DisplayWindowProvider>
      </QueryClientProvider>,
    );
    await screen.findByText(
      "All day: 2026-10-07 through 2026-10-09 (end exclusive)",
    );
    expect(
      screen.getByText(/Bounded provider snapshot: at most 100/),
    ).toBeTruthy();
    const seven = displayIntervals(7).upcoming;
    const firstRequest = fetcher.mock.calls.find(
      ([input]) => new URL(String(input)).pathname === "/v1/calendar/upcoming",
    )!;
    const first = new URL(String(firstRequest[0]));
    for (const [key, value] of Object.entries(seven))
      expect(first.searchParams.get(key)).toBe(value);
    expect(screen.getByText(`Snapshot through ${seven.endDate}`)).toBeTruthy();
    act(() =>
      cache.setQueryData(["private", "display-preferences", "calendar-user"], {
        windowDays: 30,
      }),
    );
    const thirty = displayIntervals(30).upcoming;
    await screen.findByText(`Snapshot through ${thirty.endDate}`);
    expect(screen.queryByText(`Snapshot through ${seven.endDate}`)).toBeNull();
    const requests = fetcher.mock.calls.filter(
      ([input]) => new URL(String(input)).pathname === "/v1/calendar/upcoming",
    );
    expect(requests).toHaveLength(2);
    const changed = new URL(String(requests[1]![0]));
    for (const [key, value] of Object.entries(thirty))
      expect(changed.searchParams.get(key)).toBe(value);
    expect(
      fetcher.mock.calls.every(([, options]) => options?.method === "GET"),
    ).toBe(true);
  });

  it("keeps last-success events and timestamp readable through provider and request failures", async () => {
    const snapshot = {
      items: [
        {
          id: "timed-event",
          title: "Existing appointment",
          start: "2026-10-08T12:00:00Z",
          end: "2026-10-08T13:00:00Z",
          allDay: false,
          htmlLink: "https://calendar.google.com/event",
        },
      ],
      lastSuccessfulFetchAt: "2026-10-08T12:00:00Z",
      error: null,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(snapshot))
      .mockResolvedValueOnce(
        Response.json({
          ...snapshot,
          error: {
            code: "GOOGLE_UNAVAILABLE",
            message: "Calendar provider is unavailable.",
            requestId: "calendar-trace",
          },
        }),
      )
      .mockRejectedValueOnce(new TypeError("offline"));
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={cache}>
        <Calendar api={new ApiClient("http://localhost:3002", fetcher)} />
      </QueryClientProvider>,
    );
    await screen.findByText("Existing appointment");
    const lastSuccess = screen.getByText(/Last successful fetch:/).textContent;
    fireEvent.click(screen.getByRole("button", { name: "Refresh calendar" }));
    await screen.findByRole("alert");
    expect(screen.getByText("Existing appointment")).toBeTruthy();
    expect(
      screen.getByText(/Showing the last successful calendar data/),
    ).toBeTruthy();
    expect(screen.getByText(/Last successful fetch:/).textContent).toBe(
      lastSuccess,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh calendar" }));
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(
      screen
        .getByRole("link", { name: "Open in Google Calendar" })
        .getAttribute("href"),
    ).toBe("https://calendar.google.com/event");
    expect(screen.getByText(/Last successful fetch:/).textContent).toBe(
      lastSuccess,
    );
  });
});
