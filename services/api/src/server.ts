import pg from "pg";
import { buildApp } from "./app.js";
import { readConfiguration } from "./config.js";
import { migrate } from "./db/migrate.js";

try {
  const { config, host, port, databaseUrl } = readConfiguration(process.env);
  const pool = databaseUrl
    ? new pg.Pool({ connectionString: databaseUrl })
    : undefined;
  if (databaseUrl) await migrate(databaseUrl);
  const app = buildApp({ config, ...(pool ? { pool } : {}) });
  if (pool)
    app.addHook("onClose", async () => {
      await pool.end();
    });
  process.once("SIGINT", () => {
    void app.close();
  });
  process.once("SIGTERM", () => {
    void app.close();
  });
  try {
    await app.listen({ host, port });
    process.stdout.write(
      databaseUrl
        ? "Action Inbox API listening with database.\n"
        : "Action Inbox API listening (health only; DATABASE_URL not configured).\n",
    );
  } catch {
    await app.close();
    throw new Error("API startup failed");
  }
} catch {
  process.stderr.write(
    "API startup failed. Check deployment configuration and database connectivity; private details are not logged.\n",
  );
  process.exitCode = 1;
}
