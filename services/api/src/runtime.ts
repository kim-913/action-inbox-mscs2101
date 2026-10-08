import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type pg from "pg";
import type { ApiError } from "@action-inbox/contracts";

export interface ServerConfig {
  webOrigin: string;
  production: boolean;
  tokenEncryptionKey?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  googleAllowedEmails: string[];
  googleAuthorizationUrl: string;
  googleTokenUrl: string;
  googleUserInfoUrl: string;
  googleJwksUrl: string;
  googleRevokeUrl: string;
  gmailBaseUrl: string;
  calendarBaseUrl: string;
  openaiApiKey?: string;
  openaiBaseUrl: string;
  openaiModel: string;
}

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiError["code"],
    message: string,
  ) {
    super(message);
  }
}

export interface GoogleGateway {
  request(userId: string, url: string, init?: RequestInit): Promise<unknown>;
  revoke(userId: string): Promise<void>;
}

export interface Runtime {
  pool: pg.Pool;
  config: ServerConfig;
  google: GoogleGateway;
  requireUser: preHandlerHookHandler;
}

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

export function authenticatedUser(request: FastifyRequest): string {
  if (!request.userId)
    throw new ApiFailure(401, "UNAUTHENTICATED", "Sign in to continue.");
  return request.userId;
}
