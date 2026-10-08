import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  canvasConnectionSchema,
  canvasRoutes,
  successResponseSchema,
  type CanvasItem,
  type CanvasConnection,
} from "@action-inbox/contracts";
import { type ApiClient, RequestError } from "./api/client";
import { ActionNotice, ErrorNotice, displayDate, useAction } from "./ui";

const canvasMessages: Record<string, string> = {
  INVALID_REQUEST:
    "Paste the private HTTPS Calendar Feed link from Sofia Canvas. The link is never displayed back to you.",
  CANVAS_FEED_INVALID:
    "Canvas did not return a supported calendar feed. If a subscription is saved, disconnect, then reconnect with a fresh Calendar Feed link from Sofia Canvas.",
  CANVAS_UNAVAILABLE:
    "Canvas could not be refreshed. Any previously imported dates are kept; try refreshing later.",
  CONFLICT:
    "A Canvas feed is already connected or a refresh is in progress. Check connection status before trying again.",
  UNAUTHENTICATED:
    "Your session expired. Sign in again before changing the Canvas connection.",
  CSRF_INVALID:
    "Reload your browser session before changing the Canvas connection.",
};

export function canvasError(error: unknown) {
  if (!error) return null;
  const code = error instanceof RequestError ? error.code : "CLIENT_ERROR";
  return new RequestError(
    canvasMessages[code] ??
      "The Canvas request could not be completed. Check connection status, then retry. A submitted link has been cleared for privacy.",
    code,
    error instanceof RequestError ? error.requestId : undefined,
  );
}

export function canvasConnectionLabel(state: CanvasConnection | undefined) {
  if (!state) return "Checking connection";
  if (!state.connected) return "Not connected";
  if (state.status === "Refreshing") return "Importing";
  if (state.status === "Failed")
    return state.lastSuccessfulFetchAt
      ? "Refresh failed · previous data kept"
      : "Subscription saved · import failed";
  return "Connected · calendar feed only";
}

export function canvasSourceLink(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.origin !== "https://sofia.instructure.com" ||
      url.username ||
      url.password ||
      /\/feeds(?:\/|$)/i.test(decodeURIComponent(url.pathname))
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function CanvasConnectionCard({ api }: { api: ApiClient }) {
  const cache = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const action = useAction();
  const connection = useQuery({
    queryKey: ["private", "canvas", "connection"],
    queryFn: ({ signal }) =>
      api.request(canvasRoutes.connection, canvasConnectionSchema, { signal }),
  });
  const state = connection.data;
  async function saveResult(request: () => Promise<unknown>) {
    try {
      await request();
    } catch (error) {
      throw canvasError(error);
    } finally {
      await cache.invalidateQueries({ queryKey: ["private", "canvas"] });
    }
  }
  const safeAction = { ...action, error: canvasError(action.error) };
  return (
    <article
      className="surface connection-card canvas-connection"
      aria-labelledby="canvas-connection-heading"
    >
      <div className="section-heading">
        <span className={`pill ${state?.connected ? "canvas" : "neutral"}`}>
          {canvasConnectionLabel(state)}
        </span>
        <span className="category-label">Sofia Canvas</span>
      </div>
      <h2 id="canvas-connection-heading">Canvas calendar subscription</h2>
      <p>
        Import the dates included in your Canvas Calendar Feed. This is a
        private, read-only calendar subscription — not Canvas OAuth or full
        course access.
      </p>
      <ul className="capability-list">
        <li>
          <strong>Native dates, no AI required</strong>Recognized assignment due
          dates and calendar event times remain distinct. Date-only entries have
          no invented deadline time.
        </li>
        <li>
          <strong>Feed coverage, not course completion</strong>The feed may
          include multiple Canvas calendars. It omits undated work and does not
          provide grades, submission or completion status.
        </li>
      </ul>
      <ErrorNotice error={canvasError(connection.error)} />
      {state && !state.connected && (
        <form
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            const feedUrl = input.current?.value.trim() ?? "";
            if (input.current) input.current.value = "";
            void action.run(async () => {
              let url: URL;
              try {
                url = new URL(feedUrl);
              } catch {
                throw new RequestError(
                  canvasMessages.INVALID_REQUEST!,
                  "INVALID_REQUEST",
                );
              }
              if (
                url.origin !== "https://sofia.instructure.com" ||
                url.username ||
                url.password
              )
                throw new RequestError(
                  canvasMessages.INVALID_REQUEST!,
                  "INVALID_REQUEST",
                );
              await saveResult(async () => {
                const result = await api.request(
                  canvasRoutes.connection,
                  canvasConnectionSchema,
                  { method: "POST", body: { feedUrl } },
                );
                cache.setQueryData(["private", "canvas", "connection"], result);
                if (result.error || result.status === "Failed")
                  throw new RequestError(
                    "Canvas import failed.",
                    result.error?.code ?? "CANVAS_UNAVAILABLE",
                    result.error?.requestId,
                  );
              });
            }, "Canvas subscription saved. Its reported import status is shown below. No tasks, notifications or Google events were created.");
          }}
        >
          <label htmlFor="canvas-private-feed">
            Private Sofia Canvas Calendar Feed URL
            <input
              ref={input}
              id="canvas-private-feed"
              name="canvasCalendarFeed"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={2048}
              disabled={action.pending}
            />
          </label>
          <p className="hint">
            In Sofia Canvas, open Calendar → Calendar Feed and paste the private
            link directly here. Treat it like a password. It is sent only to
            this app’s API, never placed in browser storage, a page URL or a
            visible status message, and is cleared as soon as you submit.
          </p>
          <button disabled={action.pending}>Connect Canvas calendar</button>
        </form>
      )}
      {state?.connected && (
        <>
          <div className="canvas-connection-status">
            <p>
              <strong>Last reported status:</strong> {state.status} ·{" "}
              {state.itemCount} imported entries
            </p>
            <p>
              <strong>Last successful import:</strong>{" "}
              {displayDate(state.lastSuccessfulFetchAt)}
            </p>
            <p>{state.coverage}</p>
          </div>
          <p className="hint">
            Refresh is manual. Changes in Canvas are not live updates.
            Refreshing this subscription does not create tasks, external
            calendar events or notifications.
          </p>
          <ErrorNotice
            error={
              state.error
                ? canvasError(
                    new RequestError(
                      "Canvas import failed.",
                      state.error.code,
                      state.error.requestId,
                    ),
                  )
                : null
            }
          />
          <div className="actions">
            <button
              disabled={action.pending}
              onClick={() =>
                void action.run(async () => {
                  await saveResult(async () => {
                    const result = await api.request(
                      canvasRoutes.refresh,
                      canvasConnectionSchema,
                      { method: "POST", body: {} },
                    );
                    cache.setQueryData(
                      ["private", "canvas", "connection"],
                      result,
                    );
                    if (result.error || result.status === "Failed")
                      throw new RequestError(
                        "Canvas refresh failed.",
                        result.error?.code ?? "CANVAS_UNAVAILABLE",
                        result.error?.requestId,
                      );
                  });
                }, "Canvas refresh request finished. Check the reported status and last-success time above; no external actions were taken.")
              }
            >
              Refresh Canvas feed
            </button>
            <button
              className="secondary"
              disabled={action.pending}
              onClick={() => setConfirmDisconnect(true)}
            >
              Disconnect Canvas
            </button>
          </div>
        </>
      )}
      <button
        className="text-button"
        disabled={connection.isFetching || action.pending}
        onClick={() => void connection.refetch()}
      >
        Check Canvas connection status
      </button>
      {confirmDisconnect && state?.connected && (
        <section
          className="confirmation"
          aria-label="Confirm Canvas disconnection"
        >
          <h3>Disconnect this Canvas subscription?</h3>
          <p>
            This deletes the stored private feed link and all imported Canvas
            entries from this app. It does not change Canvas, revoke the
            original feed link, or remove your Google connection.
          </p>
          <div className="actions">
            <button
              className="danger secondary"
              disabled={action.pending}
              onClick={() =>
                void action.run(async () => {
                  await saveResult(async () => {
                    await api.request(
                      canvasRoutes.connection,
                      successResponseSchema,
                      { method: "DELETE" },
                    );
                    await cache.cancelQueries({
                      queryKey: ["private", "canvas", "items"],
                    });
                    cache.removeQueries({
                      queryKey: ["private", "canvas", "items"],
                    });
                    setConfirmDisconnect(false);
                  });
                }, "Canvas subscription disconnected. Its imported items were removed from this app.")
              }
            >
              Confirm Canvas disconnect
            </button>
            <button
              className="secondary"
              disabled={action.pending}
              onClick={() => setConfirmDisconnect(false)}
            >
              Keep Canvas connected
            </button>
          </div>
        </section>
      )}
      <ActionNotice action={safeAction} />
    </article>
  );
}

export function CanvasSourceDetails({ item }: { item: CanvasItem }) {
  const source = canvasSourceLink(item.sourceUrl);
  return (
    <details className="canvas-details">
      <summary>Canvas source details</summary>
      <p className="canvas-description">
        {item.description || "No description was supplied by the feed."}
      </p>
      <dl>
        <div>
          <dt>Source</dt>
          <dd>Sofia Canvas · calendar feed only</dd>
        </div>
        <div>
          <dt>Native entry type</dt>
          <dd>
            {item.kind}
            {item.cancelled ? " · Cancelled upstream" : ""}
          </dd>
        </div>
        <div>
          <dt>
            {item.kind === "Assignment"
              ? "Canvas due date"
              : "Canvas event start"}
          </dt>
          <dd>
            {item.start
              ? item.start.kind === "date"
                ? `${item.start.value} · date only; no exact time supplied`
                : displayDate(item.start.value)
              : "No date supplied in this feed entry"}
          </dd>
        </div>
        {item.kind === "Event" && item.end && (
          <div>
            <dt>Event end{item.end.kind === "date" ? " (exclusive)" : ""}</dt>
            <dd>
              {item.end.kind === "date"
                ? item.end.value
                : displayDate(item.end.value)}
            </dd>
          </div>
        )}
        {item.start?.timeZone && (
          <div>
            <dt>Source timezone</dt>
            <dd>
              {item.start.timeZone} · timed entries display in your browser’s
              timezone
            </dd>
          </div>
        )}
      </dl>
      <p className="hint">
        Feed dates are native source data, not AI extraction. A date does not
        tell us whether an assignment is submitted or completed.
      </p>
      {source ? (
        <a href={source} target="_blank" rel="noreferrer">
          Open original Canvas source ↗
        </a>
      ) : (
        <p className="hint">No safe original-source link was supplied.</p>
      )}
    </details>
  );
}
