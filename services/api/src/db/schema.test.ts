import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "./migrate.js";

const connectionString = process.env.TEST_DATABASE_URL;
describe.skipIf(!connectionString)("PostgreSQL identity constraints", () => {
  let pool: pg.Pool;
  beforeAll(async () => {
    if (!connectionString) throw new Error("TEST_DATABASE_URL required");
    await migrate(connectionString);
    await migrate(connectionString);
    pool = new pg.Pool({ connectionString });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("enforces normalized unique email and cascades connection deletion", async () => {
    const userId = randomUUID();
    const email = `${userId}@example.test`;
    const envelope = `v1:${"a".repeat(16)}:${"b".repeat(22)}:ciphertext`;
    await expect(
      pool.query("INSERT INTO users(email, display_name) VALUES ($1, 'Test')", [
        email.toUpperCase(),
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      "INSERT INTO users(id,email,display_name) VALUES ($1,$2,'Test')",
      [userId, email],
    );
    try {
      await expect(
        pool.query(
          "INSERT INTO users(email,display_name) VALUES ($1,'Duplicate')",
          [email],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await pool.query(
        "INSERT INTO google_connections(user_id,google_subject,access_token_encrypted,access_token_expires_at,scopes) VALUES ($1,$2,$3,now()+interval '1 hour',ARRAY['openid'])",
        [userId, userId, envelope],
      );
      await expect(
        pool.query(
          "UPDATE google_connections SET access_token_encrypted='plaintext' WHERE user_id=$1",
          [userId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    }
    expect(
      (
        await pool.query("SELECT id FROM google_connections WHERE user_id=$1", [
          userId,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("enforces state format, expiry, and conditional single-use consumption", async () => {
    const hash = randomUUID().replaceAll("-", "").repeat(2);
    const envelope = `v1:${"a".repeat(16)}:${"b".repeat(22)}:ciphertext`;
    await expect(
      pool.query(
        "INSERT INTO oauth_states(state_hash,browser_binding_hash,nonce_hash,pkce_verifier_encrypted,expires_at) VALUES ($1,$1,$1,$2,now()-interval '1 second')",
        [hash, envelope],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      "INSERT INTO oauth_states(state_hash,browser_binding_hash,nonce_hash,pkce_verifier_encrypted,expires_at) VALUES ($1,$1,$1,$2,now()+interval '5 minutes')",
      [hash, envelope],
    );
    try {
      const consume = () =>
        pool.query(
          "UPDATE oauth_states SET consumed_at=now() WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING state_hash",
          [hash],
        );
      const results = await Promise.all([consume(), consume()]);
      expect(results.map((result) => result.rowCount).sort()).toEqual([0, 1]);
    } finally {
      await pool.query("DELETE FROM oauth_states WHERE state_hash=$1", [hash]);
    }
  });
});
