import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  apiRoutes,
  emailResponseSchema,
  inboxResponseSchema,
  suggestionSchema,
  syncRunSchema,
  taskSchema,
  type Suggestion,
  type SyncRun,
} from "@action-inbox/contracts";
import { type ApiClient, route } from "./api/client";
import {
  ActionNotice,
  DueFields,
  ErrorNotice,
  displayDate,
  isoDate,
  localDateValue,
  useAction,
  useNow,
} from "./ui";
import { dueUrgency } from "./urgency";

export function Inbox({
  api,
  connected,
  openEmail,
}: {
  api: ApiClient;
  connected: boolean;
  openEmail: (id: string) => void;
}) {
  const cache = useQueryClient();
  const action = useAction();
  const [startedRun, setStartedRun] = useState<SyncRun | null>(null);
  const [watch, setWatch] = useState(0);
  const inbox = useInfiniteQuery({
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
  const latest = inbox.data?.pages[0]?.dataState;
  const trackedId = startedRun?.id ?? latest?.latestSyncRun?.id;
  const run = useQuery({
    queryKey: ["private", "sync", trackedId, watch],
    enabled: Boolean(trackedId),
    queryFn: ({ signal }) =>
      api.request(route(apiRoutes.syncRun, trackedId!), syncRunSchema, {
        signal,
      }),
    refetchInterval: (query) =>
      !query.state.error &&
      query.state.dataUpdateCount < 60 &&
      ["Queued", "Running"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
    refetchIntervalInBackground: false,
  });
  const currentRun = run.data ?? startedRun ?? latest?.latestSyncRun;
  const running =
    currentRun?.status === "Queued" || currentRun?.status === "Running";
  const lastCheckedAt = run.dataUpdatedAt;
  const pollCount =
    cache.getQueryState(["private", "sync", trackedId, watch])
      ?.dataUpdateCount ?? 0;
  const pollingPaused = running && (pollCount >= 60 || run.isError);
  useEffect(() => {
    if (run.data)
      void cache.invalidateQueries({ queryKey: ["private", "inbox"] });
    // Refresh imported sources on progress, not every identical polling response.
  }, [
    run.data?.id,
    run.data?.importedCount,
    run.data?.processedCount,
    run.data?.status,
    cache,
  ]);
  const messages = inbox.data?.pages.flatMap((page) => page.items) ?? [];
  const unavailable = messages.filter(
    (email) => email.extractionStatus !== "Succeeded",
  ).length;
  const extractionUnavailable =
    currentRun?.error?.code === "PROVIDER_NOT_CONFIGURED" ||
    messages.some(
      (email) => email.extractionError?.code === "PROVIDER_NOT_CONFIGURED",
    );
  return (
    <section aria-labelledby="inbox-heading">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Connected sources</p>
          <h1 id="inbox-heading">Inbox</h1>
          <p className="subtitle">
            Read the original message. Review its suggested actions and
            evidence.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => void inbox.refetch()}
          disabled={inbox.isFetching}
        >
          Refresh inbox
        </button>
      </div>
      <section className="mailbox surface" aria-labelledby="messages-heading">
        <div className="section-heading">
          <div>
            <h2 id="messages-heading">Your inbox</h2>
            <p className="section-note">
              Every imported message stays readable, with or without
              suggestions.
            </p>
          </div>
          <span className="count-label">{messages.length} loaded</span>
        </div>
        <div className="sync-strip">
          <span
            className={`status-dot ${running && !pollingPaused ? "working" : currentRun?.status === "Failed" ? "attention" : ""}`}
            aria-hidden="true"
          />
          <span className="sync-copy">
            <strong>
              {pollingPaused
                ? "Progress checks paused"
                : running
                  ? "Importing & preparing suggestions"
                  : currentRun?.status === "Failed"
                    ? extractionUnavailable
                      ? "Emails imported · suggestions unavailable"
                      : "Last sync needs attention"
                    : currentRun?.status === "Succeeded"
                      ? "Inbox is up to date"
                      : "Connect your mail, then sync when you’re ready"}
            </strong>
            {currentRun && (
              <small>
                {currentRun.importedCount} imported ·{" "}
                {currentRun.processedCount} processed
                {pollingPaused ? ` · Last known: ${currentRun.status}` : ""}
              </small>
            )}
          </span>
          <button
            className="secondary small"
            disabled={!connected || action.pending || running}
            onClick={() =>
              void action.run(async () => {
                const next = await api.request(apiRoutes.sync, syncRunSchema, {
                  method: "POST",
                  body: {},
                });
                setStartedRun(next);
                setWatch((value) => value + 1);
              }, "Sync requested.")
            }
          >
            {currentRun?.status === "Failed"
              ? "Retry Gmail sync"
              : "Sync Gmail"}
          </button>
          {(running || pollingPaused || run.error) && trackedId && (
            <button
              className="secondary small"
              onClick={() => setWatch((value) => value + 1)}
            >
              Check sync progress
            </button>
          )}
          <details className="sync-details">
            <summary>Sync details</summary>
            <div>
              <p>
                Last successful sync:{" "}
                {displayDate(latest?.lastSuccessfulSyncAt ?? null)}
              </p>
              {currentRun && (
                <p>
                  Last known status: {currentRun.status} ·{" "}
                  {lastCheckedAt
                    ? `Checked ${displayDate(new Date(lastCheckedAt).toISOString())}`
                    : "Not checked in this view"}
                </p>
              )}
              {currentRun?.error && (
                <p>
                  {currentRun.error.message}
                  <br />
                  Code: {currentRun.error.code} · Request:{" "}
                  {currentRun.error.requestId}
                </p>
              )}
              <p>
                Progress checks stop after 60 updates or a connection error.
                Check sync progress resumes read-only checks. Refresh inbox only
                reloads saved mail; neither starts extraction.
              </p>
              {trackedId && !running && (
                <button
                  className="secondary small"
                  onClick={() => setWatch((value) => value + 1)}
                >
                  Check sync progress
                </button>
              )}
              <p className="hint">
                Sync Gmail can import and process up to 100 messages from the
                last 14 days.
              </p>
            </div>
          </details>
        </div>
        {!connected && (
          <p className="inline-note">
            Connect Google in Connections to import email. Saved messages remain
            available.
          </p>
        )}
        <ActionNotice action={action} />
        <ErrorNotice error={run.error} />
        <ErrorNotice error={inbox.error} />
        {(extractionUnavailable || unavailable > 0) && (
          <p className="inline-note">
            <strong>
              {extractionUnavailable
                ? "Automatic suggestions aren’t configured."
                : `${unavailable} message${unavailable === 1 ? " is" : "s are"} awaiting successful extraction.`}
            </strong>{" "}
            You can still open and read the original messages below. No action
            or deadline has been invented.
          </p>
        )}
        {inbox.isPending && (
          <p className="empty-state" role="status">
            Loading saved messages…
          </p>
        )}
        {inbox.data && messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-symbol" aria-hidden="true">
              ↘
            </div>
            <h3>
              {running || (currentRun?.importedCount ?? 0) > 0
                ? "Bringing your imported mail into view"
                : "A quieter place for your next step"}
            </h3>
            <p>
              {running || (currentRun?.importedCount ?? 0) > 0
                ? "The last sync reports imported messages. The saved inbox is refreshing; use Refresh inbox to check again without starting a new sync."
                : "Sync Gmail to bring in recent messages. They stay readable even if automatic extraction is unavailable."}
            </p>
          </div>
        )}
        <div className="mail-list">
          {messages.map((email) => {
            const reviews = email.suggestions.filter(
              (item) => item.reviewState === "Proposed",
            ).length;
            return (
              <article className="mail-row" key={email.id}>
                <span
                  className={`mail-indicator ${reviews ? "unreviewed" : ""}`}
                  aria-hidden="true"
                />
                <div className="mail-content">
                  <div className="mail-meta">
                    <span className="sender">
                      {email.sender || "Unknown sender"}
                    </span>
                    <time dateTime={email.receivedAt}>
                      {new Date(email.receivedAt).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </time>
                  </div>
                  <button
                    className="mail-subject"
                    onClick={() => openEmail(email.id)}
                  >
                    {email.subject || "(No subject)"}
                  </button>
                  <div className="mail-labels">
                    {email.category && (
                      <span className="category-label">{email.category}</span>
                    )}
                    {reviews > 0 ? (
                      <span className="pill review">{reviews} to review</span>
                    ) : email.extractionStatus !== "Succeeded" ? (
                      <span className="source-label">
                        Source ready ·{" "}
                        {email.extractionStatus === "Pending"
                          ? "extraction pending"
                          : "suggestions unavailable"}
                      </span>
                    ) : (
                      <span className="source-label">
                        No pending suggestions
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="open-mail"
                  aria-label={`Open source: ${email.subject || "No subject"}`}
                  onClick={() => openEmail(email.id)}
                >
                  <span aria-hidden="true">→</span>
                </button>
              </article>
            );
          })}
        </div>
        {inbox.hasNextPage && (
          <button
            className="load-more secondary"
            disabled={inbox.isFetchingNextPage}
            onClick={() => void inbox.fetchNextPage()}
          >
            Load more messages
          </button>
        )}
      </section>
    </section>
  );
}

export function EmailDetail({ api, id }: { api: ApiClient; id: string }) {
  const email = useQuery({
    queryKey: ["private", "email", id],
    queryFn: ({ signal }) =>
      api.request(route(apiRoutes.email, id), emailResponseSchema, { signal }),
  });
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Read. Review. Decide.</p>
          <h1>Source email and review</h1>
        </div>
        <button
          className="secondary"
          onClick={() => void email.refetch()}
          disabled={email.isFetching}
        >
          Reload source and versions
        </button>
      </div>
      <ErrorNotice error={email.error} />
      {email.isPending && <p role="status">Loading source…</p>}
      {email.data && (
        <div className="source-layout">
          <article className="surface source-card">
            <span className="pill neutral">
              {email.data.category ?? "Not classified"}
            </span>
            <h2>{email.data.subject || "(No subject)"}</h2>
            <p className="source-sender">
              {email.data.sender}
              <br />
              <time dateTime={email.data.receivedAt}>
                {displayDate(email.data.receivedAt)}
              </time>
            </p>
            <div className="source-heading">
              <h3>Original message</h3>
              <span>Normalized source</span>
            </div>
            <pre className="source">{email.data.normalizedBody}</pre>
          </article>
          <aside className="review-column" aria-label="Suggested actions">
            <div className="review-intro">
              <h2>Your call, always.</h2>
              <p>
                Check the quotes. Adjust the details. Nothing becomes a task or
                calendar event without your decision.
              </p>
            </div>
            {email.data.suggestions.map((suggestion) => (
              <SuggestionReview
                key={`${suggestion.id}:${suggestion.version}`}
                api={api}
                suggestion={suggestion}
                source={email.data.normalizedBody}
              />
            ))}
            {email.data.suggestions.length === 0 && (
              <div className="surface empty-small">
                <h3>
                  {email.data.extractionStatus === "Succeeded"
                    ? "No actions suggested"
                    : "The source is ready to read"}
                </h3>
                <p>
                  {email.data.extractionStatus === "Succeeded"
                    ? "Some messages are for reading or reference. No task has been created."
                    : "Extraction has not completed successfully. Read the original message, then create a manual task in Tasks if needed."}
                </p>
                {email.data.extractionError && (
                  <details className="diagnostics">
                    <summary>Why suggestions are unavailable</summary>
                    <p>{email.data.extractionError.message}</p>
                    <p>
                      Code: {email.data.extractionError.code} · Request:{" "}
                      {email.data.extractionError.requestId}
                    </p>
                  </details>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

export function SuggestionReview({
  api,
  suggestion,
  source,
}: {
  api: ApiClient;
  suggestion: Suggestion;
  source: string;
}) {
  const now = useNow();
  const [title, setTitle] = useState(suggestion.title);
  const [due, setDue] = useState(localDateValue(suggestion.dueAt));
  const [intent, setIntent] = useState<"edit" | "approve" | "reject" | null>(
    null,
  );
  const action = useAction();
  const cache = useQueryClient();
  const supported =
    source.slice(suggestion.evidence.start, suggestion.evidence.end) ===
    suggestion.evidence.quote;
  const deadlineSupported =
    suggestion.deadlineEvidence &&
    source.slice(
      suggestion.deadlineEvidence.start,
      suggestion.deadlineEvidence.end,
    ) === suggestion.deadlineEvidence.quote;
  async function submit(kind: "edit" | "approve" | "reject") {
    await action.run(
      async () => {
        if (!title.trim() && kind !== "reject")
          throw new Error("Enter a title before saving or approving.");
        setIntent(kind);
        const body =
          kind === "reject"
            ? { version: suggestion.version }
            : {
                version: suggestion.version,
                title: title.trim(),
                dueAt: isoDate(due),
              };
        if (kind === "approve")
          await api.request(
            route(apiRoutes.approve, suggestion.id),
            taskSchema,
            { method: "POST", body },
          );
        else
          await api.request(
            route(
              kind === "edit" ? apiRoutes.suggestion : apiRoutes.reject,
              suggestion.id,
            ),
            suggestionSchema,
            { method: kind === "edit" ? "PATCH" : "POST", body },
          );
        setIntent(null);
        await cache.invalidateQueries({ queryKey: ["private"] });
      },
      kind === "approve"
        ? "Approved. The task is available in Tasks; no calendar event was created."
        : kind === "reject"
          ? "Suggestion rejected."
          : "Suggestion edits saved.",
    );
  }
  return (
    <article className="surface suggestion-card">
      <div className="section-heading">
        <span className="pill review">{suggestion.reviewState}</span>
        <span className="category-label">{suggestion.category}</span>
      </div>
      <h3>{suggestion.title}</h3>
      <details className="diagnostics">
        <summary>Extraction details</summary>
        <p>
          Confidence: {Math.round(suggestion.confidence * 100)}% — a measure of
          extraction certainty, not importance. Version {suggestion.version}.
        </p>
      </details>
      <h4>Action evidence</h4>
      <blockquote>{suggestion.evidence.quote}</blockquote>
      <p>
        {supported
          ? "Quotation matches normalized source."
          : "Evidence mismatch: do not rely on this suggestion."}
      </p>
      <h4>Deadline evidence</h4>
      {suggestion.deadlineEvidence ? (
        <>
          <blockquote>{suggestion.deadlineEvidence.quote}</blockquote>
          <p>
            {deadlineSupported
              ? "Deadline quotation matches normalized source."
              : "Deadline evidence mismatch: review the source."}
          </p>
        </>
      ) : (
        <p>No supported deadline quotation.</p>
      )}
      <div className="proposed-date">
        <span className="pill neutral">
          Unconfirmed · {dueUrgency(suggestion.dueAt, now).label}
        </span>
        <p>
          Proposed due: {displayDate(suggestion.dueAt)}
          <br />
          Deadline certainty: <strong>{suggestion.deadlineCertainty}</strong>
        </p>
      </div>
      {(suggestion.needsReview ||
        suggestion.deadlineCertainty === "Uncertain") && (
        <p className="warning">
          Review required:{" "}
          {suggestion.reviewReason ??
            "The deadline is uncertain. Check the source and choose a date yourself or leave it empty."}
        </p>
      )}
      {suggestion.reviewState === "Proposed" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit("edit");
          }}
        >
          <DueFields
            title={title}
            due={due}
            onTitle={setTitle}
            onDue={setDue}
            disabled={action.pending || intent !== null}
          />
          <div className="actions">
            <button
              className="secondary"
              type="submit"
              disabled={
                action.pending || (intent !== null && intent !== "edit")
              }
            >
              Save suggestion edits
            </button>
            <button
              type="button"
              disabled={
                action.pending ||
                !supported ||
                (intent !== null && intent !== "approve")
              }
              onClick={() => void submit("approve")}
            >
              Approve task
            </button>
            <button
              className="text-button danger"
              type="button"
              disabled={
                action.pending || (intent !== null && intent !== "reject")
              }
              onClick={() => void submit("reject")}
            >
              Reject suggestion
            </button>
          </div>
          {intent && action.error != null && (
            <p>
              The outcome may be unknown. Retry the same action, or reload
              source and versions to reconcile before making a different change.
            </p>
          )}
          <ActionNotice action={action} />
        </form>
      )}
    </article>
  );
}
