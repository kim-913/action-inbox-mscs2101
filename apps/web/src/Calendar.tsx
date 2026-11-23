import { useQuery } from "@tanstack/react-query";
import {
  apiRoutes,
  upcomingCalendarResponseSchema,
} from "@action-inbox/contracts";
import { type ApiClient, RequestError, safeExternalLink } from "./api/client";
import { ErrorNotice, displayDate } from "./ui";
import { DisplayRange, useDisplayWindow, windowQuery } from "./display-window";

export function Calendar({ api }: { api: ApiClient }) {
  const { ready, upcoming, identity } = useDisplayWindow();
  const calendar = useQuery({
    queryKey: ["private", "calendar", "items", identity, upcoming, "google"],
    enabled: ready,
    queryFn: ({ signal }) =>
      api.request(
        `${apiRoutes.upcoming}?${windowQuery(upcoming)}`,
        upcomingCalendarResponseSchema,
        { signal },
      ),
  });
  const providerError = calendar.data?.error;
  return (
    <section className="page-calendar">
      <div className="page-heading calendar-page-heading">
        <div>
          <span className="pill event">Google Calendar · read only</span>
          <h1>Upcoming Google Calendar events</h1>
          <DisplayRange direction="upcoming" />
        </div>
        <button
          className="secondary"
          onClick={() => void calendar.refetch()}
          disabled={!ready || calendar.isFetching}
        >
          {calendar.isFetching ? "Refreshing…" : "Refresh calendar"}
        </button>
      </div>
      <div className="calendar-context">
        <p>
          Events are created only from an approved or manual task with your
          explicit confirmation in Tasks.
        </p>
        <p className="section-note">
          Bounded provider snapshot: at most 100 Google Calendar events. This is
          not a complete calendar history; events overlapping the selected
          window are shown, including all-day events in their source dates.
        </p>
      </div>
      <ErrorNotice error={calendar.error} />
      <ErrorNotice
        error={
          providerError
            ? new RequestError(
                providerError.message,
                providerError.code,
                providerError.requestId,
              )
            : null
        }
      />
      {(calendar.error || providerError) && (
        <p>
          Showing the last successful calendar data if available. Refresh to
          retry; existing events have not been discarded.
        </p>
      )}
      <p className="calendar-freshness">
        Last successful fetch:{" "}
        {displayDate(calendar.data?.lastSuccessfulFetchAt ?? null)}
      </p>
      {calendar.isPending && (
        <p className="loading-state" role="status">
          Loading calendar…
        </p>
      )}
      {calendar.data?.items.length === 0 && (
        <p className="empty-state">
          No events overlap this window in the available provider snapshot.
        </p>
      )}
      {calendar.data?.items.map((event) => {
        const external = safeExternalLink(event.htmlLink);
        return (
          <article className="panel calendar-event" key={event.id}>
            <span className="pill event">
              {event.allDay ? "All-day event" : "Timed event"}
            </span>
            <h2>{event.title || "(Untitled event)"}</h2>
            <p>
              {event.allDay
                ? `All day: ${event.start} through ${event.end} (end exclusive)`
                : `${displayDate(event.start)} – ${displayDate(event.end)}`}
            </p>
            {external && (
              <a href={external} target="_blank" rel="noreferrer">
                Open in Google Calendar
              </a>
            )}
          </article>
        );
      })}
    </section>
  );
}
