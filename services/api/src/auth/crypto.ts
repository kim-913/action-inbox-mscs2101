import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function equalHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function csrfToken(credential: string): string {
  return createHash("sha256").update(`csrf:${credential}`).digest("base64url");
}

/** The envelope is v1:96-bit IV:128-bit tag:ciphertext, using unpadded base64url. */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    const key = Buffer.from(secret, "base64");
    if (key.length !== 32 || key.toString("base64") !== secret) {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
      );
    }
    this.key = key;
  }

  encrypt(value: string, identity: string, purpose: string): string {
    if (!value) throw new Error("Cannot encrypt an empty credential.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(["v1", identity, purpose])));
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(":");
  }

  decrypt(envelope: string, identity: string, purpose: string): string {
    if (
      !/^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/.test(envelope)
    ) {
      throw new Error("Invalid encrypted credential.");
    }
    const parts = envelope.split(":");
    const iv = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAAD(Buffer.from(JSON.stringify(["v1", identity, purpose])));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("Invalid encrypted credential.");
    }
  }
}
