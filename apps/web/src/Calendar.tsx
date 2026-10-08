import { useQuery } from "@tanstack/react-query";
import {
  apiRoutes,
  upcomingCalendarResponseSchema,
} from "@action-inbox/contracts";
import { type ApiClient, RequestError, safeExternalLink } from "./api/client";
import { ErrorNotice, displayDate } from "./ui";

export function Calendar({ api }: { api: ApiClient }) {
  const calendar = useQuery({
    queryKey: ["private", "calendar"],
    queryFn: ({ signal }) =>
      api.request(apiRoutes.upcoming, upcomingCalendarResponseSchema, {
        signal,
      }),
  });
  const providerError = calendar.data?.error;
  return (
    <section>
      <h1>Upcoming Google Calendar events</h1>
      <p>
        Events are created only from an approved or manual task with your
        explicit confirmation in Tasks.
      </p>
      <button
        onClick={() => void calendar.refetch()}
        disabled={calendar.isFetching}
      >
        {calendar.isFetching ? "Refreshing…" : "Refresh calendar"}
      </button>
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
      <p>
        Last successful fetch:{" "}
        {displayDate(calendar.data?.lastSuccessfulFetchAt ?? null)}
      </p>
      {calendar.isPending && <p role="status">Loading calendar…</p>}
      {calendar.data?.items.length === 0 && (
        <p>No upcoming events in the available calendar data.</p>
      )}
      {calendar.data?.items.map((event) => {
        const external = safeExternalLink(event.htmlLink);
        return (
          <article className="panel" key={event.id}>
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
