import { useEffect, useRef, useState } from "react";
import {
  createHealthController,
  type HealthController,
  type HealthState,
} from "./health-controller";

const errorTitles = {
  configuration: "API address needed",
  network: "Connection unavailable",
  http: "API request failed",
  malformed: "Unexpected API response",
};

export function HealthPage() {
  const [state, setState] = useState<HealthState>({ status: "loading" });
  const controller = useRef<HealthController | null>(null);

  useEffect(() => {
    const health = createHealthController(
      import.meta.env.VITE_API_URL,
      setState,
    );
    controller.current = health;
    void health.check();
    return () => {
      health.dispose();
      controller.current = null;
    };
  }, []);

  return (
    <main className="shell health-page">
      <header className="intro health-heading">
        <h1>Service health</h1>
        <p className="description">
          Check that this browser can reach the Action Inbox API. This page
          reports a live service response, not sample data.
        </p>
      </header>
      <section
        className="health-card"
        data-state={state.status}
        aria-labelledby="health-heading"
      >
        <div className="card-heading">
          <span className="health-signal" aria-hidden="true" />
          <h2 id="health-heading">Service connection</h2>
          <span className={`badge ${state.status}`}>{state.status}</span>
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          {state.status === "loading" && (
            <p className="loading-state">Checking the API connection…</p>
          )}
          {state.status === "connected" && (
            <>
              <h3>Connected to Action Inbox</h3>
              <p>The API is responding with a valid health report.</p>
              <dl>
                <div>
                  <dt>Service</dt>
                  <dd>{state.health.service}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{state.health.status}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{state.health.version}</dd>
                </div>
                <div>
                  <dt>Server timestamp</dt>
                  <dd>
                    <time dateTime={state.health.timestamp}>
                      {state.health.timestamp}
                    </time>
                  </dd>
                </div>
              </dl>
            </>
          )}
          {state.status === "error" && (
            <>
              <h3>{errorTitles[state.kind]}</h3>
              <p>{state.message}</p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => void controller.current?.check()}
        >
          {state.status === "loading"
            ? "Restart check"
            : state.status === "connected"
              ? "Check again"
              : "Retry connection"}
        </button>
        <p className="hint">
          Health checks do not connect a Google account or change your data.
        </p>
      </section>
    </main>
  );
}
