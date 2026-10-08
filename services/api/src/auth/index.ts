import { createHash, randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import { emptyRequestSchema } from "@action-inbox/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type pg from "pg";
import {
  ApiFailure,
  type GoogleGateway,
  type ServerConfig,
} from "../runtime.js";
import { randomSecret, sha256 } from "./crypto.js";
import { connectionIdentity, GoogleProvider, GOOGLE_SCOPES } from "./google.js";
import {
  browserCredential,
  clearSessionCookie,
  findSession,
  issueSession,
  requireSession,
  rotateSession,
  sendSessionCookie,
  sessionInfo,
  type Session,
} from "./sessions.js";

export { clearSessionCookie } from "./sessions.js";

interface OAuthState {
  state_hash: string;
  pkce_verifier_encrypted: string;
  nonce_hash: string;
}
interface IdentityUser {
  id: string;
  google_subject: string | null;
}

export async function registerAuth(
  app: FastifyInstance,
  pool: pg.Pool,
  config: ServerConfig,
): Promise<{ requireUser: preHandlerHookHandler; google: GoogleGateway }> {
  if (!app.hasRequestDecorator("cookies")) await app.register(cookie);
  const google = new GoogleProvider(pool, config);
  const requireUser: preHandlerHookHandler = async (request) => {
    const session = await requireSession(
      request,
      pool,
      config,
      !["GET", "HEAD", "OPTIONS"].includes(request.method),
    );
    if (!session.user_id)
      throw new ApiFailure(401, "UNAUTHENTICATED", "Sign in to continue.");
    request.userId = session.user_id;
  };

  app.get("/v1/auth/session", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const credential = browserCredential(request, config);
    const session = credential
      ? await findSession(pool, credential)
      : undefined;
    const issued =
      session && credential
        ? { credential, session }
        : await issueSession(pool, null);
    if (!session) sendSessionCookie(reply, config, issued);
    return sessionInfo(pool, issued);
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const session = await requireSession(request, pool, config, true);
    emptyRequestSchema.parse(request.body ?? {});
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const issued = await rotateSession(
        client,
        session.session_hash,
        session.user_id,
      );
      const info = await sessionInfo(client, issued);
      await client.query("COMMIT");
      sendSessionCookie(reply, config, issued);
      return info;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const session = await requireSession(request, pool, config, true);
    emptyRequestSchema.parse(request.body ?? {});
    await pool.query("DELETE FROM browser_sessions WHERE session_hash = $1", [
      session.session_hash,
    ]);
    clearSessionCookie(reply, config);
    reply.header("Cache-Control", "no-store");
    return { ok: true };
  });

  app.post("/v1/auth/google/start", async (request, reply) => {
    const session = await requireSession(request, pool, config, true);
    emptyRequestSchema.parse(request.body ?? {});
    const cipher = google.requireConfigured();
    const state = randomSecret();
    const nonce = randomSecret();
    const verifier = randomSecret();
    const stateHash = sha256(state);
    await pool.query(
      `INSERT INTO oauth_states(state_hash, browser_binding_hash, pkce_verifier_encrypted, nonce_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
      [
        stateHash,
        session.session_hash,
        cipher.encrypt(verifier, stateHash, "oauth-pkce"),
        sha256(nonce),
      ],
    );
    const url = new URL(config.googleAuthorizationUrl);
    url.search = new URLSearchParams({
      client_id: config.googleClientId!,
      redirect_uri: config.googleRedirectUri!,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      state,
      nonce,
      access_type: "offline",
      prompt: "consent",
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    }).toString();
    reply.header("Cache-Control", "no-store");
    return { authorizationUrl: url.toString() };
  });

  app.get("/v1/auth/google/callback", async (request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer");
    const redirect = (outcome: "connected" | "denied" | "failed") => {
      const url = new URL(config.webOrigin);
      url.searchParams.set("auth", outcome);
      return reply.code(303).redirect(url.toString());
    };
    try {
      const cipher = google.requireConfigured();
      const query = request.query as Record<string, unknown>;
      const credential = browserCredential(request, config);
      if (
        !credential ||
        typeof query.state !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(query.state)
      )
        return redirect("failed");
      const session = await findSession(pool, credential);
      if (!session) return redirect("failed");
      // Consumption is committed before any network call. A denial also consumes state.
      const consumed = await pool.query<OAuthState>(
        `UPDATE oauth_states SET consumed_at = now()
         WHERE state_hash = $1 AND browser_binding_hash = $2 AND consumed_at IS NULL AND expires_at > now()
           AND EXISTS(SELECT 1 FROM browser_sessions WHERE session_hash = $2 AND expires_at > now())
         RETURNING state_hash, pkce_verifier_encrypted, nonce_hash`,
        [sha256(query.state), session.session_hash],
      );
      const state = consumed.rows[0];
      if (!state) return redirect("failed");
      if (query.error !== undefined)
        return redirect(query.error === "access_denied" ? "denied" : "failed");
      if (
        typeof query.code !== "string" ||
        !query.code ||
        query.code.length > 4096
      )
        return redirect("failed");
      const verifier = cipher.decrypt(
        state.pkce_verifier_encrypted,
        state.state_hash,
        "oauth-pkce",
      );
      const { tokens, identity } = await google.exchange(
        query.code,
        verifier,
        state.nonce_hash,
      );
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Lock the durable identity before session/connection to agree with account deletion.
        let user: IdentityUser | undefined;
        if (session.user_id) {
          user = (
            await client.query<IdentityUser>(
              "SELECT id, google_subject FROM users WHERE id = $1 FOR UPDATE",
              [session.user_id],
            )
          ).rows[0];
          if (!user || user.google_subject !== identity.subject) {
            throw new ApiFailure(
              403,
              "OAUTH_INVALID",
              "Google account identity did not match.",
            );
          }
        } else {
          user = (
            await client.query<IdentityUser>(
              "SELECT id, google_subject FROM users WHERE google_subject = $1 FOR UPDATE",
              [identity.subject],
            )
          ).rows[0];
          if (!user) {
            // Deliberately do not merge on email: Google subject is the account identity.
            user = (
              await client.query<IdentityUser>(
                "INSERT INTO users(email, display_name, google_subject) VALUES ($1, $2, $3) RETURNING id, google_subject",
                [identity.email, identity.displayName, identity.subject],
              )
            ).rows[0]!;
          }
        }
        const current = (
          await client.query<Session>(
            "SELECT session_hash, csrf_hash, user_id, expires_at FROM browser_sessions WHERE session_hash = $1 AND expires_at > now() FOR UPDATE",
            [session.session_hash],
          )
        ).rows[0];
        if (!current || current.user_id !== session.user_id)
          throw new ApiFailure(
            401,
            "OAUTH_INVALID",
            "The sign-in session has expired.",
          );
        const previous = (
          await client.query<{
            id: string;
            google_subject: string;
            refresh_token_encrypted: string | null;
            scopes: string[];
          }>(
            "SELECT id, google_subject, refresh_token_encrypted, scopes FROM google_connections WHERE user_id = $1 FOR UPDATE",
            [user.id],
          )
        ).rows[0];
        if (previous && previous.google_subject !== identity.subject)
          throw new ApiFailure(
            403,
            "OAUTH_INVALID",
            "Google account identity did not match.",
          );
        const connectionId = previous?.id ?? randomUUID();
        const aad = connectionIdentity({
          id: connectionId,
          user_id: user.id,
          google_subject: identity.subject,
        });
        const refreshEnvelope = tokens.refresh_token
          ? cipher.encrypt(tokens.refresh_token, aad, "google-refresh")
          : (previous?.refresh_token_encrypted ?? null);
        const scopes =
          tokens.scope?.split(/\s+/).filter(Boolean) ??
          previous?.scopes ??
          GOOGLE_SCOPES;
        if (
          !scopes.includes(GOOGLE_SCOPES[3]!) ||
          !scopes.includes(GOOGLE_SCOPES[4]!)
        ) {
          throw new ApiFailure(
            403,
            "OAUTH_INVALID",
            "Grant Gmail and Calendar access to connect your account.",
          );
        }
        await client.query(
          `INSERT INTO google_connections(id, user_id, google_subject, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, scopes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (user_id) DO UPDATE SET access_token_encrypted = EXCLUDED.access_token_encrypted,
             refresh_token_encrypted = EXCLUDED.refresh_token_encrypted, access_token_expires_at = EXCLUDED.access_token_expires_at,
             scopes = EXCLUDED.scopes, revoked_at = NULL, updated_at = now()`,
          [
            connectionId,
            user.id,
            identity.subject,
            cipher.encrypt(tokens.access_token, aad, "google-access"),
            refreshEnvelope,
            new Date(Date.now() + tokens.expires_in * 1000),
            scopes,
          ],
        );
        await client.query(
          "UPDATE users SET email = $2, display_name = $3, updated_at = now() WHERE id = $1",
          [user.id, identity.email, identity.displayName],
        );
        const issued = await rotateSession(
          client,
          session.session_hash,
          user.id,
        );
        await client.query("COMMIT");
        sendSessionCookie(reply, config, issued);
        return redirect("connected");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      return redirect(
        error instanceof ApiFailure && error.code === "FORBIDDEN"
          ? "denied"
          : "failed",
      );
    }
  });
  return { requireUser, google };
}
