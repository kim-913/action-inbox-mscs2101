import { useEffect, useRef, useState } from "react";
import { RequestError } from "./api/client";

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="error-notice">
      <p>
        {error instanceof Error
          ? error.message
          : "The request could not be completed. Please retry."}
      </p>
      {error instanceof RequestError && (
        <>
          <details className="diagnostics">
            <summary>Technical details</summary>
            <p>
              Code: {error.code}
              {error.requestId ? ` · Request: ${error.requestId}` : ""}
            </p>
          </details>
          {error.code === "CONFLICT" && (
            <p>
              Another change was saved first. Reload this item before editing
              again; your current draft has not been applied.
            </p>
          )}
          {error.code === "GOOGLE_RECONNECT_REQUIRED" && (
            <p>Reconnect Google from Connections, then retry.</p>
          )}
          {error.code === "CSRF_INVALID" && (
            <p>Reload the page to establish a fresh session, then retry.</p>
          )}
        </>
      )}
    </div>
  );
}

export interface ActionState {
  pending: boolean;
  error: unknown;
  message: string;
  run: (action: () => Promise<void>, success?: string) => Promise<void>;
}
export function useAction(): ActionState {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const active = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run(action: () => Promise<void>, success = "Changes saved.") {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    setMessage("");
    try {
      await action();
      if (active.current) setMessage(success);
    } catch (failure) {
      if (active.current) setError(failure);
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  return { pending, error, message, run };
}
export function ActionNotice({ action }: { action: ActionState }) {
  return (
    <>
      <ErrorNotice error={action.error} />
      {(action.pending || action.message) && (
        <p className="action-status" role="status">
          {action.pending ? "Saving…" : action.message}
        </p>
      )}
    </>
  );
}
export function localDateValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return Number.isFinite(local.getTime())
    ? local.toISOString().slice(0, 16)
    : "";
}
export function isoDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Enter a valid date and time.");
  const iso = date.toISOString();
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value) ||
    localDateValue(iso) !== value.slice(0, 16)
  )
    throw new Error(
      "Enter a valid local date and time; this date may not exist in your timezone.",
    );
  return iso;
}
export function displayDate(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Invalid date — refresh this item.";
}
export function DueFields({
  title,
  due,
  onTitle,
  onDue,
  disabled = false,
}: {
  title: string;
  due: string;
  onTitle: (value: string) => void;
  onDue: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <label>
        Title
        <input
          required
          maxLength={300}
          value={title}
          onChange={(event) => onTitle(event.target.value)}
        />
      </label>
      <label>
        Due date and time (your local timezone)
        <input
          type="datetime-local"
          value={due}
          onChange={(event) => onDue(event.target.value)}
        />
      </label>
      <p className="hint">
        Leave the due date empty when no exact deadline is known. Any date you
        enter is your decision, not new source evidence.
      </p>
    </fieldset>
  );
}

export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
