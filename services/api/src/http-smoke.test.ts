import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  sessionResponseSchema,
  taskSchema,
  tasksResponseSchema,
} from "@action-inbox/contracts";
import { buildApp } from "./app.js";
import { readConfiguration } from "./config.js";
import { migrate } from "./db/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("real local HTTP application smoke", () => {
  const users = [randomUUID(), randomUUID()];
  let pool: pg.Pool;
  let app: ReturnType<typeof buildApp>;
  let origin: string;
  const webOrigin = "http://127.0.0.1:5173";
  const browsers: { cookie: string; csrf: string }[] = [];
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL required");
    await migrate(databaseUrl);
    pool = new pg.Pool({ connectionString: databaseUrl });
    app = buildApp({
      pool,
      config: readConfiguration({ WEB_ORIGIN: webOrigin }).config,
    });
    origin = await app.listen({ host: "127.0.0.1", port: 0 });
    for (const userId of users) {
      await pool.query(
        "INSERT INTO users(id,email,display_name) VALUES($1,$2,'Anonymized HTTP tester')",
        [userId, `${userId}@example.test`],
      );
      const response = await fetch(`${origin}/v1/auth/session`);
      const session = sessionResponseSchema.parse(await response.json());
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      if (!cookie) throw new Error("Session cookie missing");
      const token = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
      await pool.query(
        "UPDATE browser_sessions SET user_id=$1 WHERE session_hash=$2",
        [userId, createHash("sha256").update(token).digest("hex")],
      );
      browsers.push({ cookie, csrf: session.csrfToken });
    }
  }, 30_000);
  afterAll(async () => {
    if (app) await app.close();
    if (pool) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [users]);
      await pool.end();
    }
  });

  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    browserIndex = 0,
    extra: Record<string, string> = {},
  ) {
    const browser = browsers[browserIndex];
    if (!browser) throw new Error("Test browser missing");
    return fetch(`${origin}${path}`, {
      method,
      headers: {
        cookie: browser.cookie,
        origin: webOrigin,
        "x-csrf-token": browser.csrf,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it("enforces CSRF and Origin over an actual listening HTTP server", async () => {
    const body = {
      requestId: randomUUID(),
      title: "Anonymized task",
      dueAt: null,
    };
    for (const headers of [
      { origin: "https://untrusted.example" },
      { "x-csrf-token": "wrong" },
    ]) {
      const response = await request("/v1/tasks", "POST", body, 0, headers);
      expect(response.status).toBe(403);
      expect(apiErrorSchema.safeParse(await response.json()).success).toBe(
        true,
      );
    }
  });

  it("creates once under concurrent retry, isolates ownership, and preserves lifecycle versions", async () => {
    const body = {
      requestId: randomUUID(),
      title: "Submit synthetic registration",
      dueAt: null,
    };
    const responses = await Promise.all([
      request("/v1/tasks", "POST", body),
      request("/v1/tasks", "POST", body),
    ]);
    const tasks = await Promise.all(
      responses.map(async (response) => {
        expect(response.status).toBe(201);
        return taskSchema.parse(await response.json());
      }),
    );
    const task = tasks[0];
    if (!task) throw new Error("Task missing");
    expect(tasks[1]?.id).toBe(task.id);
    const foreign = await request(
      `/v1/tasks/${task.id}`,
      "PATCH",
      { version: task.version, status: "Completed" },
      1,
    );
    expect(foreign.status).toBe(404);
    const completedResponse = await request(`/v1/tasks/${task.id}`, "PATCH", {
      version: task.version,
      status: "Completed",
    });
    expect(completedResponse.status).toBe(200);
    const completed = taskSchema.parse(await completedResponse.json());
    expect(completed.completedAt).not.toBeNull();
    const stale = await request(`/v1/tasks/${task.id}`, "PATCH", {
      version: task.version,
      title: "Stale edit",
    });
    expect(stale.status).toBe(409);
    const list = tasksResponseSchema.parse(
      await (await request("/v1/tasks")).json(),
    );
    expect(list.items.filter((value) => value.id === task.id)).toHaveLength(1);
    const foreignList = tasksResponseSchema.parse(
      await (await request("/v1/tasks", "GET", undefined, 1)).json(),
    );
    expect(foreignList.items.some((value) => value.id === task.id)).toBe(false);
  });

  it("rotates the opaque session and rejects the old cookie", async () => {
    const response = await request("/v1/auth/refresh", "POST", {});
    expect(response.status).toBe(200);
    const session = sessionResponseSchema.parse(await response.json());
    expect(session.authenticated).toBe(true);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const old = await request("/v1/tasks");
    expect(old.status).toBe(401);
  });
});
