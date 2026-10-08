import { describe, expect, it } from "vitest";
import { readConfiguration } from "./config.js";

describe("deployment boundaries", () => {
  it("pins real provider endpoints and allows explicit local development origins", () => {
    const { config } = readConfiguration({
      WEB_ORIGIN: "http://127.0.0.1:5173",
    });
    expect(config.googleTokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(
      readConfiguration({ OPENAI_API_KEY: "synthetic-test-key" }).config
        .openaiApiKey,
    ).toBeUndefined();
    expect(
      readConfiguration({
        OPENAI_ENABLED: "true",
        OPENAI_API_KEY: "synthetic-test-key",
      }).config.openaiApiKey,
    ).toBe("synthetic-test-key");
    expect(config.openaiBaseUrl).toBe("https://api.openai.com/v1");
    expect(config.googleAllowedEmails).toEqual([]);
  });
  it.each([
    "https://app.example/path",
    "https://app.example/",
    "ftp://app.example",
  ])("rejects non-origin %s", (WEB_ORIGIN) => {
    expect(() => readConfiguration({ WEB_ORIGIN })).toThrow();
  });
  it("requires HTTPS outside local development and fixes the callback path", () => {
    expect(() =>
      readConfiguration({
        NODE_ENV: "production",
        WEB_ORIGIN: "http://app.example",
      }),
    ).toThrow();
    expect(() =>
      readConfiguration({ GOOGLE_REDIRECT_URI: "https://api.example/evil" }),
    ).toThrow();
    expect(() =>
      readConfiguration({
        GOOGLE_REDIRECT_URI: "http://api.example/v1/auth/google/callback",
      }),
    ).toThrow();
    expect(() =>
      readConfiguration({
        GOOGLE_REDIRECT_URI: "http://127.0.0.1:3000/v1/auth/google/callback",
      }),
    ).not.toThrow();
  });
  it("normalizes an explicit identity allowlist, rejecting wildcards", () => {
    expect(
      readConfiguration({ GOOGLE_ALLOWED_EMAILS: "  TEST@EXAMPLE.TEST " })
        .config.googleAllowedEmails,
    ).toEqual(["test@example.test"]);
    expect(() => readConfiguration({ GOOGLE_ALLOWED_EMAILS: "*" })).toThrow();
  });
});
