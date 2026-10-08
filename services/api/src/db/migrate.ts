import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

export async function migrate(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(2101001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = new URL(
      "../../../../database/migrations/",
      import.meta.url,
    );
    const names = (await readdir(directory))
      .filter((name) => /^\d+_[a-z_]+\.sql$/.test(name))
      .sort();
    for (const name of names) {
      const migration = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(migration).digest("hex");
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0]?.checksum !== checksum)
          throw new Error("Applied migration checksum mismatch");
        continue;
      }
      await client.query(migration);
      await client.query(
        "INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("/migrate.ts")) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    process.stderr.write("DATABASE_URL is required for migrations.\n");
    process.exitCode = 1;
  } else {
    try {
      await migrate(connectionString);
      process.stdout.write("Database migrations applied.\n");
    } catch {
      process.stderr.write(
        "Database migration failed; connection details are not logged.\n",
      );
      process.exitCode = 1;
    }
  }
}
