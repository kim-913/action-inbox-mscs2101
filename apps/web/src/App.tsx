import { useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  apiRoutes,
  googleStartResponseSchema,
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
import { ActionNotice, ErrorNotice, useAction } from "./ui";

type Page = "Inbox" | "Tasks" | "Calendar" | "Account" | "Health";
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
    window.location.pathname === "/health" ? "Health" : "Inbox",
  );
  const [emailId, setEmailId] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [outcome] = useState(() => callbackOutcome(window.location.search));
  const session = useQuery({
    queryKey: ["session", generation],
    queryFn: ({ signal }) => api.session(signal),
    staleTime: Infinity,
  });
  useEffect(() => {
    if (window.location.search)
      window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    api.onUnauthenticated = () => {
      cache.clear();
      setEmailId(null);
      setPage("Account");
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
    setPage("Account");
    setGeneration((value) => value + 1);
  }
  const authenticated = session.data?.authenticated && session.data.user;
  return (
    <>
      <header className="app-header">
        <a href="/" className="brand">
          Action Inbox
        </a>
        <nav aria-label="Main navigation">
          {(["Inbox", "Tasks", "Calendar", "Account", "Health"] as const).map(
            (item) => (
              <button
                key={item}
                aria-current={page === item && !emailId ? "page" : undefined}
                onClick={() => {
                  setPage(item);
                  setEmailId(null);
                }}
              >
                {item}
              </button>
            ),
          )}
        </nav>
      </header>
      {page === "Health" ? (
        <HealthPage />
      ) : (
        <main className="workspace" key={generation}>
          {outcome && <p role="status">{outcome}</p>}
          <ErrorNotice error={session.error} />
          {session.isPending && (
            <p role="status">Checking your browser session…</p>
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
              <>
                <p className="signed-in">
                  Signed in as{" "}
                  {session.data.user!.displayName || session.data.user!.email}
                </p>
                {!session.data.googleConnected && page !== "Account" && (
                  <p className="warning">
                    Google is disconnected. Connect from Account to sync and
                    access Calendar.
                  </p>
                )}
                {emailId ? (
                  <EmailDetail api={api} id={emailId} />
                ) : page === "Inbox" ? (
                  <Inbox
                    api={api}
                    connected={session.data.googleConnected}
                    openEmail={setEmailId}
                  />
                ) : page === "Tasks" ? (
                  <Tasks
                    api={api}
                    connected={session.data.googleConnected}
                    timezone={session.data.user!.timezone}
                    openEmail={setEmailId}
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
              </>
            ))}
        </main>
      )}
    </>
  );
}

function ConnectGoogle({
  api,
  navigate,
}: {
  api: ApiClient;
  navigate: (url: string) => void;
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
        Connect Google account
      </button>
      <ActionNotice action={action} />
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
  const descriptions = {
    logout:
      "Log out of this browser? Cached private data and drafts will be cleared.",
    disconnect:
      "Disconnect Google? Google access is revoked and retained message-derived data is deleted. Private browser data will be cleared.",
    delete:
      "Delete all account data? This revokes Google access and permanently deletes your retained account data. This cannot be undone.",
  };
  return (
    <section>
      <h1>Account and privacy</h1>
      <p>{session.user?.email}</p>
      <p>Google: {session.googleConnected ? "Connected" : "Disconnected"}</p>
      <ConnectGoogle api={api} navigate={navigate} />
      <h2>Browser session and retained data</h2>
      <p>
        These actions require confirmation. Private client data is cleared after
        the server confirms success; a failure remains visible for retry.
      </p>
      <div className="actions">
        <button
          onClick={() => setConfirmation("logout")}
          disabled={action.pending}
        >
          Log out
        </button>
        <button
          onClick={() => setConfirmation("disconnect")}
          disabled={action.pending}
        >
          Disconnect Google
        </button>
        <button
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
              {confirmation === "delete" ? "permanent deletion" : confirmation}
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
      <ActionNotice action={action} />
    </section>
  );
}
