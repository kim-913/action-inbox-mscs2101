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
} from "./ui";

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
  useEffect(() => {
    if (run.data?.status === "Succeeded" || run.data?.status === "Failed")
      void cache.invalidateQueries({ queryKey: ["private", "inbox"] });
  }, [run.data?.status, run.data?.id, cache]);
  return (
    <section aria-labelledby="inbox-heading">
      <h1 id="inbox-heading">Inbox</h1>
      <p>
        Sync reads at most 100 messages from the last 14 days. Suggestions
        require your review before creating tasks.
      </p>
      <div className="actions">
        <button
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
          {currentRun?.status === "Failed" ? "Retry Gmail sync" : "Sync Gmail"}
        </button>
        <button
          onClick={() => void inbox.refetch()}
          disabled={inbox.isFetching}
        >
          Refresh inbox
        </button>
      </div>
      {!connected && <p>Connect Google from Account to sync Gmail.</p>}
      <ActionNotice action={action} />
      <p>
        Last successful sync:{" "}
        {displayDate(latest?.lastSuccessfulSyncAt ?? null)}
      </p>
      {currentRun && (
        <div className="panel" role="status">
          <strong>Sync: {currentRun.status}</strong>
          <p>
            {currentRun.importedCount} imported · {currentRun.processedCount}{" "}
            processed
          </p>
          <ErrorNotice
            error={
              currentRun.error
                ? new Error(
                    `${currentRun.error.message} (Request: ${currentRun.error.requestId})`,
                  )
                : null
            }
          />
          {running && (
            <p>
              Polling is bounded to 60 updates. If progress stops, use Check
              sync progress; previous messages remain readable.
            </p>
          )}
        </div>
      )}
      <ErrorNotice error={run.error} />
      {trackedId && (
        <button onClick={() => setWatch((value) => value + 1)}>
          Check sync progress
        </button>
      )}
      <ErrorNotice error={inbox.error} />
      {inbox.isPending && <p role="status">Loading inbox…</p>}
      {inbox.data?.pages[0]?.items.length === 0 && (
        <p>No synchronized messages yet.</p>
      )}
      {inbox.data?.pages
        .flatMap((page) => page.items)
        .map((email) => (
          <article className="panel" key={email.id}>
            <h2>
              <button
                className="text-button"
                onClick={() => openEmail(email.id)}
              >
                {email.subject || "(No subject)"}
              </button>
            </h2>
            <p>
              {email.sender} · {displayDate(email.receivedAt)}
            </p>
            <p>
              <strong>{email.category ?? "Not classified"}</strong> ·
              Extraction: {email.extractionStatus}
            </p>
            {email.extractionError && (
              <p role="alert">
                {email.extractionError.message} · Request:{" "}
                {email.extractionError.requestId}. Retry Gmail sync to retry
                extraction.
              </p>
            )}
            <p>
              {email.suggestions.length} suggestion(s) ·{" "}
              {
                email.suggestions.filter(
                  (suggestion) => suggestion.reviewState === "Proposed",
                ).length
              }{" "}
              awaiting review
            </p>
          </article>
        ))}
      {inbox.hasNextPage && (
        <button
          disabled={inbox.isFetchingNextPage}
          onClick={() => void inbox.fetchNextPage()}
        >
          Load more messages
        </button>
      )}
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
      <h1>Source email and review</h1>
      <ErrorNotice error={email.error} />
      <button onClick={() => void email.refetch()} disabled={email.isFetching}>
        Reload source and versions
      </button>
      {email.isPending && <p role="status">Loading source…</p>}
      {email.data && (
        <>
          <h2>{email.data.subject || "(No subject)"}</h2>
          <p>
            {email.data.sender} · {displayDate(email.data.receivedAt)}
          </p>
          <p>
            Category: {email.data.category ?? "Not classified"} · Extraction:{" "}
            {email.data.extractionStatus}
          </p>
          {email.data.extractionError && (
            <p role="alert">
              {email.data.extractionError.message} · Request:{" "}
              {email.data.extractionError.requestId}. Retry Gmail sync in Inbox.
            </p>
          )}
          <h3>Normalized source body</h3>
          <pre className="source">{email.data.normalizedBody}</pre>
          {email.data.suggestions.map((suggestion) => (
            <SuggestionReview
              key={`${suggestion.id}:${suggestion.version}`}
              api={api}
              suggestion={suggestion}
              source={email.data.normalizedBody}
            />
          ))}
          {email.data.suggestions.length === 0 && (
            <p>
              No action suggestions for this message. Read / Review and
              Reference messages can have none.
            </p>
          )}
        </>
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
    <article className="panel">
      <h3>{suggestion.title}</h3>
      <p>
        {suggestion.category} · {suggestion.reviewState} · Version{" "}
        {suggestion.version}
      </p>
      <p>
        Extraction confidence: {Math.round(suggestion.confidence * 100)}% (not a
        guarantee)
      </p>
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
      <p>
        Deadline certainty: <strong>{suggestion.deadlineCertainty}</strong> ·
        Proposed due: {displayDate(suggestion.dueAt)}
      </p>
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
