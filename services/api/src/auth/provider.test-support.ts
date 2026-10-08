/** Test-only real loopback HTTP OAuth seam. Never imported by production composition. */
import { createHash, randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { ServerConfig } from "../runtime.js";
import { GOOGLE_SCOPES } from "./google.js";

export interface TestAuthorization {
  nonce: string;
  challenge: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  issuer: string;
  audience: string;
}
export interface GoogleTestState {
  authorizations: Map<string, TestAuthorization>;
  accessSubjects: Map<string, string>;
  refreshes: number;
  revocations: number;
  revokeFails: boolean;
  revokeResponse:
    | "normal"
    | "lose-success"
    | "invalid-token"
    | "other-400"
    | "malformed-400"
    | "oversized-400";
  exchangeCalls: number;
  refreshSubject: string;
}
export interface GoogleTestProvider {
  app: FastifyInstance;
  origin: string;
  config: Pick<
    ServerConfig,
    | "googleClientId"
    | "googleClientSecret"
    | "googleRedirectUri"
    | "googleAllowedEmails"
    | "googleAuthorizationUrl"
    | "googleTokenUrl"
    | "googleUserInfoUrl"
    | "googleJwksUrl"
    | "googleRevokeUrl"
  >;
  state: GoogleTestState;
}

export async function createGoogleTestProvider(options: {
  email: string;
  subject: string;
  redirectUri: string;
  configure?: (app: FastifyInstance) => void | Promise<void>;
}): Promise<GoogleTestProvider> {
  const callback = new URL(options.redirectUri);
  if (
    callback.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname) ||
    callback.pathname !== "/v1/auth/google/callback"
  ) {
    throw new Error(
      "The synthetic provider requires a loopback HTTP OAuth callback.",
    );
  }
  const state: GoogleTestState = {
    authorizations: new Map(),
    accessSubjects: new Map(),
    refreshes: 0,
    revocations: 0,
    revokeFails: false,
    revokeResponse: "normal",
    exchangeCalls: 0,
    refreshSubject: options.subject,
  };
  const keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  const app = Fastify({ logger: false });
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, new URLSearchParams(String(body)));
    },
  );
  app.get("/jwks", () => ({
    keys: [{ ...jwk, kid: "local-test", alg: "RS256", use: "sig" }],
  }));
  app.get("/authorize", (request, reply) => {
    const query = request.query as Record<string, unknown>;
    if (
      query.client_id !== "local-web-client" ||
      query.redirect_uri !== options.redirectUri ||
      query.response_type !== "code" ||
      query.code_challenge_method !== "S256" ||
      typeof query.state !== "string" ||
      typeof query.nonce !== "string" ||
      typeof query.code_challenge !== "string"
    )
      return reply.code(400).send({ error: "invalid_request" });
    const code = randomUUID();
    state.authorizations.set(code, {
      nonce: query.nonce,
      challenge: query.code_challenge,
      subject: options.subject,
      email: options.email,
      emailVerified: true,
      issuer: "https://accounts.google.com",
      audience: "local-web-client",
    });
    const destination = new URL(options.redirectUri);
    destination.searchParams.set("code", code);
    destination.searchParams.set("state", query.state);
    return reply.code(303).redirect(destination.toString());
  });
  app.post("/token", async (request, reply) => {
    const form = request.body as URLSearchParams;
    if (
      form.get("client_id") !== "local-web-client" ||
      form.get("client_secret") !== "synthetic-client-secret"
    ) {
      return reply.code(400).send({ error: "invalid_client" });
    }
    if (form.get("grant_type") === "refresh_token") {
      state.refreshes++;
      const access = `synthetic-refresh-${randomUUID()}`;
      state.accessSubjects.set(access, state.refreshSubject);
      return { access_token: access, token_type: "Bearer", expires_in: 3600 };
    }
    state.exchangeCalls++;
    const authorization = state.authorizations.get(form.get("code") ?? "");
    const verifier = form.get("code_verifier") ?? "";
    if (
      !authorization ||
      form.get("redirect_uri") !== options.redirectUri ||
      createHash("sha256").update(verifier).digest("base64url") !==
        authorization.challenge
    ) {
      return reply.code(400).send({ error: "invalid_grant" });
    }
    state.authorizations.delete(form.get("code")!);
    const access = `synthetic-access-${randomUUID()}`;
    state.accessSubjects.set(access, authorization.subject);
    const idToken = await new SignJWT({
      nonce: authorization.nonce,
      email: authorization.email,
      email_verified: authorization.emailVerified,
      name: "Synthetic tester",
    })
      .setProtectedHeader({ alg: "RS256", kid: "local-test" })
      .setSubject(authorization.subject)
      .setIssuer(authorization.issuer)
      .setAudience(authorization.audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(keys.privateKey);
    return {
      access_token: access,
      refresh_token: "synthetic-refresh-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: GOOGLE_SCOPES.join(" "),
      id_token: idToken,
    };
  });
  app.get("/userinfo", (request, reply) => {
    const access = request.headers.authorization?.replace(/^Bearer /, "");
    const googleSubject = access && state.accessSubjects.get(access);
    return googleSubject
      ? { sub: googleSubject }
      : reply.code(401).send({ error: "synthetic-invalid-token" });
  });
  app.post("/revoke", (_request, reply) => {
    state.revocations++;
    if (state.revokeFails)
      return reply
        .code(500)
        .send({ error: "synthetic-private-provider-error" });
    if (state.revokeResponse === "lose-success") {
      state.revokeResponse = "invalid-token";
      reply.hijack();
      reply.raw.destroy();
      return reply;
    }
    if (state.revokeResponse === "invalid-token")
      return reply.code(400).send({ error: "invalid_token" });
    if (state.revokeResponse === "other-400")
      return reply.code(400).send({ error: "invalid_request" });
    if (state.revokeResponse === "malformed-400")
      return reply.code(400).type("application/json").send("{invalid");
    if (state.revokeResponse === "oversized-400")
      return reply
        .code(400)
        .send({ error: "invalid_token", description: "x".repeat(4096) });
    return reply.code(200).send({});
  });
  await options.configure?.(app);
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  return {
    app,
    origin,
    state,
    config: {
      googleClientId: "local-web-client",
      googleClientSecret: "synthetic-client-secret",
      googleRedirectUri: options.redirectUri,
      googleAllowedEmails: [options.email],
      googleAuthorizationUrl: `${origin}/authorize`,
      googleTokenUrl: `${origin}/token`,
      googleUserInfoUrl: `${origin}/userinfo`,
      googleJwksUrl: `${origin}/jwks`,
      googleRevokeUrl: `${origin}/revoke`,
    },
  };
}
