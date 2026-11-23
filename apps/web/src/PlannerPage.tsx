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
  DisplayRange,
  useDisplayWindow,
  windowQuery,
  withinWindow,
} from "./display-window";
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
  plannerOccursOnDay,
  plannerSortTime,
  type PlannerItem,
  type PlannerSource,
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
  const { ready, recent, upcoming, identity } = useDisplayWindow();
  const [source, setSource] = useState<PlannerSource>("all");
  const [showAllEmails, setShowAllEmails] = useState(false);
  const showGmail = source === "all" || source === "gmail";
  const showTasks = showGmail || source === "manual";
  const showCalendar = source === "all" || source === "calendar";
  const showCanvas = source === "all" || source === "canvas";
  const today = upcoming.startDate;
  const todayDate = new Date(`${today}T12:00:00`);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(today);
  const [watch, setWatch] = useState(0);
  useEffect(() => {
    setWeekOffset(0);
    setSelectedDay(today);
  }, [identity, today]);
  const mail = useInfiniteQuery({
    queryKey: ["private", "inbox", "recent", recent, source],
    enabled: ready && showGmail,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `${apiRoutes.inbox}?limit=100&dateField=received&${windowQuery(recent)}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        inboxResponseSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const proposals = useInfiniteQuery({
    queryKey: ["private", "inbox", "proposals", upcoming, source],
    enabled: ready && showGmail,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `${apiRoutes.inbox}?limit=100&dateField=suggestionDue&reviewState=Proposed&includeUndated=true&${windowQuery(upcoming)}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        inboxResponseSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const tasks = useInfiniteQuery({
    queryKey: ["private", "tasks", upcoming, source],
    enabled: ready && showTasks,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `${apiRoutes.tasks}?limit=100&includeUndated=true&${windowQuery(upcoming)}${source === "gmail" || source === "manual" ? `&source=${source}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        tasksResponseSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const calendar = useQuery({
    queryKey: ["private", "calendar", upcoming, source],
    enabled: ready && connected && showCalendar,
    queryFn: ({ signal }) =>
      api.request(
        `${apiRoutes.upcoming}?${windowQuery(upcoming)}`,
        upcomingCalendarResponseSchema,
        { signal },
      ),
  });
  const canvasConnection = useQuery({
    queryKey: ["private", "canvas", "connection"],
    queryFn: ({ signal }) =>
      api.request(canvasRoutes.connection, canvasConnectionSchema, { signal }),
  });
  const canvas = useInfiniteQuery({
    queryKey: ["private", "canvas", "items", upcoming, source],
    enabled: ready && showCanvas && canvasConnection.data?.connected === true,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `${canvasRoutes.items}?limit=100&${windowQuery(upcoming)}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
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
  const proposalEmails =
    proposals.data?.pages
      .flatMap((page) => page.items)
      .map((email) => ({
        ...email,
        suggestions: email.suggestions.filter(
          (suggestion) =>
            suggestion.dueAt === null ||
            withinWindow(suggestion.dueAt, upcoming),
        ),
      })) ?? [];
  const savedTasks = (
    tasks.data?.pages.flatMap((page) => page.items) ?? []
  ).filter((task) => task.dueAt === null || withinWindow(task.dueAt, upcoming));
  const canvasItems = canvasConnection.data?.connected
    ? (canvas.data?.pages.flatMap((page) => page.items) ?? [])
    : [];
  const entries = plannerItems(
    proposalEmails,
    savedTasks,
    calendar.data?.items ?? [],
    canvasItems,
    source,
  );
  const undated = entries.filter(needsDate);
  const reviews = entries.filter((item) => item.kind === "suggestion");
  const weekStart = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate() - ((todayDate.getDay() + 6) % 7) + weekOffset * 7,
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
  const selectedEntries =
    selectedDay >= upcoming.startDate && selectedDay < upcoming.endDate
      ? scheduled.filter((item) => plannerOccursOnDay(item, selectedDay))
      : [];
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
  const more =
    (showGmail && (mail.hasNextPage || proposals.hasNextPage)) ||
    (showTasks && tasks.hasNextPage) ||
    (showCanvas && canvas.hasNextPage);
  const loaded = Boolean(
    ready &&
    (!showGmail || (mail.data && proposals.data)) &&
    (!showTasks || tasks.data) &&
    (!showCalendar || !connected || calendar.data) &&
    (!showCanvas ||
      (canvasConnection.data &&
        (!canvasConnection.data.connected || canvas.data))),
  );
  const refreshing =
    (showGmail && (mail.isFetching || proposals.isFetching)) ||
    (showTasks && tasks.isFetching) ||
    (showCalendar && connected && calendar.isFetching) ||
    canvasConnection.isFetching ||
    (showCanvas && canvas.isFetching);
  const loading =
    (showGmail && (mail.isLoading || proposals.isLoading)) ||
    (showTasks && tasks.isLoading) ||
    (showCalendar && connected && calendar.isLoading) ||
    (showCanvas && (canvasConnection.isLoading || canvas.isLoading));
  const sourceFailed = Boolean(
    (showGmail && (mail.error || proposals.error)) ||
    (showTasks && tasks.error) ||
    (showCalendar && connected && (calendar.error || calendarError)) ||
    (showCanvas &&
      (canvasConnection.error || canvasConnection.data?.error || canvas.error)),
  );
  const selectedOutsideWindow =
    selectedDay < upcoming.startDate || selectedDay >= upcoming.endDate;
  function changeWeek(offset: number) {
    setWeekOffset(offset);
    const start = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate() - ((todayDate.getDay() + 6) % 7) + offset * 7,
    );
    setSelectedDay(plannerDay(start.toISOString())!);
  }
  return (
    <section aria-labelledby="planner-heading">
      <div className="page-heading planner-heading">
        <time
          className="planner-date"
          dateTime={today}
          aria-label={`Today, ${todayDate.toLocaleDateString(undefined, { dateStyle: "full" })}`}
        >
          <span>
            {todayDate.toLocaleDateString(undefined, { month: "short" })}
          </span>
          <strong>{todayDate.getDate()}</strong>
          <span>
            {todayDate.toLocaleDateString(undefined, { weekday: "short" })}
          </span>
        </time>
        <div className="planner-heading-copy">
          <h1 id="planner-heading">Planner</h1>
          <p className="subtitle">
            Review proposals, manage tasks, and check source dates.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="secondary"
            disabled={!ready || refreshing}
            onClick={() => {
              if (showGmail) {
                void mail.refetch();
                void proposals.refetch();
              }
              if (showTasks) void tasks.refetch();
              if (connected && showCalendar) void calendar.refetch();
              void canvasConnection.refetch();
              if (showCanvas && canvasConnection.data?.connected)
                void canvas.refetch();
            }}
          >
            Refresh plan
          </button>
          <button className="planner-create" onClick={() => openTask()}>
            + New task
          </button>
        </div>
      </div>
      <div className="source-tabs" role="group" aria-label="Planner sources">
        {(
          [
            ["all", "All"],
            ["gmail", "Gmail"],
            ["canvas", "Canvas"],
            ["calendar", "Google Calendar"],
            ["manual", "Manual tasks"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className="secondary small"
            aria-pressed={source === value}
            onClick={() => setSource(value)}
          >
            {label}
          </button>
        ))}
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
                    ? `${emails.length} source ${emails.length === 1 ? "message" : "messages"} loaded`
                    : "No source messages loaded yet"}
        </span>
        <span className="status-divider" />
        <span>
          Canvas:{" "}
          {!canvasConnection.data && canvasConnection.isError
            ? "Connection status unavailable"
            : canvasConnectionLabel(canvasConnection.data)}
        </span>
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
      <ErrorNotice error={showGmail ? mail.error : null} />
      <ErrorNotice error={showGmail ? proposals.error : null} />
      <ErrorNotice error={showTasks ? tasks.error : null} />
      <ErrorNotice error={run.error} />
      <ErrorNotice error={showCalendar ? calendar.error : null} />
      <ErrorNotice
        error={
          showCalendar && calendarError
            ? new RequestError(
                calendarError.message,
                calendarError.code,
                calendarError.requestId,
              )
            : null
        }
      />
      <ErrorNotice error={canvasError(canvasConnection.error)} />
      <ErrorNotice error={showCanvas ? canvasError(canvas.error) : null} />
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
      {sourceFailed && (
        <p className="inline-note" role="status">
          Some sources could not be refreshed. Available last-success data is
          still shown; this plan may be incomplete or out of date. Use Refresh
          plan to retry reads. Canvas feed imports must be retried in
          Connections.
        </p>
      )}
      <div className="planner-metrics">
        <span>
          <strong>{loaded ? overdue : "—"}</strong> overdue tasks
        </span>
        <span>
          <strong>{loaded ? reviews.length : "—"}</strong> loaded{" "}
          {reviews.length === 1 ? "proposal" : "proposals"} needing review
        </span>
        <span>
          <strong>{loaded ? undated.length : "—"}</strong> loaded undated items
          (outside dated counts)
        </span>
        <span>
          <strong>
            {loaded
              ? entries.filter(
                  (item) =>
                    item.kind === "task" &&
                    item.task.status === "Waiting for Reply",
                ).length
              : "—"}
          </strong>{" "}
          waiting for reply
        </span>
      </div>
      <DisplayRange direction="upcoming" />
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
                setSelectedDay(today);
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
            const items =
              key >= upcoming.startDate && key < upcoming.endDate
                ? scheduled.filter((item) => plannerOccursOnDay(item, key))
                : [];
            return (
              <button
                key={key}
                className={`week-day ${selectedDay === key ? "selected" : ""} ${today === key ? "is-today" : ""}`}
                aria-pressed={selectedDay === key}
                aria-current={today === key ? "date" : undefined}
                aria-label={`${day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, ${items.length} loaded ${items.length === 1 ? "item" : "items"}`}
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
                <span className="day-source-marks" aria-hidden="true">
                  {(["task", "suggestion", "event", "canvas"] as const).map(
                    (kind) =>
                      items.some((item) => item.kind === kind) && (
                        <i key={kind} className={`day-source-mark ${kind}`} />
                      ),
                  )}
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
              {selectedEntries.length} loaded{" "}
              {selectedEntries.length === 1 ? "item" : "items"}
            </span>
          </div>
          {!loaded && loading && (
            <p role="status" className="empty-small">
              Loading your saved plan…
            </p>
          )}
          {selectedOutsideWindow ? (
            <p className="empty-small">
              This day is outside the saved display window. Choose Today or
              change the display window to see matching dates.
            </p>
          ) : (
            loaded &&
            !sourceFailed &&
            selectedEntries.length === 0 && (
              <p className="empty-small">
                No dated items for this day in the loaded plan.
                {more
                  ? " More source pages are available below."
                  : " See What’s next or Needs a date below."}
              </p>
            )
          )}
          <div
            className="planner-scroll"
            role="region"
            aria-label="Selected day items"
            tabIndex={selectedEntries.length ? 0 : undefined}
          >
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
        </div>
      </section>
      <div className="planner-bottom">
        <section className="surface" aria-labelledby="next-heading">
          <div className="section-heading">
            <h2 id="next-heading">What’s next</h2>
            <span className="count-label">By actual date</span>
          </div>
          <p className="section-note">
            Upcoming dates in the saved display window. Suggested dates remain
            unconfirmed. Events overlapping the window retain their source start
            time.
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
          <div
            className="planner-scroll"
            role="region"
            aria-label="Upcoming loaded items"
            tabIndex={scheduled.length ? 0 : undefined}
          >
            {scheduled.map((item) => (
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
        <section className="surface" aria-labelledby="needs-date-heading">
          <div className="section-heading">
            <h2 id="needs-date-heading">Needs a date</h2>
            <span className="pill neutral">{undated.length}</span>
          </div>
          <p className="section-note">
            Undated work is separate from the dated window and its counts.
            Choose a date only when you know it.
          </p>
          {undated.length === 0 && loaded && (
            <p className="empty-small">
              No undated items in the loaded plan. Canvas does not supply all
              undated coursework through its calendar feed.
            </p>
          )}
          <div
            className="planner-scroll"
            role="region"
            aria-label="Undated loaded items"
            tabIndex={undated.length ? 0 : undefined}
          >
            {undated.map((item) => (
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
      </div>
      {showGmail && (
        <section className="surface" aria-labelledby="recent-mail-heading">
          <h2 id="recent-mail-heading">Recent Gmail emails</h2>
          <DisplayRange direction="recent" />
          <p className="section-note">
            {emails.length} emails loaded
            {mail.hasNextPage ? "; more available" : ""}. Receipt dates are not
            deadlines. Reading email does not require AI.
          </p>
          {mail.isPending && <p role="status">Loading recent emails…</p>}
          {mail.data && emails.length === 0 && (
            <p>No saved emails in this recent window.</p>
          )}
          <div
            className="planner-scroll"
            role="region"
            aria-label="Loaded recent emails"
            tabIndex={emails.length ? 0 : undefined}
          >
            {(showAllEmails ? emails : emails.slice(0, 5)).map((email) => (
              <article className="planner-row" key={email.id}>
                <h3>{email.subject || "Untitled email"}</h3>
                <p>
                  {email.sender} · Received {displayDate(email.receivedAt)}
                </p>
                <button
                  className="text-button"
                  data-source-email={email.id}
                  onClick={() => openEmail(email.id)}
                >
                  {"Open email & source →"}
                </button>
              </article>
            ))}
          </div>
          {emails.length > 5 && (
            <div className="actions">
              <p className="section-note" role="status">
                Showing {showAllEmails ? emails.length : 5} of {emails.length}{" "}
                loaded emails.
              </p>
              <button
                className="secondary small"
                aria-expanded={showAllEmails}
                onClick={() => setShowAllEmails((value) => !value)}
              >
                {showAllEmails
                  ? "Show recent email preview"
                  : "Show all loaded emails"}
              </button>
            </div>
          )}
          <p className="hint">
            Last successful Gmail import:{" "}
            {displayDate(
              mail.data?.pages[0]?.dataState.lastSuccessfulSyncAt ?? null,
            )}
            .
          </p>
        </section>
      )}
      <div className="loaded-boundary">
        <p>
          {scheduled.length} dated planner entries loaded for the selected
          source; {undated.length} undated entries loaded separately. These are
          loaded counts, not source-wide totals; total matching counts are not
          supplied by these APIs.{" "}
          {!loaded || sourceFailed
            ? "Source coverage is incomplete or not current; successful data remains visible."
            : more
              ? "This is a partial plan; load more sources to include their dates."
              : "All returned pages are loaded; Calendar remains a provider-bounded snapshot."}
          {showCalendar && (
            <>
              {" "}
              Last Calendar fetch:{" "}
              {displayDate(calendar.data?.lastSuccessfulFetchAt ?? null)}.
            </>
          )}
        </p>
        <p>
          {showCanvas &&
            (canvasConnection.data?.connected
              ? `${canvasItems.length} window-matching Canvas entries loaded; ${canvasConnection.data.itemCount} total imported across all dates. Cancelled entries are excluded from the plan.`
              : canvasConnection.data
                ? "No Canvas calendar feed is connected."
                : "Canvas connection status is not yet available.")}{" "}
          Canvas feed coverage does not include all undated work, grades,
          submissions or completion status.
        </p>
        <div className="actions">
          {showGmail && mail.hasNextPage && (
            <button
              className="secondary small"
              disabled={mail.isFetchingNextPage}
              onClick={() => void mail.fetchNextPage()}
            >
              Load more source emails
            </button>
          )}
          {showGmail && proposals.hasNextPage && (
            <button
              className="secondary small"
              disabled={proposals.isFetchingNextPage}
              onClick={() => void proposals.fetchNextPage()}
            >
              Load more proposal emails
            </button>
          )}
          {showTasks && tasks.hasNextPage && (
            <button
              className="secondary small"
              disabled={tasks.isFetchingNextPage}
              onClick={() => void tasks.fetchNextPage()}
            >
              Load more tasks
            </button>
          )}
          {showCanvas && canvas.hasNextPage && (
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
          Calendar times are scheduled events, not inferred deadlines. In All,
          linked Google events are combined with their task; the Google Calendar
          source shows events independently. Completed tasks are excluded.
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
            data-source-email={item.source.id}
            onClick={() => openEmail(item.source.id)}
          >
            {"Review source & actions →"}
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
                data-source-email={item.task.sourceEmailId}
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
