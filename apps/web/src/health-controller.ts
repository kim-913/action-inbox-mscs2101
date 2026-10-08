import type { HealthResponse } from "@action-inbox/contracts";
import { fetchHealth, HealthError } from "./api/health";

export type HealthState =
  | { status: "loading" }
  | { status: "connected"; health: HealthResponse }
  | { status: "error"; kind: HealthError["kind"]; message: string };

export interface HealthController {
  check(): Promise<void>;
  dispose(): void;
}

export function createHealthController(
  baseUrl: string | undefined,
  onChange: (state: HealthState) => void,
  fetcher: typeof fetch = fetch,
): HealthController {
  let active: AbortController | undefined;
  let disposed = false;

  return {
    async check(): Promise<void> {
      if (disposed) return;
      active?.abort();
      const request = new AbortController();
      active = request;
      onChange({ status: "loading" });
      try {
        const health = await fetchHealth(baseUrl, request.signal, fetcher);
        if (!request.signal.aborted && active === request && !disposed) {
          onChange({ status: "connected", health });
        }
      } catch (error) {
        if (request.signal.aborted || active !== request || disposed) return;
        const failure =
          error instanceof HealthError
            ? error
            : new HealthError(
                "network",
                "Unable to check API health. Please retry.",
              );
        onChange({
          status: "error",
          kind: failure.kind,
          message: failure.message,
        });
      }
    },
    dispose(): void {
      disposed = true;
      active?.abort();
    },
  };
}
