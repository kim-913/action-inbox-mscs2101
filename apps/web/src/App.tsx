import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  apiRoutes,
  googleStartResponseSchema,
  inboxResponseSchema,
  successResponseSchema,
  type SessionResponse,
} from "@action-inbox/contracts";
import {
  ApiClient,
  authorizationRedirect,
  callbackOutcome,
} from "./api/client";
import { HealthPage } from "./HealthPage";
import { EmailDetail, Inbox } from "./Inbox";
import { Tasks } from "./Tasks";
import { Calendar } from "./Calendar";
import { Planner } from "./PlannerPage";
import { CanvasConnectionCard } from "./CanvasFeed";
import { ActionNotice, ErrorNotice, useAction } from "./ui";
import { DisplayWindowProvider } from "./display-window";

type Page =
  "Planner" | "Inbox" | "Tasks" | "Calendar" | "Connections" | "Health";
const navigationPaths: Record<Page, string> = {
  Planner: "M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4 M8 14h3 M8 17h5",
  Inbox: "M4 4h16v16H4z M4 13h5l2 3h2l2-3h5",
  Tasks: "M9 6h11 M9 12h11 M9 18h11 M3 6l1 1 2-3 M3 12l1 1 2-3 M3 18l1 1 2-3",
  Calendar: "M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4",
  Connections: "M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  Health: "M3 12h4l3-7 4 14 3-7h4",
};
export function App() {
  const [api] = useState(() => new ApiClient(import.meta.env.VITE_API_URL));
  const [cache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={cache}>
      <Application api={api} />
    </QueryClientProvider>
  );
}

export function Application({
  api,
  navigate = (url: string) => window.location.assign(url),
}: {
  api: ApiClient;
  navigate?: (url: string) => void;
}) {
  const cache = useQueryClient();
  const [page, setPage] = useState<Page>(
    window.location.pathname === "/health" ? "Health" : "Planner",
  );
  const [emailId, setEmailId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [createTask, setCreateTask] = useState(false);
  const workspace = useRef<HTMLElement>(null);
  const sourceReturn = useRef<string | null>(null);
  function openEmail(id: string) {
    sourceReturn.current = id;
    setEmailId(id);
  }
  useLayoutEffect(() => {
    if (emailId) {
      workspace.current?.querySelector<HTMLElement>("h1")?.focus();
    } else if (sourceReturn.current) {
      const control = Array.from(
        workspace.current?.querySelectorAll<HTMLElement>(
          "[data-source-email]",
        ) ?? [],
      ).find((element) => element.dataset.sourceEmail === sourceReturn.current);
      (control ?? workspace.current)?.focus();
      sourceReturn.current = null;
    }
  }, [emailId]);
  const [generation, setGeneration] = useState(0);
  const [outcome, setOutcome] = useState(() =>
    callbackOutcome(window.location.search),
  );
  const session = useQuery({
    queryKey: ["session", generation],
    queryFn: ({ signal }) => api.session(signal),
    staleTime: Infinity,
  });
  useEffect(() => {
    setEmailId(null);
    setTaskId(null);
    setCreateTask(false);
  }, [session.data?.user?.id]);
  useEffect(() => {
    if (window.location.search)
      window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    api.onUnauthenticated = () => {
      cache.clear();
      setEmailId(null);
      setTaskId(null);
      setPage("Connections");
      setGeneration((value) => value + 1);
    };
    return () => {
      api.onUnauthenticated = undefined;
      api.clear();
    };
  }, [api, cache]);
  async function clearPrivateData() {
    api.clear();
    await cache.cancelQueries();
    cache.clear();
    setEmailId(null);
    setTaskId(null);
    setPage("Connections");
    setGeneration((value) => value + 1);
  }
  const authenticated = session.data?.authenticated && session.data.user;
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => {
            setPage("Planner");
            setEmailId(null);
          }}
        >
          <span className="brand-symbol" aria-hidden="true">
            <svg
              width="23"
              height="23"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 12 4 4 8-9" />
            </svg>
          </span>
          <span>
            action<span className="brand-light">inbox</span>
            <small>Your connected plan.</small>
          </span>
        </button>
        <p className="nav-caption">YOUR WORKSPACE</p>
        <nav aria-label="Main navigation">
          {(
            [
              "Planner",
              "Inbox",
              "Tasks",
              "Calendar",
              "Connections",
              "Health",
            ] as const
          ).map((item) => (
            <button
              key={item}
              aria-current={page === item ? "page" : undefined}
              onClick={() => {
                setPage(item);
                setEmailId(null);
                setTaskId(null);
                setCreateTask(false);
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d={navigationPaths[item]} />
              </svg>
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="privacy-mark" aria-hidden="true" />
          <strong>You’re in control.</strong>
          <p>
            Suggestions first.
            <br />
            Your approval, always.
          </p>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="breadcrumb">
            {page}
            {emailId ? " / Source & review" : ""}
          </span>
          <div className="account-summary">
            {session.data?.authenticated && (
              <>
                <span className="connection-label">
                  <span
                    className={`status-dot ${session.data.googleConnected ? "connected" : "attention"}`}
                    aria-hidden="true"
                  />
                  {session.data.googleConnected
                    ? "Google connected"
                    : "Google disconnected"}
                </span>
                <span className="signed-in">
                  Signed in as{" "}
                  {session.data.user?.displayName || session.data.user?.email}
                </span>
                <span className="avatar" aria-hidden="true">
                  {(
                    session.data.user?.displayName ||
                    session.data.user?.email ||
                    "A"
                  )
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
              </>
            )}
          </div>
        </header>
        {page === "Health" ? (
          <HealthPage />
        ) : (
          <main
            ref={workspace}
            tabIndex={-1}
            className="workspace"
            key={`${generation}:${session.data?.user?.id ?? "anonymous"}`}
          >
            {outcome && (
              <p className="inline-note callback-notice" role="status">
                <span>{outcome}</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setOutcome(null);
                    workspace.current?.focus();
                  }}
                >
                  Dismiss sign-in message
                </button>
              </p>
            )}
            <ErrorNotice error={session.error} />
            {session.isPending && (
              <p className="empty-state" role="status">
                Checking your browser session…
              </p>
            )}
            {session.isError && (
              <button onClick={() => void session.refetch()}>
                Retry session
              </button>
            )}
            {session.data &&
              (!authenticated ? (
                <Onboarding api={api} navigate={navigate} />
              ) : (
                <DisplayWindowProvider
                  api={api}
                  userId={session.data.user!.id}
                  requirePreferences={page !== "Connections" && !emailId}
                >
                  {!session.data.googleConnected && page !== "Connections" && (
                    <p className="inline-note">
                      Google is disconnected.{" "}
                      <button
                        className="text-button"
                        onClick={() => setPage("Connections")}
                      >
                        Open Connections
                      </button>{" "}
                      to import new sources. Your saved work stays here.
                    </p>
                  )}
                  {emailId && (
                    <>
                      <button
                        className="back-link text-button"
                        onClick={() => setEmailId(null)}
                      >
                        ← Back to {page}
                      </button>
                      <EmailDetail api={api} id={emailId} />
                    </>
                  )}
                  <div hidden={emailId !== null}>
                    {page === "Planner" ? (
                      <Planner
                        api={api}
                        connected={session.data.googleConnected}
                        openEmail={openEmail}
                        openTask={(id) => {
                          setTaskId(id ?? null);
                          setCreateTask(!id);
                          setPage("Tasks");
                        }}
                        openInbox={() => setPage("Inbox")}
                        openConnections={() => setPage("Connections")}
                      />
                    ) : page === "Inbox" ? (
                      <Inbox
                        api={api}
                        connected={session.data.googleConnected}
                        openEmail={openEmail}
                      />
                    ) : page === "Tasks" ? (
                      <Tasks
                        key={taskId ?? (createTask ? "new" : "all")}
                        api={api}
                        connected={session.data.googleConnected}
                        timezone={session.data.user!.timezone}
                        openEmail={openEmail}
                        initialTaskId={taskId}
                        createInitially={createTask}
                      />
                    ) : page === "Calendar" ? (
                      <Calendar api={api} />
                    ) : (
                      <Account
                        api={api}
                        session={session.data}
                        clearPrivateData={clearPrivateData}
                        navigate={navigate}
                      />
                    )}
                  </div>
                </DisplayWindowProvider>
              ))}
          </main>
        )}
      </div>
    </div>
  );
}

function ConnectGoogle({
  api,
  navigate,
  connected = false,
}: {
  api: ApiClient;
  navigate: (url: string) => void;
  connected?: boolean;
}) {
  const action = useAction();
  return (
    <>
      <button
        disabled={action.pending}
        onClick={() =>
          void action.run(async () => {
            const response = await api.request(
              apiRoutes.googleStart,
              googleStartResponseSchema,
              { method: "POST", body: {} },
            );
            navigate(authorizationRedirect(response.authorizationUrl));
          }, "Opening Google authorization…")
        }
      >
        {connected ? "Reconnect Google account" : "Connect Google account"}
      </button>
      <ActionNotice
        action={action}
        pendingMessage="Requesting Google authorization…"
      />
    </>
  );
}
function Onboarding({
  api,
  navigate,
}: {
  api: ApiClient;
  navigate: (url: string) => void;
}) {
  return (
    <section className="panel">
      <h1>Turn email into a next step you approve.</h1>
      <p>
        Connect one approved Google test account. Action Inbox reads recent
        Gmail messages, shows exact supporting text, and lets you review
        suggestions before creating a task.
      </p>
      <p>
        No calendar event is created without your explicit confirmation. In-app
        reminder metadata is available, but notification delivery is not
        configured.
      </p>
      <ConnectGoogle api={api} navigate={navigate} />
      <p className="hint">
        Sign-in uses a secure browser session. Google tokens are never stored in
        browser storage.
      </p>
    </section>
  );
}

function Account({
  api,
  session,
  clearPrivateData,
  navigate,
}: {
  api: ApiClient;
  session: SessionResponse;
  clearPrivateData: () => Promise<void>;
  navigate: (url: string) => void;
}) {
  const [confirmation, setConfirmation] = useState<
    "logout" | "disconnect" | "delete" | null
  >(null);
  const action = useAction();
  const interpretation = useQuery({
    queryKey: ["private", "connection-status"],
    queryFn: ({ signal }) =>
      api.request(`${apiRoutes.inbox}?limit=1`, inboxResponseSchema, {
        signal,
      }),
  });
  const lastRun = interpretation.data?.dataState.latestSyncRun;
  const unconfigured = lastRun?.error?.code === "PROVIDER_NOT_CONFIGURED";
  const descriptions = {
    logout:
      "Log out of this browser? Cached private data and drafts will be cleared.",
    disconnect:
      "Disconnect Google? Google access is revoked and retained message-derived data is deleted. Private browser data will be cleared.",
    delete:
      "Delete all account data? This revokes Google access and permanently deletes your retained account data. This cannot be undone.",
  };
  return (
    <section className="page-connections">
      <div className="page-heading connections-heading">
        <div>
          <p className="eyebrow">Sources and permissions</p>
          <h1>Connections</h1>
          <p className="subtitle">
            Manage source access, import status, and retained account data.
          </p>
        </div>
      </div>
      <div className="connection-grid">
        <article className="surface connection-card google-connection">
          <span
            className={`pill ${session.googleConnected ? "soon" : "neutral"}`}
          >
            {session.googleConnected ? "Connected" : "Not connected"}
          </span>
          <h2>Google account</h2>
          <p>{session.user?.email}</p>
          <ConnectGoogle
            api={api}
            navigate={navigate}
            connected={session.googleConnected}
          />
          <ul className="capability-list">
            <li>
              <strong>Gmail · read-only source</strong>Recent messages import
              after a successful connection. Imported sources remain readable
              even when extraction is unavailable.
            </li>
            <li>
              <strong>Google Calendar · same account</strong>Upcoming events are
              read into Planner. Creating a Google event requires a separate
              confirmation in a task.
            </li>
          </ul>
        </article>
        <article className="surface connection-card interpretation-connection">
          <span
            className={`pill ${unconfigured ? "neutral" : "review"}`}
            role="status"
          >
            {unconfigured
              ? "Interpretation unavailable"
              : lastRun?.status === "Running" || lastRun?.status === "Queued"
                ? "Preparing sources"
                : lastRun?.status === "Succeeded"
                  ? "Last run completed"
                  : lastRun
                    ? "Last run needs attention"
                    : interpretation.isFetching
                      ? "Checking status"
                      : "Not yet checked"}
          </span>
          <h2>Automatic suggestions</h2>
          <p>
            {unconfigured
              ? "The last import reported that extraction was not configured; no AI dates or actions were invented. Read imported messages or create manual tasks."
              : "Source connection and interpretation are separate. Extracted actions and dates remain proposals until you review their evidence."}
          </p>
          {lastRun && (
            <p>
              {lastRun.importedCount} imported · {lastRun.processedCount}{" "}
              processed on the last observed run.
            </p>
          )}
          <button
            className="secondary small"
            disabled={interpretation.isFetching}
            onClick={() => void interpretation.refetch()}
          >
            {interpretation.isFetching
              ? "Checking connection…"
              : "Refresh connection status"}
          </button>
          <ErrorNotice error={interpretation.error} />
          {lastRun?.error && (
            <details className="diagnostics">
              <summary>Last run details</summary>
              <p>
                {lastRun.error.message}
                <br />
                Code: {lastRun.error.code} · Request: {lastRun.error.requestId}
              </p>
            </details>
          )}
          <p className="hint">
            This reports observed import results, not an assurance that an
            extraction provider is currently enabled. Reminder delivery is not
            configured.
          </p>
        </article>
        <CanvasConnectionCard api={api} />
      </div>
      <section
        className="account-controls"
        aria-labelledby="account-controls-heading"
      >
        <h2 id="account-controls-heading">Browser session and retained data</h2>
        <p>
          These actions require confirmation. Private client data is cleared
          after the server confirms success; a failure remains visible for
          retry.
        </p>
        <div className="actions">
          <button
            onClick={() => setConfirmation("logout")}
            disabled={action.pending}
          >
            Log out
          </button>
          <button
            className="secondary"
            onClick={() => setConfirmation("disconnect")}
            disabled={action.pending}
          >
            Disconnect Google
          </button>
          <button
            className="secondary danger"
            onClick={() => setConfirmation("delete")}
            disabled={action.pending}
          >
            Delete account data
          </button>
        </div>
        {confirmation && (
          <section className="confirmation" aria-label="Confirm account action">
            <h3>{descriptions[confirmation]}</h3>
            <div className="actions">
              <button
                disabled={action.pending}
                onClick={() =>
                  void action.run(async () => {
                    const path =
                      confirmation === "logout"
                        ? apiRoutes.logout
                        : confirmation === "disconnect"
                          ? apiRoutes.disconnect
                          : apiRoutes.deleteData;
                    await api.request(path, successResponseSchema, {
                      method: confirmation === "delete" ? "DELETE" : "POST",
                      ...(confirmation === "delete" ? {} : { body: {} }),
                    });
                    await clearPrivateData();
                  })
                }
              >
                Confirm{" "}
                {confirmation === "delete"
                  ? "permanent deletion"
                  : confirmation}
              </button>
              <button
                disabled={action.pending}
                onClick={() => setConfirmation(null)}
              >
                Keep my account unchanged
              </button>
            </div>
          </section>
        )}
        <ActionNotice
          action={action}
          pendingMessage="Applying your confirmed account action…"
        />
      </section>
    </section>
  );
}
