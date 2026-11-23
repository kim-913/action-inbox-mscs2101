import { createCipheriv, randomBytes } from "node:crypto";
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

  it("reads existing v1 envelopes and keeps the 96-bit IV and 128-bit tag format", () => {
    const key = Buffer.alloc(32, 7);
    const iv = Buffer.alloc(12, 3);
    const legacy = createCipheriv("aes-256-gcm", key, iv);
    legacy.setAAD(
      Buffer.from(JSON.stringify(["v1", "connection-one", "google-refresh"])),
    );
    const ciphertext = Buffer.concat([
      legacy.update("synthetic-existing-token", "utf8"),
      legacy.final(),
    ]);
    const envelope = [
      "v1",
      iv.toString("base64url"),
      legacy.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(":");
    const cipher = new TokenCipher(key.toString("base64"));
    expect(cipher.decrypt(envelope, "connection-one", "google-refresh")).toBe(
      "synthetic-existing-token",
    );
    const [version, encodedIv, encodedTag, encodedBody] = cipher
      .encrypt("synthetic-new-token", "connection-one", "google-refresh")
      .split(":");
    expect(version).toBe("v1");
    expect(Buffer.from(encodedIv!, "base64url")).toHaveLength(12);
    expect(Buffer.from(encodedTag!, "base64url")).toHaveLength(16);
    expect(Buffer.from(encodedBody!, "base64url")).toHaveLength(
      Buffer.byteLength("synthetic-new-token"),
    );
  });

  it.each([4, 8, 12, 13, 14, 15, 17])(
    "rejects an envelope with a %i-byte authentication tag",
    (tagLength) => {
      const cipher = new TokenCipher(randomBytes(32).toString("base64"));
      const parts = cipher
        .encrypt("synthetic-token", "connection-one", "google-refresh")
        .split(":");
      const tag = Buffer.from(parts[2]!, "base64url");
      parts[2] = Buffer.concat([tag, Buffer.alloc(1)])
        .subarray(0, tagLength)
        .toString("base64url");
      expect(() =>
        cipher.decrypt(parts.join(":"), "connection-one", "google-refresh"),
      ).toThrow("Invalid encrypted credential.");
    },
  );

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
