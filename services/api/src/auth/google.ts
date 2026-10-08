import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import type pg from "pg";
import {
  ApiFailure,
  type GoogleGateway,
  type ServerConfig,
} from "../runtime.js";
import { equalHash, sha256, TokenCipher } from "./crypto.js";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}
interface Connection {
  id: string;
  user_id: string;
  google_subject: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  access_token_expires_at: Date;
  scopes: string[];
  revoked_at: Date | null;
}
export interface GoogleIdentity {
  subject: string;
  email: string;
  displayName: string;
}

export function connectionIdentity(
  connection: Pick<Connection, "id" | "user_id" | "google_subject">,
): string {
  return JSON.stringify([
    connection.id,
    connection.user_id,
    connection.google_subject,
  ]);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFailure(
      502,
      "GOOGLE_UNAVAILABLE",
      "Google returned an invalid response.",
    );
  }
  return value as Record<string, unknown>;
}

/** No provider body, URL, credential, or upstream exception crosses this boundary. */
async function providerFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      redirect: "error",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiFailure(
      504,
      "GOOGLE_UNAVAILABLE",
      "Google could not be reached. Try again.",
    );
  }
}

async function providerJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) {
      throw new ApiFailure(
        401,
        "GOOGLE_RECONNECT_REQUIRED",
        "Reconnect your Google account.",
      );
    }
    if (response.status === 429)
      throw new ApiFailure(
        429,
        "RATE_LIMITED",
        "Google is busy. Try again later.",
      );
    if (response.status === 404)
      throw new ApiFailure(
        404,
        "NOT_FOUND",
        "The Google resource was not found.",
      );
    if (response.status === 409)
      throw new ApiFailure(
        409,
        "CONFLICT",
        "The Google resource already exists.",
      );
    throw new ApiFailure(
      502,
      "GOOGLE_UNAVAILABLE",
      "Google could not complete the request. Try again.",
    );
  }
  if (response.status === 204) return null;
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new ApiFailure(
        504,
        "GOOGLE_UNAVAILABLE",
        "Google did not respond in time. Try again.",
      );
    }
    throw new ApiFailure(
      502,
      "GOOGLE_UNAVAILABLE",
      "Google returned an invalid response.",
    );
  }
}

export class GoogleProvider implements GoogleGateway {
  readonly cipher: TokenCipher | undefined;
  private readonly jwks: JWTVerifyGetKey | undefined;

  constructor(
    private readonly pool: pg.Pool,
    readonly config: ServerConfig,
  ) {
    if (
      config.googleClientId &&
      config.googleClientSecret &&
      config.googleRedirectUri
    ) {
      if (!config.tokenEncryptionKey)
        throw new Error("TOKEN_ENCRYPTION_KEY is required for Google OAuth.");
      this.cipher = new TokenCipher(config.tokenEncryptionKey);
      this.jwks = createRemoteJWKSet(new URL(config.googleJwksUrl), {
        timeoutDuration: 10_000,
      });
    }
  }

  requireConfigured(): TokenCipher {
    if (
      !this.cipher ||
      !this.config.googleClientId ||
      !this.config.googleClientSecret ||
      !this.config.googleRedirectUri
    ) {
      throw new ApiFailure(
        503,
        "PROVIDER_NOT_CONFIGURED",
        "Google connection is not configured.",
      );
    }
    return this.cipher;
  }

  private async tokens(parameters: URLSearchParams): Promise<Tokens> {
    this.requireConfigured();
    parameters.set("client_id", this.config.googleClientId!);
    parameters.set("client_secret", this.config.googleClientSecret!);
    const response = await providerFetch(this.config.googleTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: parameters,
    });
    if (response.status === 400) {
      await response.body?.cancel();
      throw new ApiFailure(
        401,
        "GOOGLE_RECONNECT_REQUIRED",
        "Reconnect your Google account.",
      );
    }
    const token = object(await providerJson(response));
    if (
      typeof token.access_token !== "string" ||
      !token.access_token ||
      typeof token.expires_in !== "number" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0 ||
      token.expires_in > 86400 ||
      typeof token.token_type !== "string" ||
      token.token_type.toLowerCase() !== "bearer" ||
      (token.refresh_token !== undefined &&
        (typeof token.refresh_token !== "string" || !token.refresh_token)) ||
      (token.id_token !== undefined && typeof token.id_token !== "string") ||
      (token.scope !== undefined && typeof token.scope !== "string")
    ) {
      throw new ApiFailure(
        502,
        "GOOGLE_UNAVAILABLE",
        "Google returned an invalid response.",
      );
    }
    return token as unknown as Tokens;
  }

  async exchange(
    code: string,
    verifier: string,
    nonceHash: string,
  ): Promise<{ tokens: Tokens; identity: GoogleIdentity }> {
    const tokens = await this.tokens(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: this.config.googleRedirectUri!,
      }),
    );
    if (!tokens.id_token)
      throw new ApiFailure(
        401,
        "OAUTH_INVALID",
        "Google identity could not be verified.",
      );
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(tokens.id_token, this.jwks!, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: this.config.googleClientId!,
        algorithms: ["RS256"],
        requiredClaims: [
          "sub",
          "email",
          "email_verified",
          "nonce",
          "exp",
          "iat",
        ],
        maxTokenAge: "10m",
        clockTolerance: 5,
      }));
    } catch {
      throw new ApiFailure(
        401,
        "OAUTH_INVALID",
        "Google identity could not be verified.",
      );
    }
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      payload.email_verified !== true ||
      typeof payload.nonce !== "string" ||
      !equalHash(sha256(payload.nonce), nonceHash) ||
      (payload.azp !== undefined &&
        payload.azp !== this.config.googleClientId) ||
      (Array.isArray(payload.aud) &&
        payload.aud.length > 1 &&
        payload.azp !== this.config.googleClientId)
    ) {
      throw new ApiFailure(
        401,
        "OAUTH_INVALID",
        "Google identity could not be verified.",
      );
    }
    const email = payload.email.trim().toLowerCase();
    if (
      !this.config.googleAllowedEmails.some(
        (allowed) => allowed.trim().toLowerCase() === email,
      )
    ) {
      throw new ApiFailure(
        403,
        "FORBIDDEN",
        "This Google account is not approved for this application.",
      );
    }
    await this.verifyAccessIdentity(tokens.access_token, payload.sub);
    return {
      tokens,
      identity: {
        subject: payload.sub,
        email,
        displayName: typeof payload.name === "string" ? payload.name : email,
      },
    };
  }

  private async verifyAccessIdentity(
    accessToken: string,
    subject: string,
  ): Promise<void> {
    const data = object(
      await providerJson(
        await providerFetch(this.config.googleUserInfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    );
    if (data.sub !== subject)
      throw new ApiFailure(
        401,
        "OAUTH_INVALID",
        "Google account identity did not match.",
      );
  }

  private async accessToken(userId: string): Promise<string> {
    const cipher = this.requireConfigured();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // A row lock serializes refresh across workers/processes, not just this instance.
      const result = await client.query<Connection>(
        "SELECT * FROM google_connections WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      const connection = result.rows[0];
      if (!connection || connection.revoked_at)
        throw new ApiFailure(
          401,
          "GOOGLE_RECONNECT_REQUIRED",
          "Reconnect your Google account.",
        );
      const identity = connectionIdentity(connection);
      let accessToken: string;
      if (connection.access_token_expires_at.getTime() > Date.now() + 60_000) {
        accessToken = cipher.decrypt(
          connection.access_token_encrypted,
          identity,
          "google-access",
        );
      } else {
        if (!connection.refresh_token_encrypted)
          throw new ApiFailure(
            401,
            "GOOGLE_RECONNECT_REQUIRED",
            "Reconnect your Google account.",
          );
        const refreshed = await this.tokens(
          new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: cipher.decrypt(
              connection.refresh_token_encrypted,
              identity,
              "google-refresh",
            ),
          }),
        );
        await this.verifyAccessIdentity(
          refreshed.access_token,
          connection.google_subject,
        );
        accessToken = refreshed.access_token;
        const refreshEnvelope = refreshed.refresh_token
          ? cipher.encrypt(refreshed.refresh_token, identity, "google-refresh")
          : connection.refresh_token_encrypted;
        await client.query(
          `UPDATE google_connections SET access_token_encrypted = $2, refresh_token_encrypted = $3,
           access_token_expires_at = $4, scopes = $5, updated_at = now() WHERE id = $1`,
          [
            connection.id,
            cipher.encrypt(accessToken, identity, "google-access"),
            refreshEnvelope,
            new Date(Date.now() + refreshed.expires_in * 1000),
            refreshed.scope
              ? refreshed.scope.split(/\s+/).filter(Boolean)
              : connection.scopes,
          ],
        );
      }
      await client.query("COMMIT");
      return accessToken;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(
        502,
        "GOOGLE_UNAVAILABLE",
        "Google credentials could not be loaded. Reconnect your account.",
      );
    } finally {
      client.release();
    }
  }

  async request(
    userId: string,
    url: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new ApiFailure(400, "INVALID_REQUEST", "Invalid Google resource.");
    }
    const allowed = [
      this.config.gmailBaseUrl,
      this.config.calendarBaseUrl,
    ].some((baseUrl, index) => {
      const base = new URL(baseUrl);
      const prefix = base.pathname.replace(/\/$/, "");
      const relative = target.pathname.slice(prefix.length);
      return (
        target.origin === base.origin &&
        !target.username &&
        !target.password &&
        !target.hash &&
        target.pathname.startsWith(`${prefix}/`) &&
        !/%(?:2e|2f|5c|25)/i.test(target.pathname) &&
        (index === 0
          ? /^\/users\/me(?:\/|$)/.test(relative)
          : /^\/calendars\/primary\/events(?:\/|$)/.test(relative))
      );
    });
    if (!allowed)
      throw new ApiFailure(400, "INVALID_REQUEST", "Invalid Google resource.");
    const headers = new Headers(init.headers);
    headers.delete("Host");
    headers.set("Authorization", `Bearer ${await this.accessToken(userId)}`);
    return providerJson(
      await providerFetch(target.toString(), { ...init, headers }),
    );
  }

  async revoke(userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<Connection>(
        "SELECT * FROM google_connections WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      const connection = result.rows[0];
      if (connection && !connection.revoked_at) {
        const cipher = this.requireConfigured();
        const identity = connectionIdentity(connection);
        const token = connection.refresh_token_encrypted
          ? cipher.decrypt(
              connection.refresh_token_encrypted,
              identity,
              "google-refresh",
            )
          : cipher.decrypt(
              connection.access_token_encrypted,
              identity,
              "google-access",
            );
        const response = await providerFetch(this.config.googleRevokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
        let alreadyRevoked = false;
        if (response.status === 400 && response.body) {
          // A lost successful revocation response is retried with an invalid token.
          // Only Google's definitive error permits local deletion; bound all parsing.
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let bytes = 0;
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) {
                const body: unknown = JSON.parse(
                  Buffer.concat(chunks, bytes).toString("utf8"),
                );
                alreadyRevoked =
                  body !== null &&
                  typeof body === "object" &&
                  !Array.isArray(body) &&
                  "error" in body &&
                  body.error === "invalid_token";
                break;
              }
              bytes += chunk.value.byteLength;
              if (bytes > 4096) break;
              chunks.push(chunk.value);
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
        }
        if (!response.ok && !alreadyRevoked) {
          await response.body?.cancel();
          throw new ApiFailure(
            502,
            "GOOGLE_UNAVAILABLE",
            "Google access could not be revoked. Try again.",
          );
        }
        await response.body?.cancel();
        await client.query(
          "UPDATE google_connections SET revoked_at = now(), updated_at = now() WHERE id = $1",
          [connection.id],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(
        502,
        "GOOGLE_UNAVAILABLE",
        "Google access could not be revoked. Try again.",
      );
    } finally {
      client.release();
    }
  }
}
