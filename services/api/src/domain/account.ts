import type { FastifyInstance } from "fastify";
import { apiRoutes, emptyRequestSchema } from "@action-inbox/contracts";
import { clearSessionCookie } from "../auth/index.js";
import { authenticatedUser, type Runtime } from "../runtime.js";
import { parse, transaction } from "./store.js";

export function registerAccount(app: FastifyInstance, runtime: Runtime): void {
  app.post(
    apiRoutes.disconnect,
    { preHandler: runtime.requireUser },
    async (request, reply) => {
      parse(emptyRequestSchema, request.body);
      const userId = authenticatedUser(request);
      // Never purge first: a provider failure must leave the connection and its
      // retained data available for an honest retry. The gateway marks revocation
      // before persistence workers may acquire the user lock again.
      await runtime.google.revoke(userId);
      await transaction(runtime, userId, async (client) => {
        await client.query(
          "DELETE FROM calendar_event_links WHERE task_id IN (SELECT id FROM tasks WHERE user_id=$1)",
          [userId],
        );
        await client.query("DELETE FROM calendar_snapshots WHERE user_id=$1", [
          userId,
        ]);
        await client.query("DELETE FROM email_messages WHERE user_id=$1", [
          userId,
        ]);
        await client.query("DELETE FROM sync_runs WHERE user_id=$1", [userId]);
        await client.query("DELETE FROM google_connections WHERE user_id=$1", [
          userId,
        ]);
        await client.query(
          "DELETE FROM oauth_states WHERE browser_binding_hash IN (SELECT session_hash FROM browser_sessions WHERE user_id=$1)",
          [userId],
        );
        await client.query("DELETE FROM browser_sessions WHERE user_id=$1", [
          userId,
        ]);
      });
      clearSessionCookie(reply, runtime.config);
      return { ok: true };
    },
  );

  app.delete(
    apiRoutes.deleteData,
    { preHandler: runtime.requireUser },
    async (request, reply) => {
      const userId = authenticatedUser(request);
      await runtime.google.revoke(userId);
      await transaction(runtime, userId, async (client) => {
        await client.query(
          "DELETE FROM oauth_states WHERE browser_binding_hash IN (SELECT session_hash FROM browser_sessions WHERE user_id=$1)",
          [userId],
        );
        await client.query("DELETE FROM users WHERE id=$1", [userId]);
      });
      clearSessionCookie(reply, runtime.config);
      return { ok: true };
    },
  );
}
