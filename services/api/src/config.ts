import { z } from "zod";
import type { ServerConfig } from "./runtime.js";

const originSchema = z.url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && url.origin === value;
}, "An exact HTTP(S) origin is required");
const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: originSchema.default("http://127.0.0.1:5173"),
  DATABASE_URL: z.url().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  GOOGLE_ALLOWED_EMAILS: z.string().default(""),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_ENABLED: z.enum(["true", "false"]).default("false"),
});

export function readConfiguration(environment: NodeJS.ProcessEnv) {
  const values = environmentSchema.parse(environment);
  const production = values.NODE_ENV === "production";
  if (production && !values.WEB_ORIGIN.startsWith("https://")) {
    throw new Error("Production WEB_ORIGIN requires HTTPS");
  }
  if (values.GOOGLE_REDIRECT_URI) {
    const callback = new URL(values.GOOGLE_REDIRECT_URI);
    if (
      callback.pathname !== "/v1/auth/google/callback" ||
      callback.search ||
      callback.hash ||
      (callback.protocol !== "https:" &&
        !(
          !production &&
          callback.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(callback.hostname)
        ))
    ) {
      throw new Error("Invalid registered OAuth callback URL");
    }
  }
  const googleAllowedEmails = values.GOOGLE_ALLOWED_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  for (const email of googleAllowedEmails) z.email().parse(email);
  const config: ServerConfig = {
    webOrigin: values.WEB_ORIGIN,
    production,
    googleAllowedEmails,
    googleAuthorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    googleTokenUrl: "https://oauth2.googleapis.com/token",
    googleUserInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    googleJwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
    googleRevokeUrl: "https://oauth2.googleapis.com/revoke",
    gmailBaseUrl: "https://gmail.googleapis.com/gmail/v1",
    calendarBaseUrl: "https://www.googleapis.com/calendar/v3",
    openaiBaseUrl: "https://api.openai.com/v1",
    openaiModel: values.OPENAI_MODEL,
    ...(values.TOKEN_ENCRYPTION_KEY
      ? { tokenEncryptionKey: values.TOKEN_ENCRYPTION_KEY }
      : {}),
    ...(values.GOOGLE_CLIENT_ID
      ? { googleClientId: values.GOOGLE_CLIENT_ID }
      : {}),
    ...(values.GOOGLE_CLIENT_SECRET
      ? { googleClientSecret: values.GOOGLE_CLIENT_SECRET }
      : {}),
    ...(values.GOOGLE_REDIRECT_URI
      ? { googleRedirectUri: values.GOOGLE_REDIRECT_URI }
      : {}),
    ...(values.OPENAI_ENABLED === "true" && values.OPENAI_API_KEY
      ? { openaiApiKey: values.OPENAI_API_KEY }
      : {}),
  };
  return {
    config,
    host: values.API_HOST,
    port: values.API_PORT,
    databaseUrl: values.DATABASE_URL,
  };
}
