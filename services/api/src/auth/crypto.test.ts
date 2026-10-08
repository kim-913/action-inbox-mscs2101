import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { csrfToken, randomSecret, sha256, TokenCipher } from "./crypto.js";

describe("credential encryption and browser secrets", () => {
  it("matches the versioned database envelope and authenticates identity and purpose", () => {
    const cipher = new TokenCipher(randomBytes(32).toString("base64"));
    const envelope = cipher.encrypt(
      "synthetic-token",
      "connection-one",
      "google-refresh",
    );
    expect(envelope).toMatch(
      /^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/,
    );
    expect(envelope).not.toContain("synthetic-token");
    expect(cipher.decrypt(envelope, "connection-one", "google-refresh")).toBe(
      "synthetic-token",
    );
    expect(() =>
      cipher.decrypt(envelope, "connection-two", "google-refresh"),
    ).toThrow();
    expect(() =>
      cipher.decrypt(envelope, "connection-one", "google-access"),
    ).toThrow();
    const parts = envelope.split(":");
    for (const index of [1, 2, 3]) {
      const tampered = [...parts];
      const value = tampered[index]!;
      tampered[index] = `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
      expect(() =>
        cipher.decrypt(tampered.join(":"), "connection-one", "google-refresh"),
      ).toThrow();
    }
    expect(() =>
      cipher.decrypt(
        envelope.replace("v1:", "v2:"),
        "connection-one",
        "google-refresh",
      ),
    ).toThrow();
  });

  it("rejects invalid deployment keys and separates CSRF from the cookie credential", () => {
    expect(() => new TokenCipher("not-a-key")).toThrow();
    expect(() => new TokenCipher(randomBytes(16).toString("base64"))).toThrow();
    const credential = randomSecret();
    expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256(credential)).toMatch(/^[a-f0-9]{64}$/);
    expect(csrfToken(credential)).toHaveLength(43);
    expect(csrfToken(credential)).not.toBe(credential);
    expect(csrfToken(randomSecret())).not.toBe(csrfToken(credential));
  });
});
