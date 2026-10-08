import { describe, expect, it } from "vitest";
import {
  exactDeadline,
  extractionSchema,
  suggestionFingerprint,
  validateExtraction,
  type Extraction,
} from "./extractor.js";
import { normalizeGmailMessage, normalizeText } from "./normalize.js";

const body = "Please submit the form.\nDeadline: 2026-11-20T17:00:00Z.";
const extraction: Extraction = {
  category: "Action Required",
  categoryConfidence: 0.99,
  actions: [
    {
      title: "Submit the form",
      evidenceQuote: "Please submit the form.",
      deadlineQuote: "Deadline: 2026-11-20T17:00:00Z.",
      dueAt: "2026-11-20T17:00:00Z",
      deadlineCertainty: "Explicit",
      confidence: 0.99,
    },
  ],
};

describe("normalized source and exact evidence", () => {
  it("normalizes line endings and Unicode without dropping quoted source text", () => {
    expect(normalizeText("  Cafe\u0301\r\n\tPlease\u00a0reply.\u0000 ")).toBe(
      "Café\nPlease reply.",
    );
  });
  it("selects plain alternatives and never extracts attachments", () => {
    const encoded = (text: string) => Buffer.from(text).toString("base64url");
    const result = normalizeGmailMessage({
      id: "a",
      threadId: "t",
      internalDate: "1800000000000",
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              {
                mimeType: "text/html",
                body: { data: encoded("<p>Duplicate</p>") },
              },
              {
                mimeType: "text/plain",
                body: { data: encoded("Please reply.") },
              },
            ],
          },
          {
            mimeType: "text/plain",
            filename: "private.txt",
            body: { data: encoded("Attachment deadline") },
          },
        ],
      },
    });
    expect(result.normalizedBody).toBe("Please reply.");
    expect(result.bodyHash).toHaveLength(64);
  });
  it("decodes HTML entities and omits scripts/images", () => {
    const result = normalizeGmailMessage({
      id: "b",
      threadId: "t",
      internalDate: "1800000000000",
      payload: {
        mimeType: "text/html",
        body: {
          data: Buffer.from(
            "<p>Send A &amp; B.</p><script>steal()</script><img alt='not evidence'>",
          ).toString("base64url"),
        },
      },
    });
    expect(result.normalizedBody).toBe("Send A & B.");
  });
  it("rejects invalid source encoding rather than inventing replacement characters", () => {
    expect(() =>
      normalizeGmailMessage({
        id: "b",
        threadId: "t",
        internalDate: "1800000000000",
        payload: { mimeType: "text/plain", body: { data: "_w" } },
      }),
    ).toThrow();
  });
  it("computes exact UTF-16 offsets into the persisted body", () => {
    const result = validateExtraction(extraction, `📨\n${body}`);
    for (const action of result.actions) {
      expect(
        `📨\n${body}`.slice(action.evidence.start, action.evidence.end),
      ).toBe(action.evidence.quote);
      expect(action.deadlineEvidence!.start).toBeGreaterThan(
        action.evidence.end,
      );
    }
    expect(result.actions[0]?.dueAt).toBe("2026-11-20T17:00:00.000Z");
  });
  it("rejects hallucinated action and deadline evidence independently", () => {
    expect(() => validateExtraction(extraction, "No action here.")).toThrow();
    expect(() =>
      validateExtraction(extraction, "Please submit the form."),
    ).toThrow();
  });
  it("allows zero actions in Read / Review and Reference", () => {
    expect(
      validateExtraction(
        { category: "Reference", categoryConfidence: 1, actions: [] },
        "Receipt.",
      ).actions,
    ).toEqual([]);
    expect(
      validateExtraction(
        { category: "Read / Review", categoryConfidence: 1, actions: [] },
        "Optional reading.",
      ).actions,
    ).toEqual([]);
  });
  it("rejects unknown structured output fields", () => {
    expect(
      extractionSchema.safeParse({ ...extraction, tool: "sendEmail" }).success,
    ).toBe(false);
  });
});
describe("deadline and fingerprint safety", () => {
  it.each([
    "tomorrow at 5pm",
    "Friday",
    "11/12/26",
    "2026-11-20",
    "2026-11-20T17:00:00",
    "Maybe 2026-11-20T17:00:00Z",
    "Not 2026-11-20T17:00:00Z",
    "2026-02-30T17:00:00Z",
    "2026-11-20T17:00:00Z or 2026-11-21T17:00:00Z",
  ])("does not infer an exact date from %s", (quote) => {
    expect(exactDeadline(quote, "2026-11-20T17:00:00Z")).toBeNull();
  });
  it("rejects an invented date even when another exact date occurs", () => {
    expect(
      exactDeadline("Due 2026-11-20T17:00:00Z", "2026-11-21T17:00:00Z"),
    ).toBeNull();
  });
  it("clears unsupported exact dates and requests human review", () => {
    const result = validateExtraction(
      {
        ...extraction,
        actions: [{ ...extraction.actions[0]!, deadlineQuote: "tomorrow" }],
      },
      "Please submit the form. Due tomorrow.",
    );
    expect(result.actions[0]).toMatchObject({
      dueAt: null,
      deadlineCertainty: "Uncertain",
      needsReview: true,
    });
  });
  it("normalizes equivalent titles/timestamps but separates users and messages", () => {
    const first = suggestionFingerprint(
      "u",
      "m",
      "Submit  the FORM",
      "2026-11-20T18:00:00+01:00",
    );
    expect(first).toBe(
      suggestionFingerprint(
        "u",
        "m",
        " submit the form ",
        "2026-11-20T17:00:00Z",
      ),
    );
    expect(first).not.toBe(
      suggestionFingerprint(
        "v",
        "m",
        "submit the form",
        "2026-11-20T17:00:00Z",
      ),
    );
    expect(first).not.toBe(
      suggestionFingerprint(
        "u",
        "n",
        "submit the form",
        "2026-11-20T17:00:00Z",
      ),
    );
  });
});
