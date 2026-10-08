import {
  apiErrorSchema,
  apiRoutes,
  sessionResponseSchema,
  type SessionResponse,
} from "@action-inbox/contracts";

type Schema<T> = { parse: (value: unknown) => T };
export class RequestError extends Error {
  constructor(
    message: string,
    public readonly code = "CLIENT_ERROR",
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export type TaskIntent = {
  requestId: string;
  title: string;
  dueAt: string | null;
};
export type ReminderIntent = { requestId: string; scheduledAt: string };
export type EventIntent = {
  requestId: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
};

export class ApiClient {
  private csrf: string | null = null;
  private userId: string | null = null;
  private generation = 0;
  private requests = new Set<AbortController>();
  pendingTask: TaskIntent | null = null;
  readonly pendingReminders = new Map<string, ReminderIntent>();
  readonly pendingEvents = new Map<string, EventIntent>();
  onUnauthenticated: (() => void) | undefined;
  constructor(
    private readonly baseUrl: string | undefined,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  clear() {
    this.generation += 1;
    this.csrf = null;
    this.pendingTask = null;
    this.userId = null;
    this.pendingReminders.clear();
    this.pendingEvents.clear();
    for (const request of this.requests) request.abort();
    this.requests.clear();
  }

  async session(signal?: AbortSignal): Promise<SessionResponse> {
    const generation = this.generation;
    const session = await this.request(
      apiRoutes.session,
      sessionResponseSchema,
      signal ? { signal } : {},
    );
    if (generation !== this.generation)
      throw new RequestError(
        "This session was replaced. Reload your session before making changes.",
        "UNAUTHENTICATED",
      );
    if (this.userId !== (session.user?.id ?? null)) this.clear();
    this.userId = session.user?.id ?? null;
    this.csrf = session.csrfToken;
    return session;
  }

  async request<T>(
    path: string,
    schema: Schema<T>,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    const generation = this.generation;
    let origin: URL;
    try {
      origin = new URL(this.baseUrl ?? "");
      if (
        !["http:", "https:"].includes(origin.protocol) ||
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash
      )
        throw new Error();
    } catch {
      throw new RequestError(
        "Set VITE_API_URL to an HTTP or HTTPS API origin, then restart the web server.",
      );
    }
    const method = options.method ?? "GET";
    if (method !== "GET" && !this.csrf)
      throw new RequestError(
        "Reload your session before making changes.",
        "CSRF_INVALID",
      );
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    this.requests.add(controller);
    const timeout = setTimeout(abort, 20_000);
    try {
      const response = await this.fetcher(new URL(path, origin), {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(method !== "GET" ? { "X-CSRF-Token": this.csrf! } : {}),
        },
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted || generation !== this.generation)
        throw new RequestError(
          "Request interrupted. Retry the same action to check its outcome.",
        );
      if (!response.ok) {
        if (response.status === 401) {
          this.clear();
          if (path !== apiRoutes.session) this.onUnauthenticated?.();
        }
        const parsed = apiErrorSchema.safeParse(body);
        if (parsed.success)
          throw new RequestError(
            parsed.data.message,
            parsed.data.code,
            parsed.data.requestId,
          );
        throw new RequestError(
          `The API returned HTTP ${response.status}. Retry when the service is available.`,
        );
      }
      try {
        return schema.parse(body);
      } catch {
        throw new RequestError(
          "The API response does not match the application contract. Retry or contact the team.",
        );
      }
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(
        controller.signal.aborted
          ? "Request interrupted. Retry the same action to check its outcome."
          : "Unable to reach the API. Your last successful data is retained; retry when connected.",
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      this.requests.delete(controller);
    }
  }
}

export function route(path: string, id: string) {
  return path.replace(":id", encodeURIComponent(id));
}
export function safeExternalLink(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function authorizationRedirect(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== "https://accounts.google.com" ||
    url.username ||
    url.password
  )
    throw new RequestError(
      "The API returned an unexpected Google authorization address.",
    );
  return url.href;
}
export function callbackOutcome(search: string): string | null {
  const outcome = new URLSearchParams(search).get("auth");
  return outcome === "connected"
    ? "Returned from Google. Your verified account connection is shown below."
    : outcome === "denied"
      ? "Google access was not granted. You can try connecting again."
      : outcome === "failed"
        ? "Google connection failed. Please try connecting again."
        : null;
}
