import type { FastifyInstance } from "fastify";
import {
  displayPreferencesSchema,
  displayRoutes,
} from "@action-inbox/contracts";
import { authenticatedUser, type Runtime } from "../runtime.js";
import { parse, transaction } from "./store.js";

export function registerDisplay(app: FastifyInstance, runtime: Runtime): void {
  const options = { preHandler: runtime.requireUser };
  app.get(displayRoutes.preferences, options, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return transaction(runtime, authenticatedUser(request), async (client) => {
      const result = await client.query<{ display_window_days: number }>(
        "SELECT display_window_days FROM users WHERE id=$1",
        [authenticatedUser(request)],
      );
      return displayPreferencesSchema.parse({
        windowDays: result.rows[0]!.display_window_days,
      });
    });
  });
  app.put(displayRoutes.preferences, options, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const preferences = parse(displayPreferencesSchema, request.body);
    return transaction(runtime, authenticatedUser(request), async (client) => {
      await client.query(
        "UPDATE users SET display_window_days=$2,updated_at=now() WHERE id=$1",
        [authenticatedUser(request), preferences.windowDays],
      );
      return preferences;
    });
  });
}
