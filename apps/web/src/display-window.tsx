import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  displayPreferencesSchema,
  displayRoutes,
} from "@action-inbox/contracts";
import { type ApiClient, RequestError } from "./api/client";
import { ActionNotice, ErrorNotice, useAction } from "./ui";

export type DisplayInterval = {
  startAt: string;
  endAt: string;
  startDate: string;
  endDate: string;
};

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Calendar arithmetic, not N * 24 hours: DST days need not last 24 hours.
export function displayIntervals(windowDays: number, now = new Date()) {
  const boundary = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const interval = (start: Date, end: Date): DisplayInterval => ({
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    startDate: localDay(start),
    endDate: localDay(end),
  });
  return {
    recent: interval(boundary(1 - windowDays), boundary(1)),
    upcoming: interval(boundary(0), boundary(windowDays)),
  };
}

export function windowQuery(interval: DisplayInterval): string {
  return new URLSearchParams(interval).toString();
}

export function withinWindow(
  value: string | null,
  interval: DisplayInterval,
  allDay = false,
): boolean {
  if (!value) return false;
  if (allDay) return value >= interval.startDate && value < interval.endDate;
  const instant = Date.parse(value);
  return (
    instant >= Date.parse(interval.startAt) &&
    instant < Date.parse(interval.endAt)
  );
}

export type DisplayWindow = {
  recent: DisplayInterval;
  upcoming: DisplayInterval;
  ready: boolean;
  windowDays: number;
  identity: string;
};
const DisplayContext = createContext<DisplayWindow | null>(null);

export function useDisplayWindow(): DisplayWindow {
  const context = useContext(DisplayContext);
  return (
    context ?? {
      ...displayIntervals(30),
      ready: true,
      windowDays: 30,
      identity: `standalone:${localDay(new Date())}:30`,
    }
  );
}

function useCalendarClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const update = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      const midnight = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + 1,
      );
      timer = window.setTimeout(
        update,
        midnight.getTime() - current.getTime() + 25,
      );
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return now;
}

export function DisplayWindowProvider({
  api,
  userId,
  children,
  requirePreferences = true,
}: {
  api: ApiClient;
  userId: string;
  children: ReactNode;
  requirePreferences?: boolean;
}) {
  const cache = useQueryClient();
  const now = useCalendarClock();
  const [initialized, setInitialized] = useState(false);
  const preferences = useQuery({
    queryKey: ["private", "display-preferences", userId],
    queryFn: ({ signal }) =>
      api.request(displayRoutes.preferences, displayPreferencesSchema, {
        signal,
      }),
    enabled: initialized,
    staleTime: Infinity,
  });
  // A different signed-in account must never see the previous account's sources.
  // The shell keys this provider by account/session, so children also lose drafts/tabs.
  useLayoutEffect(() => {
    void cache.cancelQueries({ queryKey: ["private"] });
    cache.removeQueries({ queryKey: ["private"] });
    setInitialized(true);
  }, [cache, userId]);
  const windowDays = preferences.data?.windowDays ?? 30;
  const day = localDay(now);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const intervals = useMemo(
    () => displayIntervals(windowDays, now),
    [windowDays, now],
  );
  const identity = `${userId}:${windowDays}:${day}:${zone}`;
  useEffect(() => {
    // New range keys fetch fresh pages; discard inactive old list cursors so
    // revisiting a saved range cannot revive an obsolete source/date snapshot.
    cache.removeQueries({
      type: "inactive",
      predicate: (query) =>
        query.queryKey[0] === "private" &&
        (["inbox", "tasks", "calendar"].includes(String(query.queryKey[1])) ||
          (query.queryKey[1] === "canvas" && query.queryKey[2] === "items")),
    });
  }, [cache, identity]);
  return (
    <DisplayContext.Provider
      value={{
        ...intervals,
        ready: Boolean(preferences.data),
        windowDays,
        identity,
      }}
    >
      <section
        className="display-window surface"
        aria-labelledby="display-window-heading"
      >
        <div>
          <h2 id="display-window-heading">Display window</h2>
          <p className="section-note">
            One saved setting for all sources. Display only: no data deletion or
            extra imports.
          </p>
        </div>
        {preferences.isPending && (
          <p role="status">Loading saved display window…</p>
        )}
        <ErrorNotice error={preferences.error} />
        {preferences.isError && (
          <button
            className="secondary"
            onClick={() => void preferences.refetch()}
          >
            Retry display preferences
          </button>
        )}
        {preferences.data && (
          <DisplayWindowPicker
            key={windowDays}
            api={api}
            userId={userId}
            windowDays={windowDays}
          />
        )}
      </section>
      {(preferences.data || !requirePreferences) && children}
    </DisplayContext.Provider>
  );
}

function DisplayWindowPicker({
  api,
  userId,
  windowDays,
}: {
  api: ApiClient;
  userId: string;
  windowDays: number;
}) {
  const cache = useQueryClient();
  const action = useAction();
  const [choice, setChoice] = useState(
    windowDays === 7 || windowDays === 30 ? String(windowDays) : "custom",
  );
  const [custom, setCustom] = useState(String(windowDays));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          const value = choice === "custom" ? custom.trim() : choice;
          if (!/^\d+$/.test(value))
            throw new RequestError(
              "Choose a whole number of days from 1 to 365.",
            );
          const parsed = displayPreferencesSchema.safeParse({
            windowDays: Number(value),
          });
          if (!parsed.success)
            throw new RequestError(
              "Choose a whole number of days from 1 to 365.",
            );
          const saved = await api.request(
            displayRoutes.preferences,
            displayPreferencesSchema,
            { method: "PUT", body: parsed.data },
          );
          cache.setQueryData(["private", "display-preferences", userId], saved);
        }, "Display window saved.");
      }}
    >
      <fieldset disabled={action.pending} className="display-window-fields">
        <legend>Saved: {windowDays} days, including today</legend>
        <label>
          Display days
          <select
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {choice === "custom" && (
          <label>
            Custom days (1–365)
            <input
              type="number"
              min="1"
              max="365"
              step="1"
              required
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
          </label>
        )}
        <button type="submit">Apply display window</button>
      </fieldset>
      <ActionNotice action={action} />
    </form>
  );
}

export function DisplayRange({
  direction,
}: {
  direction: "recent" | "upcoming";
}) {
  const display = useDisplayWindow();
  const interval = display[direction];
  const end = new Date(`${interval.endDate}T00:00:00`);
  end.setDate(end.getDate() - 1);
  return (
    <p className="display-range">
      {direction === "recent"
        ? "Gmail received"
        : "Tasks due / Canvas and Calendar dates"}
      : {interval.startDate} through {localDay(end)} (inclusive),{" "}
      {display.windowDays} local calendar days including today. Timezone:{" "}
      {Intl.DateTimeFormat().resolvedOptions().timeZone}.{" "}
      {direction === "upcoming" &&
        "Events overlapping this interval are included; undated work is separate."}
    </p>
  );
}
