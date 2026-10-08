// Explicit test harness: never imported by server.ts or production adapters.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { buildApp } from "../app.js";
import { readConfiguration } from "../config.js";
import { migrate } from "../db/migrate.js";
import { createGoogleTestProvider } from "../auth/provider.test-support.js";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || process.env.NODE_ENV === "production") {
  throw new Error(
    "Local browser smoke requires TEST_DATABASE_URL and a non-production environment",
  );
}
const events = new Map<string, Record<string, unknown>>();
const message =
  "Please submit registration documents by 2026-10-16T17:00:00-07:00.";
const provider = await createGoogleTestProvider({
  email: "demo@example.test",
  subject: "synthetic-browser-demo",
  redirectUri: "http://127.0.0.1:3000/v1/auth/google/callback",
  configure(app) {
    app.get("/gmail/v1/users/me/messages", async () => ({
      messages: [{ id: "smoke-message-1", threadId: "smoke-thread-1" }],
    }));
    app.get("/gmail/v1/users/me/messages/:id", async () => ({
      id: "smoke-message-1",
      threadId: "smoke-thread-1",
      internalDate: String(Date.now()),
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "Synthetic registration request" },
          { name: "From", value: "Course Office <course@example.test>" },
        ],
        body: { data: Buffer.from(message).toString("base64url") },
      },
    }));
    app.get("/calendar/v3/calendars/primary/events", async () => ({
      items: [...events.values()],
    }));
    app.get<{ Params: { id: string } }>(
      "/calendar/v3/calendars/primary/events/:id",
      async (request, reply) => {
        const event = events.get(request.params.id);
        return (
          event ??
          reply
            .code(404)
            .send({ error: { message: "Synthetic event not found" } })
        );
      },
    );
    app.post<{ Body: Record<string, unknown> }>(
      "/calendar/v3/calendars/primary/events",
      async (request, reply) => {
        const id = request.body.id;
        if (typeof id !== "string")
          return reply
            .code(400)
            .send({ error: { message: "Event ID required" } });
        if (events.has(id))
          return reply
            .code(409)
            .send({ error: { message: "Synthetic duplicate ID" } });
        const event = {
          ...request.body,
          id,
          htmlLink: "https://calendar.google.com/calendar/",
        };
        events.set(id, event);
        return reply.code(201).send(event);
      },
    );
    app.post("/v1/responses", async () => ({
      id: "resp_synthetic_browser_smoke",
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model: "synthetic-http-provider",
      output: [
        {
          id: "msg_synthetic",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              annotations: [],
              text: JSON.stringify({
                category: "Action Required",
                categoryConfidence: 0.99,
                actions: [
                  {
                    title: "Submit registration documents",
                    evidenceQuote: message,
                    deadlineQuote: "2026-10-16T17:00:00-07:00",
                    dueAt: "2026-10-16T17:00:00-07:00",
                    deadlineCertainty: "Explicit",
                    confidence: 0.99,
                  },
                ],
              }),
            },
          ],
        },
      ],
    }));
  },
});
await migrate(connectionString);
const pool = new pg.Pool({ connectionString });
const config = {
  ...readConfiguration({ WEB_ORIGIN: "http://127.0.0.1:5173" }).config,
  ...provider.config,
  tokenEncryptionKey: randomBytes(32).toString("base64"),
  gmailBaseUrl: `${provider.origin}/gmail/v1`,
  calendarBaseUrl: `${provider.origin}/calendar/v3`,
  openaiApiKey: "synthetic-local-only",
  openaiBaseUrl: `${provider.origin}/v1`,
  openaiModel: "synthetic-http-provider",
};
const app = buildApp({ pool, config });
app.addHook("onClose", async () => {
  await provider.app.close();
  await pool.end();
});
process.once("SIGTERM", () => {
  void app.close();
});
process.once("SIGINT", () => {
  void app.close();
});
await app.listen({ host: "127.0.0.1", port: 3000 });
process.stdout.write(
  "Sanitized local HTTP provider browser smoke ready. No real provider requests or charges.\n",
);
