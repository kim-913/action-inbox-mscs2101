import {
  healthResponseSchema,
  type HealthResponse,
} from "@action-inbox/contracts";

export class HealthError extends Error {
  constructor(
    public readonly kind: "configuration" | "network" | "http" | "malformed",
    message: string,
  ) {
    super(message);
    this.name = "HealthError";
  }
}

function healthUrl(baseUrl: string | undefined): string {
  if (!baseUrl?.trim()) {
    throw new HealthError(
      "configuration",
      "Set VITE_API_URL to the API address, then restart the web development server.",
    );
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new HealthError(
      "configuration",
      "VITE_API_URL must be a valid HTTP or HTTPS address.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new HealthError(
      "configuration",
      "VITE_API_URL must be an HTTP or HTTPS origin without credentials, a path, query, or fragment.",
    );
  }
  return new URL("/v1/health", url).toString();
}

export async function fetchHealth(
  baseUrl: string | undefined,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<HealthResponse> {
  const url = healthUrl(baseUrl);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new HealthError(
      "network",
      "Unable to reach the API. Check the API address and your network, then retry.",
    );
  }
  if (!response.ok) {
    throw new HealthError(
      "http",
      `The API returned HTTP ${response.status}. Retry when the service is available.`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new HealthError(
      "malformed",
      "The API returned malformed JSON. Expected an Action Inbox health response.",
    );
  }
  const parsed = healthResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new HealthError(
      "malformed",
      "The API response does not match the Action Inbox health contract.",
    );
  }
  return parsed.data;
}
