import type { FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { ApiFailure, type ServerConfig } from "../runtime.js";
import { csrfToken, equalHash, randomSecret, sha256 } from "./crypto.js";

type Database = Pick<pg.Pool, "query"> | Pick<pg.PoolClient, "query">;
export interface Session {
  session_hash: string;
  csrf_hash: string;
  user_id: string | null;
  expires_at: Date;
}
export interface IssuedSession {
  credential: string;
  session: Session;
}

export function sessionCookieName(config: ServerConfig): string {
  return config.production ? "__Host-ai_session" : "ai_session";
}

export function clearSessionCookie(
  reply: FastifyReply,
  config: ServerConfig,
): void {
  reply.clearCookie(sessionCookieName(config), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.production,
  });
}

export function sendSessionCookie(
  reply: FastifyReply,
  config: ServerConfig,
  issued: IssuedSession,
): void {
  reply.setCookie(sessionCookieName(config), issued.credential, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.production,
    expires: issued.session.expires_at,
  });
  reply.header("Cache-Control", "no-store");
}

export function browserCredential(
  request: FastifyRequest,
  config: ServerConfig,
): string | undefined {
  const credential = request.cookies[sessionCookieName(config)];
  return credential && /^[A-Za-z0-9_-]{43}$/.test(credential)
    ? credential
    : undefined;
}

export async function findSession(
  db: Database,
  credential: string,
): Promise<Session | undefined> {
  const result = await db.query<Session>(
    "SELECT session_hash, csrf_hash, user_id, expires_at FROM browser_sessions WHERE session_hash = $1 AND expires_at > now()",
    [sha256(credential)],
  );
  return result.rows[0];
}

export async function issueSession(
  db: Database,
  userId: string | null,
): Promise<IssuedSession> {
  const credential = randomSecret();
  const result = await db.query<Session>(
    `INSERT INTO browser_sessions(session_hash, csrf_hash, user_id, expires_at)
     VALUES ($1, $2, $3, now() + interval '12 hours')
     RETURNING session_hash, csrf_hash, user_id, expires_at`,
    [sha256(credential), sha256(csrfToken(credential)), userId],
  );
  return { credential, session: result.rows[0]! };
}

/** Delete and replacement must share the caller's transaction. */
export async function rotateSession(
  db: Database,
  previousHash: string,
  userId: string | null,
): Promise<IssuedSession> {
  const removed = await db.query(
    "DELETE FROM browser_sessions WHERE session_hash = $1 AND expires_at > now() RETURNING session_hash",
    [previousHash],
  );
  if (removed.rowCount !== 1)
    throw new ApiFailure(401, "UNAUTHENTICATED", "Sign in to continue.");
  return issueSession(db, userId);
}

export async function requireSession(
  request: FastifyRequest,
  db: Database,
  config: ServerConfig,
  mutation: boolean,
): Promise<Session> {
  if (mutation && request.headers.origin !== config.webOrigin) {
    throw new ApiFailure(
      403,
      "CSRF_INVALID",
      "The request origin is not allowed.",
    );
  }
  const credential = browserCredential(request, config);
  const session = credential ? await findSession(db, credential) : undefined;
  if (!session)
    throw new ApiFailure(401, "UNAUTHENTICATED", "Sign in to continue.");
  if (mutation) {
    const token = request.headers["x-csrf-token"];
    if (
      typeof token !== "string" ||
      !equalHash(sha256(token), session.csrf_hash)
    ) {
      throw new ApiFailure(
        403,
        "CSRF_INVALID",
        "Refresh the page and try again.",
      );
    }
  }
  return session;
}

export async function sessionInfo(
  db: Database,
  issued: IssuedSession,
): Promise<unknown> {
  const result = issued.session.user_id
    ? await db.query<{
        id: string;
        email: string;
        display_name: string;
        timezone: string;
        google_connected: boolean;
      }>(
        `SELECT u.id, u.email, u.display_name, u.timezone,
      EXISTS(SELECT 1 FROM google_connections c WHERE c.user_id = u.id AND c.revoked_at IS NULL) AS google_connected
     FROM users u WHERE u.id = $1`,
        [issued.session.user_id],
      )
    : undefined;
  const user = result?.rows[0];
  return {
    authenticated: Boolean(user),
    user: user
      ? {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          timezone: user.timezone,
        }
      : null,
    csrfToken: csrfToken(issued.credential),
    expiresAt: issued.session.expires_at.toISOString(),
    googleConnected: user?.google_connected ?? false,
  };
}
