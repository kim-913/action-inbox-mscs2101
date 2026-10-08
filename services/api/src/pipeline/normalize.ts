import { createHash } from "node:crypto";
import { convert } from "html-to-text";
import { z } from "zod";
import { ApiFailure } from "../runtime.js";

export const NORMALIZATION_VERSION = "mime-text-v1";
const MAX_BODY_BYTES = 1_000_000;
interface MimePart {
  mimeType?: string | undefined;
  filename?: string | undefined;
  headers?: { name: string; value: string }[] | undefined;
  body?:
    | {
        data?: string | undefined;
        attachmentId?: string | undefined;
        size?: number | undefined;
      }
    | undefined;
  parts?: MimePart[] | undefined;
}
const partSchema: z.ZodType<MimePart> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z
      .array(z.object({ name: z.string(), value: z.string() }))
      .optional(),
    body: z
      .object({
        data: z.string().optional(),
        attachmentId: z.string().optional(),
        size: z.number().optional(),
      })
      .optional(),
    parts: z.array(partSchema).optional(),
  }),
);
const messageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  internalDate: z.string().regex(/^\d+$/),
  payload: partSchema,
});
export interface NormalizedMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  normalizedBody: string;
  bodyHash: string;
}
export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\p{Cc}/gu, (character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code > 127 ? character : "";
    })
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function providerFailure(): never {
  throw new ApiFailure(
    502,
    "GOOGLE_UNAVAILABLE",
    "This message could not be read safely. Retry synchronization.",
  );
}
export function normalizeGmailMessage(input: unknown): NormalizedMessage {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return providerFailure();
  const message = parsed.data;
  let bytes = 0;
  let parts = 0;
  function text(part: MimePart, depth = 0): string {
    if (++parts > 200 || depth > 20) return providerFailure();
    const header = (name: string) =>
      part.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
    if (
      part.filename ||
      /\battachment\b/i.test(header("content-disposition")) ||
      part.body?.attachmentId
    )
      return "";
    if (part.mimeType?.toLowerCase() === "multipart/alternative") {
      const alternatives = part.parts ?? [];
      const plain = alternatives.find(
        (p) =>
          p.mimeType?.toLowerCase() === "text/plain" &&
          !p.filename &&
          !p.body?.attachmentId,
      );
      if (plain) {
        const value = text(plain, depth + 1);
        if (value.trim()) return value;
      }
      return alternatives
        .filter((p) => p !== plain)
        .map((p) => text(p, depth + 1))
        .filter(Boolean)
        .join("\n\n");
    }
    if (part.parts)
      return part.parts
        .map((p) => text(p, depth + 1))
        .filter(Boolean)
        .join("\n\n");
    const mime = part.mimeType?.toLowerCase();
    if (mime !== "text/plain" && mime !== "text/html") return "";
    const encoded = part.body?.data ?? "";
    if (
      encoded.length > Math.ceil((MAX_BODY_BYTES * 4) / 3) + 4 ||
      !/^[A-Za-z0-9_\-+/]*={0,2}$/.test(encoded)
    )
      return providerFailure();
    const decoded = Buffer.from(encoded, "base64url");
    bytes += decoded.length;
    if (bytes > MAX_BODY_BYTES) return providerFailure();
    const charset =
      /charset\s*=\s*["']?([^;\s"']+)/i.exec(header("content-type"))?.[1] ??
      "utf-8";
    let body: string;
    try {
      body = new TextDecoder(charset, { fatal: true }).decode(decoded);
    } catch {
      return providerFailure();
    }
    return mime === "text/html"
      ? convert(body, {
          wordwrap: false,
          selectors: [
            { selector: "a", options: { ignoreHref: true } },
            { selector: "img", format: "skip" },
            { selector: "script", format: "skip" },
            { selector: "style", format: "skip" },
          ],
        })
      : body;
  }
  const received = Number(message.internalDate);
  if (!Number.isFinite(received) || received < 0 || received > 8.64e15)
    return providerFailure();
  const normalizedBody = normalizeText(text(message.payload));
  const header = (name: string) =>
    message.payload.headers?.find((h) => h.name.toLowerCase() === name)
      ?.value ?? "";
  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    sender: normalizeText(header("from")),
    subject: normalizeText(header("subject")),
    receivedAt: new Date(received).toISOString(),
    normalizedBody,
    bodyHash: hashText(`${NORMALIZATION_VERSION}\n${normalizedBody}`),
  };
}
