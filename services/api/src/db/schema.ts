import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    googleSubject: text("google_subject").unique(),
    displayName: text("display_name").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "users_email_normalized",
      sql`${table.email} = lower(btrim(${table.email})) AND length(${table.email}) > 3`,
    ),
    check("users_timezone_present", sql`length(btrim(${table.timezone})) > 0`),
    check(
      "users_google_subject_present",
      sql`${table.googleSubject} IS NULL OR length(${table.googleSubject}) > 0`,
    ),
  ],
);

export const googleConnections = pgTable(
  "google_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    googleSubject: text("google_subject").notNull().unique(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }).notNull(),
    scopes: text("scopes").array().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("google_subject_present", sql`length(${table.googleSubject}) > 0`),
    check(
      "google_access_envelope",
      sql`${table.accessTokenEncrypted} ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$'`,
    ),
    check(
      "google_refresh_envelope",
      sql`${table.refreshTokenEncrypted} IS NULL OR ${table.refreshTokenEncrypted} ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$'`,
    ),
    check("google_scopes_present", sql`cardinality(${table.scopes}) > 0`),
  ],
);

export const oauthStates = pgTable(
  "oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    browserBindingHash: text("browser_binding_hash").notNull(),
    pkceVerifierEncrypted: text("pkce_verifier_encrypted").notNull(),
    nonceHash: text("nonce_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "oauth_state_hash_sha256",
      sql`${table.stateHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "oauth_binding_hash_sha256",
      sql`${table.browserBindingHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "oauth_nonce_hash_sha256",
      sql`${table.nonceHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "oauth_pkce_envelope",
      sql`${table.pkceVerifierEncrypted} ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$'`,
    ),
    check("oauth_expiry_order", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "oauth_consumption_order",
      sql`${table.consumedAt} IS NULL OR (${table.consumedAt} >= ${table.createdAt} AND ${table.consumedAt} < ${table.expiresAt})`,
    ),
    index("oauth_states_expiry_idx").on(table.expiresAt),
  ],
);

export const browserSessions = pgTable(
  "browser_sessions",
  {
    sessionHash: text("session_hash").primaryKey(),
    csrfHash: text("csrf_hash").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "browser_session_hash_sha256",
      sql`${table.sessionHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "browser_csrf_hash_sha256",
      sql`${table.csrfHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "browser_session_expiry_order",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    index("browser_sessions_expiry_idx").on(table.expiresAt),
    index("browser_sessions_user_idx").on(table.userId),
  ],
);
