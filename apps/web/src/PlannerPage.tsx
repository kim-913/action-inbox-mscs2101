import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  apiRoutes,
  canvasConnectionSchema,
  canvasItemsResponseSchema,
  canvasRoutes,
  inboxResponseSchema,
  syncRunSchema,
  tasksResponseSchema,
  upcomingCalendarResponseSchema,
} from "@action-inbox/contracts";
import {
  type ApiClient,
  RequestError,
  route,
  safeExternalLink,
} from "./api/client";
import { ErrorNotice, displayDate, useNow } from "./ui";
import { dueUrgency } from "./urgency";
import {
  CanvasSourceDetails,
  canvasError,
  canvasConnectionLabel,
} from "./CanvasFeed";
import {
  needsDate,
  plannerDates,
  plannerDay,
  plannerItems,
  plannerSortTime,
  type PlannerItem,
} from "./planner-model";

export function Planner({
  api,
  connected,
  openEmail,
  openTask,
  openInbox,
  openConnections,
}: {
  api: ApiClient;
  connected: boolean;
  openEmail: (id: string) => void;
  openTask: (id?: string) => void;
  openInbox: () => void;
  openConnections: () => void;
}) {
  const cache = useQueryClient();
  const now = useNow();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(() =>
    plannerDay(new Date().toISOString())!,
  );
  const [watch, setWatch] = useState(0);
  const mail = useInfiniteQuery({
    queryKey: ["private", "inbox"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `${apiRoutes.inbox}?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        inboxResponseSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const tasks = useInfiniteQuery({
    queryKey: ["private", "tasks"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `${apiRoutes.tasks}?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        tasksResponseSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const calendar = useQuery({
    queryKey: ["private", "calendar"],
    enabled: connected,
    queryFn: ({ signal }) =>
      api.request(apiRoutes.upcoming, upcomingCalendarResponseSchema, {
        signal,
      }),
  });
  const canvasConnection = useQuery({
    queryKey: ["private", "canvas", "connection"],
    queryFn: ({ signal }) =>
      api.request(canvasRoutes.connection, canvasConnectionSchema, { signal }),
  });
  const canvas = useInfiniteQuery({
    queryKey: ["private", "canvas", "items"],
    enabled: canvasConnection.data?.connected === true,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `${canvasRoutes.items}?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        canvasItemsResponseSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const latest = mail.data?.pages[0]?.dataState.latestSyncRun;
  const run = useQuery({
    queryKey: ["private", "sync", latest?.id, watch],
    enabled: Boolean(latest?.id),
    queryFn: ({ signal }) =>
      api.request(route(apiRoutes.syncRun, latest!.id), syncRunSchema, {
        signal,
      }),
    refetchInterval: (query) =>
      !query.state.error &&
      query.state.dataUpdateCount < 60 &&
      ["Queued", "Running"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
  });
  const observed = run.data ?? latest;
  const running =
    observed?.status === "Queued" || observed?.status === "Running";
  const checkedAt = run.dataUpdatedAt;
  const paused =
    running &&
    (run.isError ||
      (cache.getQueryState(["private", "sync", latest?.id, watch])
        ?.dataUpdateCount ?? 0) >= 60);
  useEffect(() => {
    if (run.data)
      void cache.invalidateQueries({ queryKey: ["private", "inbox"] });
  }, [
    run.data?.id,
    run.data?.status,
    run.data?.importedCount,
    run.data?.processedCount,
    cache,
  ]);
  const emails = mail.data?.pages.flatMap((page) => page.items) ?? [];
  const savedTasks = tasks.data?.pages.flatMap((page) => page.items) ?? [];
  const canvasItems = canvasConnection.data?.connected
    ? (canvas.data?.pages.flatMap((page) => page.items) ?? [])
    : [];
  const entries = plannerItems(
    emails,
    savedTasks,
    calendar.data?.items ?? [],
    canvasItems,
  );
  const undated = entries.filter(needsDate);
  const reviews = entries.filter((item) => item.kind === "suggestion");
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7,
  );
  const days = Array.from(
    { length: 7 },
    (_, offset) =>
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + offset,
      ),
  );
  const datesByKey = new Map(
    entries.map((item) => [item.key, plannerDates(item)]),
  );
  const scheduled = entries
    .filter((item) =>
      plannerDates(item).some(
        (date) => plannerDay(date.at, date.allDay) !== null,
      ),
    )
    .sort(
      (a, b) =>
        Math.min(...plannerDates(a).map(plannerSortTime)) -
        Math.min(...plannerDates(b).map(plannerSortTime)),
    );
  const selectedEntries = scheduled.filter((item) =>
    datesByKey
      .get(item.key)
      ?.some((date) => plannerDay(date.at, date.allDay) === selectedDay),
  );
  const overdue = entries.filter(
    (item) =>
      item.kind === "task" &&
      dueUrgency(item.task.dueAt, now).label === "Overdue",
  ).length;
  const extractionUnavailable =
    observed?.error?.code === "PROVIDER_NOT_CONFIGURED" ||
    emails.some(
      (email) => email.extractionError?.code === "PROVIDER_NOT_CONFIGURED",
    );
  const calendarError = calendar.data?.error;
  const more = mail.hasNextPage || tasks.hasNextPage || canvas.hasNextPage;
  const loaded = Boolean(
    mail.data &&
    tasks.data &&
    canvasConnection.data &&
    (!canvasConnection.data.connected || canvas.data),
  );
  function changeWeek(offset: number) {
    setWeekOffset(offset);
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - ((now.getDay() + 6) % 7) + offset * 7,
    );
    setSelectedDay(plannerDay(start.toISOString())!);
  }
  return (
    <section aria-labelledby="planner-heading">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dates, details, next steps</p>
          <h1 id="planner-heading">Planner</h1>
          <p className="subtitle">
            A connected plan. Review suggested dates; keep approved work moving.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="secondary"
            disabled={mail.isFetching || tasks.isFetching}
            onClick={() => {
              void mail.refetch();
              void tasks.refetch();
              if (connected) void calendar.refetch();
              void canvasConnection.refetch();
              if (canvasConnection.data?.connected) void canvas.refetch();
            }}
          >
            Refresh plan
          </button>
          <button onClick={() => openTask()}>+ New task</button>
        </div>
      </div>
      <div className="planner-status">
        <span
          className={`status-dot ${connected ? "connected" : "attention"}`}
          aria-hidden="true"
        />
        <span>{connected ? "Google connected" : "No Google connection"}</span>
        <span className="status-divider" />
        <span>
          {extractionUnavailable
            ? "Automatic suggestions unavailable"
            : paused
              ? "Import progress checks paused"
              : running
                ? "Import in progress"
                : observed?.status === "Failed"
                  ? "Last import needs attention"
                  : emails.length
                    ? `${emails.length} source messages loaded`
                    : "No source messages loaded yet"}
        </span>
        <span className="status-divider" />
        <span>Canvas: {canvasConnectionLabel(canvasConnection.data)}</span>
        <button className="text-button" onClick={openConnections}>
          Connections
        </button>
      </div>
      {(extractionUnavailable || !connected) && (
        <p className="inline-note">
          {!connected
            ? "Connect Google once to begin importing supported sources. External Calendar creation still requires your confirmation."
            : "Your account is connected and imported email is readable. Automatic extraction is not configured, so we have not invented any dates or actions. You can still add tasks yourself."}{" "}
          <button
            className="text-button"
            onClick={
              connected && extractionUnavailable ? openInbox : openConnections
            }
          >
            {connected && extractionUnavailable
              ? "Read imported sources"
              : "Manage connection"}
          </button>
        </p>
      )}
      {observed && (running || observed.status === "Failed") && (
        <details className="diagnostics planner-diagnostics">
          <summary>
            {paused ? "Progress checks paused" : "Import status"} ·{" "}
            {observed.importedCount} imported · {observed.processedCount}{" "}
            processed
          </summary>
          <p>
            Last known status: {observed.status}
            {checkedAt
              ? ` · Checked ${displayDate(new Date(checkedAt).toISOString())}`
              : ""}
            . Read-only checks stop after 60 updates or a connection error.
          </p>
          {observed.error && (
            <p>
              {observed.error.message} · Request: {observed.error.requestId}
            </p>
          )}
          <button
            className="secondary small"
            onClick={() => setWatch((value) => value + 1)}
          >
            Check import progress
          </button>
        </details>
      )}
      <ErrorNotice error={mail.error} />
      <ErrorNotice error={tasks.error} />
      <ErrorNotice error={run.error} />
      <ErrorNotice error={calendar.error} />
      <ErrorNotice
        error={
          calendarError
            ? new RequestError(
                calendarError.message,
                calendarError.code,
                calendarError.requestId,
              )
            : null
        }
      />
      <ErrorNotice error={canvasError(canvasConnection.error)} />
      <ErrorNotice error={canvasError(canvas.error)} />
      {canvasConnection.data?.error && (
        <ErrorNotice
          error={canvasError(
            new RequestError(
              "Canvas refresh failed.",
              canvasConnection.data.error.code,
              canvasConnection.data.error.requestId,
            ),
          )}
        />
      )}
      {canvasConnection.data?.connected && (
        <p className="inline-note">
          Canvas dates are native feed data; they do not require AI. Refresh is
          manual in{" "}
          <button className="text-button" onClick={openConnections}>
            Connections
          </button>
          . Last successful Canvas import:{" "}
          {displayDate(canvasConnection.data.lastSuccessfulFetchAt)}.
        </p>
      )}
      <div className="planner-metrics">
        <span>
          <strong>{loaded ? overdue : "—"}</strong> overdue tasks
        </span>
        <span>
          <strong>{mail.data ? reviews.length : "—"}</strong> need review
        </span>
        <span>
          <strong>{loaded ? undated.length : "—"}</strong> need a date
        </span>
        <span>
          <strong>
            {tasks.data
              ? savedTasks.filter((task) => task.status === "Waiting for Reply")
                  .length
              : "—"}
          </strong>{" "}
          waiting for reply
        </span>
      </div>
      <section
        className="surface week-calendar"
        aria-labelledby="calendar-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="calendar-heading">
              {weekStart.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <p className="section-note">
              Internal planner · dates from loaded items, not new Google events
            </p>
          </div>
          <div className="week-controls">
            <button
              className="secondary small"
              aria-label="Previous week"
              onClick={() => changeWeek(weekOffset - 1)}
            >
              ←
            </button>
            <button
              className="secondary small"
              onClick={() => {
                setWeekOffset(0);
                setSelectedDay(plannerDay(now.toISOString())!);
              }}
            >
              Today
            </button>
            <button
              className="secondary small"
              aria-label="Next week"
              onClick={() => changeWeek(weekOffset + 1)}
            >
              →
            </button>
          </div>
        </div>
        <div className="calendar-legend">
          <span>
            <i className="legend-task" />
            Task deadline
          </span>
          <span>
            <i className="legend-suggestion" />
            Needs review
          </span>
          <span>
            <i className="legend-event" />
            Google Calendar time
          </span>
          <span>
            <i className="legend-canvas" />
            Canvas native dates
          </span>
        </div>
        <div className="week-grid">
          {days.map((day) => {
            const key = plannerDay(day.toISOString())!;
            const items = scheduled.filter((item) =>
              datesByKey
                .get(item.key)
                ?.some((date) => plannerDay(date.at, date.allDay) === key),
            );
            return (
              <button
                key={key}
                className={`week-day ${selectedDay === key ? "selected" : ""} ${plannerDay(now.toISOString()) === key ? "is-today" : ""}`}
                aria-pressed={selectedDay === key}
                aria-label={`${day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, ${items.length} loaded items`}
                onClick={() => setSelectedDay(key)}
              >
                <span className="weekday">
                  {day.toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <strong>{day.getDate()}</strong>
                <span className="day-count">
                  {items.length
                    ? `${items.length} item${items.length === 1 ? "" : "s"}`
                    : "—"}
                </span>
                <span className="day-previews">
                  {items.slice(0, 2).map((item) => (
                    <span key={item.key} className={`day-preview ${item.kind}`}>
                      {item.title}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="day-agenda">
          <div className="section-heading">
            <h3>
              {new Date(`${selectedDay}T12:00`).toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </h3>
            <span className="count-label">
              {selectedEntries.length} loaded items
            </span>
          </div>
          {!loaded && (
            <p role="status" className="empty-small">
              Loading your saved plan…
            </p>
          )}
          {loaded && selectedEntries.length === 0 && (
            <p className="empty-small">
              No dated items for this day in the loaded plan.
              {more
                ? " More source pages are available below."
                : " See What’s next or Needs a date below."}
            </p>
          )}
          {selectedEntries.map((item) => (
            <PlannerRow
              key={item.key}
              item={item}
              now={now}
              openEmail={openEmail}
              openTask={openTask}
            />
          ))}
        </div>
      </section>
      <div className="planner-bottom">
        <section className="surface" aria-labelledby="next-heading">
          <div className="section-heading">
            <h2 id="next-heading">What’s next</h2>
            <span className="count-label">By actual date</span>
          </div>
          <p className="section-note">
            Overdue tasks and upcoming dates. Suggested dates remain
            unconfirmed.
          </p>
          {scheduled.length === 0 && loaded && (
            <div className="empty-small">
              <strong>No dated actions in the loaded plan.</strong>
              <p>
                {extractionUnavailable
                  ? "Source emails are ready, but extraction is unavailable. Read a source or create a manual task to get started."
                  : "Review a suggestion or add a task with a date. Events appear only when Calendar returns them."}
              </p>
              <button className="text-button" onClick={openInbox}>
                Open source inbox →
              </button>
            </div>
          )}
          {scheduled.slice(0, 6).map((item) => (
            <PlannerRow
              key={item.key}
              item={item}
              now={now}
              openEmail={openEmail}
              openTask={openTask}
            />
          ))}
          {scheduled.length > 6 && (
            <p className="hint">
              Showing the first 6 dated items. Select a calendar day to see its
              items, or open Tasks for the complete loaded task list.
            </p>
          )}
        </section>
        <section className="surface" aria-labelledby="needs-date-heading">
          <div className="section-heading">
            <h2 id="needs-date-heading">Needs a date</h2>
            <span className="pill neutral">{undated.length}</span>
          </div>
          <p className="section-note">
            No date does not mean low importance. Choose a date only when you
            know it.
          </p>
          {undated.length === 0 && loaded && (
            <p className="empty-small">
              No undated items in the loaded plan. Canvas does not supply all
              undated coursework through its calendar feed.
            </p>
          )}
          {undated.map((item) => (
            <PlannerRow
              key={item.key}
              item={item}
              now={now}
              openEmail={openEmail}
              openTask={openTask}
            />
          ))}
        </section>
      </div>
      <div className="loaded-boundary">
        <p>
          Showing{" "}
          {mail.data
            ? `${emails.length} loaded emails`
            : "source emails not yet loaded"}
          ,{" "}
          {tasks.data
            ? `${savedTasks.length} loaded tasks`
            : "tasks not yet loaded"}
          , and{" "}
          {calendar.data
            ? `${calendar.data.items.length} returned upcoming Calendar events`
            : "Calendar not yet loaded"}
          .{" "}
          {more
            ? "This is a partial plan; load more sources to include their dates."
            : "Calendar is the provider’s bounded upcoming snapshot, not your full historical calendar."}{" "}
          Last Calendar fetch:{" "}
          {displayDate(calendar.data?.lastSuccessfulFetchAt ?? null)}.
        </p>
        <p>
          {canvasConnection.data?.connected
            ? `${canvasItems.length} loaded Canvas entries of ${canvasConnection.data.itemCount} imported. Cancelled entries are excluded from the plan.`
            : canvasConnection.data
              ? "No Canvas calendar feed is connected."
              : "Canvas connection status is not yet available."}{" "}
          Canvas feed coverage does not include all undated work, grades,
          submissions or completion status.
        </p>
        <div className="actions">
          {mail.hasNextPage && (
            <button
              className="secondary small"
              disabled={mail.isFetchingNextPage}
              onClick={() => void mail.fetchNextPage()}
            >
              Load more source emails
            </button>
          )}
          {tasks.hasNextPage && (
            <button
              className="secondary small"
              disabled={tasks.isFetchingNextPage}
              onClick={() => void tasks.fetchNextPage()}
            >
              Load more tasks
            </button>
          )}
          {canvas.hasNextPage && (
            <button
              className="secondary small"
              disabled={canvas.isFetchingNextPage}
              onClick={() => void canvas.fetchNextPage()}
            >
              Load more Canvas entries
            </button>
          )}
        </div>
        <p>
          Urgency uses actual task deadlines in this browser’s timezone.
          Calendar times are scheduled events, not inferred deadlines. Linked
          Google events are combined with their task; both dates remain visible.
          Completed tasks are excluded.
        </p>
      </div>
    </section>
  );
}

function PlannerRow({
  item,
  now,
  openEmail,
  openTask,
}: {
  item: PlannerItem;
  now: Date;
  openEmail: (id: string) => void;
  openTask: (id?: string) => void;
}) {
  const dates = plannerDates(item);
  const urgency =
    item.kind === "task" ? dueUrgency(item.task.dueAt, now) : null;
  const external = safeExternalLink(
    item.kind === "event"
      ? item.event.htmlLink
      : item.kind === "task"
        ? (item.linkedEvent?.htmlLink ?? null)
        : null,
  );
  return (
    <article className={`planner-row ${item.kind}`}>
      <div className="planner-row-heading">
        <span
          className={`pill ${item.kind === "canvas" ? "canvas" : item.kind === "suggestion" ? "review" : item.kind === "event" ? "event" : urgency!.tone}`}
        >
          {item.kind === "canvas"
            ? item.canvas.kind === "Assignment"
              ? "Canvas assignment · native due"
              : "Canvas event · read only"
            : item.kind === "suggestion"
              ? "Needs review"
              : item.kind === "event"
                ? "Google Calendar · read only"
                : urgency!.label}
        </span>
        {item.kind === "task" && item.task.status === "Waiting for Reply" && (
          <span className="category-label">Waiting for reply</span>
        )}
      </div>
      <h3>{item.title}</h3>
      <p className="planner-source">
        {item.kind === "canvas"
          ? "Sofia Canvas · calendar feed"
          : item.kind === "event"
            ? "Scheduled event — not a task deadline"
            : item.kind === "suggestion"
              ? `Gmail · ${item.source.subject || "Source email"}`
              : item.task.sourceEmailId
                ? `Approved task · ${item.source?.subject || "Source email"}`
                : "Manual task · added by you"}
      </p>
      {dates.length ? (
        <div className="planner-dates">
          {dates.map((date, index) => (
            <p key={`${date.meaning}:${index}`}>
              <strong>{date.meaning}:</strong>{" "}
              {date.allDay
                ? `${date.at} · ${item.kind === "canvas" ? "date only; no exact time supplied" : "all day"}`
                : displayDate(date.at)}
            </p>
          ))}
        </div>
      ) : (
        <p className="planner-dates">
          {item.kind === "canvas"
            ? "No date supplied in this feed entry."
            : "No due date set."}
        </p>
      )}
      {item.kind === "suggestion" &&
        item.suggestion.deadlineCertainty === "Uncertain" && (
          <p className="hint">
            Date is uncertain. Check the supporting evidence before choosing a
            deadline.
          </p>
        )}
      {item.kind === "canvas" && (
        <>
          {item.canvas.description && (
            <p className="canvas-preview">{item.canvas.description}</p>
          )}
          <CanvasSourceDetails item={item.canvas} />
        </>
      )}
      <div className="planner-row-actions">
        {item.kind === "suggestion" ? (
          <button
            className="text-button"
            onClick={() => openEmail(item.source.id)}
          >
            Review source & actions →
          </button>
        ) : item.kind === "task" ? (
          <>
            <button
              className="text-button"
              onClick={() => openTask(item.task.id)}
            >
              Open task details →
            </button>
            {item.task.sourceEmailId && (
              <button
                className="text-button"
                onClick={() => openEmail(item.task.sourceEmailId!)}
              >
                Source email
              </button>
            )}
          </>
        ) : null}
        {external && (
          <a href={external} target="_blank" rel="noreferrer">
            View Google event ↗
          </a>
        )}
        {item.kind === "event" && !external && (
          <span className="hint">No external event link was returned.</span>
        )}
      </div>
    </article>
  );
}
