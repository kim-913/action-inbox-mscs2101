// Explicit test harness: never imported by server.ts or production adapters.
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { readFileSync } from "node:fs";
import pg from "pg";
import { buildApp } from "../app.js";
import { readConfiguration } from "../config.js";
import { migrate } from "../db/migrate.js";
import { createGoogleTestProvider } from "../auth/provider.test-support.js";
import { parseCanvasFeed } from "../canvas/feed.js";
import { ApiFailure } from "../runtime.js";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || process.env.NODE_ENV === "production") {
  throw new Error(
    "Local browser smoke requires TEST_DATABASE_URL and a non-production environment",
  );
}
const database = new URL(connectionString);
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  database.port === "55432" ||
  database.pathname !== "/action_inbox_smoke"
) {
  throw new Error(
    "Browser smoke requires a disposable loopback action_inbox_smoke database, never the live preview",
  );
}
const apiPort = 3002;
const webOrigin = "http://127.0.0.1:5174";
const syntheticExtraction = process.env.SMOKE_EXTRACTION === "synthetic";
const messageCount = Number(process.env.SMOKE_MESSAGE_COUNT ?? 6);
if (!Number.isInteger(messageCount) || messageCount < 1 || messageCount > 100) {
  throw new Error("SMOKE_MESSAGE_COUNT must be an integer from 1 to 100");
}
const anchor = new Date();
anchor.setUTCHours(0, 0, 0, 0);
const demoDate = (days: number) =>
  new Date(anchor.getTime() + days * 86_400_000).toISOString().slice(0, 10);
const deadline = `${demoDate(3)}T17:00:00Z`;
const messages = Array.from({ length: messageCount }, (_, index) => ({
  id: `smoke-message-${index + 1}`,
  threadId: `smoke-thread-${index + 1}`,
}));
// Existing provider events are fixtures, not events created by consent/import.
const events = new Map<string, Record<string, unknown>>([
  [
    "synthetic-all-day",
    {
      id: "synthetic-all-day",
      summary: "Synthetic campus closure",
      start: { date: demoDate(1) },
      end: { date: demoDate(2) },
    },
  ],
  [
    "synthetic-timezone-event",
    {
      id: "synthetic-timezone-event",
      summary: "Synthetic cross-timezone meeting",
      start: { dateTime: `${demoDate(2)}T09:00:00+09:00` },
      end: { dateTime: `${demoDate(2)}T10:00:00+09:00` },
    },
  ],
]);
const message = `Please submit registration documents by ${deadline}.`;
let canvasMode: "original" | "changed" | "unavailable" = "original";
const provider = await createGoogleTestProvider({
  email: "demo@example.test",
  subject: "synthetic-browser-demo",
  redirectUri: `http://127.0.0.1:${apiPort}/v1/auth/google/callback`,
  configure(app) {
    app.get("/canvas/calendar.ics", async (_request, reply) => {
      if (canvasMode === "unavailable")
        return reply.code(503).send("Synthetic provider unavailable");
      const body = readFileSync(
        new URL(
          `../../../../test-data/canvas/${canvasMode}.ics`,
          import.meta.url,
        ),
        "utf8",
      )
        .replaceAll(
          "https://canvas.example.invalid/",
          "https://sofia.instructure.com/",
        )
        .replace(/202610(\d{2})(?=T|\r?$)/gm, (_match, day: string) =>
          demoDate(Number(day) - 14).replaceAll("-", ""),
        );
      return reply.type("text/calendar").send(body);
    });
    app.get("/gmail/v1/users/me/messages", async () => ({
      messages,
    }));
    app.get<{ Params: { id: string } }>(
      "/gmail/v1/users/me/messages/:id",
      async (request) => {
        // Keep progress observable while importing actual synthetic provider data.
        await delay(messageCount === 100 ? 0 : 1200);
        const index = messages.findIndex(({ id }) => id === request.params.id);
        return {
          ...messages[index],
          internalDate: String(Date.now()),
          payload: {
            mimeType: "text/plain",
            headers: [
              {
                name: "Subject",
                value: `Synthetic registration request ${index + 1}`,
              },
              { name: "From", value: "Course Office <course@example.test>" },
            ],
            body: { data: Buffer.from(message).toString("base64url") },
          },
        };
      },
    );
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
                    deadlineQuote: deadline,
                    dueAt: deadline,
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
  ...readConfiguration({ WEB_ORIGIN: webOrigin }).config,
  ...provider.config,
  tokenEncryptionKey: randomBytes(32).toString("base64"),
  gmailBaseUrl: `${provider.origin}/gmail/v1`,
  calendarBaseUrl: `${provider.origin}/calendar/v3`,
  ...(syntheticExtraction ? { openaiApiKey: "synthetic-local-only" } : {}),
  openaiBaseUrl: `${provider.origin}/v1`,
  openaiModel: "synthetic-http-provider",
};
const app = buildApp({
  pool,
  config,
  canvasFeedReader: async () => {
    const response = await fetch(`${provider.origin}/canvas/calendar.ics`, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new ApiFailure(
        503,
        "CANVAS_UNAVAILABLE",
        "Canvas is temporarily unavailable. Retry refresh.",
      );
    return parseCanvasFeed(await response.text());
  },
});
// Convenience entry for this loopback-only fixture process, not application auth.
// It exercises the real session/state/PKCE callback instead of seeding a user.
app.get("/__smoke/start", async (_request, reply) => {
  const session = await app.inject({ method: "GET", url: "/v1/auth/session" });
  const cookie = session.headers["set-cookie"];
  if (session.statusCode !== 200 || !cookie) {
    return reply
      .code(500)
      .send({ error: "Synthetic session bootstrap failed" });
  }
  const cookies = Array.isArray(cookie) ? cookie : [cookie];
  const start = await app.inject({
    method: "POST",
    url: "/v1/auth/google/start",
    headers: {
      origin: webOrigin,
      cookie: cookies.map((value) => value.split(";")[0]).join("; "),
      "x-csrf-token": session.json<{ csrfToken: string }>().csrfToken,
      "content-type": "application/json",
    },
    payload: "{}",
  });
  if (start.statusCode !== 200) {
    return reply.code(500).send({ error: "Synthetic OAuth initiation failed" });
  }
  const destination = new URL(
    start.json<{ authorizationUrl: string }>().authorizationUrl,
  );
  if (destination.origin !== provider.origin) {
    return reply
      .code(500)
      .send({ error: "Expected the loopback fixture provider" });
  }
  reply.header("set-cookie", cookies);
  return reply.redirect(destination.href);
});
// Test-only orchestration route: never registered by production server.ts.
app.post<{ Body: { mode: string } }>(
  "/__smoke/canvas-mode",
  (request, reply) => {
    const mode = request.body.mode;
    if (mode !== "original" && mode !== "changed" && mode !== "unavailable")
      return reply.code(400).send({ ok: false });
    canvasMode = mode;
    return { ok: true };
  },
);
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
await app.listen({ host: "127.0.0.1", port: apiPort });
process.stdout.write(
  `Sanitized local HTTP provider browser smoke ready on ${apiPort}; extraction ${syntheticExtraction ? "synthetic HTTP only" : "disabled"}. No real provider requests or charges.\n`,
);
