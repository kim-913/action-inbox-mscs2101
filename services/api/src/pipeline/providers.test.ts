import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ApiFailure, type GoogleGateway } from "../runtime.js";
import { GmailReader } from "./gmail.js";
import { OpenAIExtractor } from "./extractor.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});
async function provider(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Local server address missing");
  return `http://127.0.0.1:${address.port}`;
}
const google: GoogleGateway = {
  async request(_userId, url, init) {
    const response = await fetch(url, init);
    if (!response.ok)
      throw new ApiFailure(502, "GOOGLE_UNAVAILABLE", "Gmail is unavailable.");
    return response.json();
  },
  async revoke() {
    throw new Error("Revoke is outside this provider contract");
  },
};

describe("Gmail HTTP contract", () => {
  it("paginates within 100 and requests full normalized message bodies", async () => {
    const seen: string[] = [];
    const base = await provider((request, response) => {
      seen.push(request.url!);
      response.setHeader("content-type", "application/json");
      const url = new URL(request.url!, "http://localhost");
      if (url.pathname.endsWith("/messages/a")) {
        response.end(
          JSON.stringify({
            id: "a",
            threadId: "thread",
            internalDate: "1800000000000",
            payload: {
              mimeType: "text/plain",
              body: {
                data: Buffer.from("Please reply.").toString("base64url"),
              },
            },
          }),
        );
      } else if (url.searchParams.has("pageToken"))
        response.end(
          JSON.stringify({
            messages: Array.from({ length: 150 }, (_, index) => ({
              id: `m${index}`,
            })),
          }),
        );
      else
        response.end(
          JSON.stringify({ messages: [{ id: "a" }], nextPageToken: "second" }),
        );
    });
    const reader = new GmailReader(google, `${base}/gmail/v1`);
    expect(await reader.listRecent("user")).toHaveLength(100);
    expect((await reader.get("user", "a")).normalizedBody).toBe(
      "Please reply.",
    );
    const first = new URL(seen[0]!, base);
    expect(first.searchParams.get("q")).toBe("newer_than:14d");
    expect(first.searchParams.get("maxResults")).toBe("100");
    expect(new URL(seen[1]!, base).searchParams.get("maxResults")).toBe("99");
    expect(new URL(seen[2]!, base).searchParams.get("format")).toBe("full");
  });
  it("rejects broken pagination and does not expose provider errors", async () => {
    const base = await provider((_request, response) => {
      response.end(JSON.stringify({ nextPageToken: "loop" }));
    });
    await expect(
      new GmailReader(google, base).listRecent("user"),
    ).rejects.toMatchObject({ code: "GOOGLE_UNAVAILABLE" });
  });
});

describe("OpenAI Responses HTTP contract", () => {
  const input = {
    sender: "sender@example.invalid",
    subject: "Reading",
    receivedAt: "2026-10-01T12:00:00Z",
    timezone: "UTC",
    normalizedBody: "Optional reading.",
  };
  it("sends strict structured output, no tools, no storage, and accepts zero-action classifications", async () => {
    let received: Record<string, unknown> = {};
    const output = {
      category: "Read / Review",
      categoryConfidence: 0.99,
      actions: [],
    };
    const base = await provider((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += String(chunk);
      });
      request.on("end", () => {
        received = JSON.parse(body) as Record<string, unknown>;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            id: "resp_local",
            object: "response",
            created_at: 1,
            status: "completed",
            model: "local-contract",
            output: [
              {
                id: "msg_local",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(output),
                    annotations: [],
                  },
                ],
              },
            ],
          }),
        );
      });
    });
    expect(
      await new OpenAIExtractor(
        "local-test-key",
        `${base}/v1`,
        "local-contract",
      ).extract(input),
    ).toEqual(output);
    expect(received).toMatchObject({
      tools: [],
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
  });
  it.each([429, 500, 401])(
    "maps HTTP %i to a safe provider failure",
    async (status) => {
      const base = await provider((_request, response) => {
        response.statusCode = status;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({ error: { message: "private-provider-content" } }),
        );
      });
      const extractor = new OpenAIExtractor(
        "local-test-key",
        `${base}/v1`,
        "local-contract",
      );
      await expect(extractor.extract(input)).rejects.toMatchObject({
        code: "AI_UNAVAILABLE",
        message: "AI extraction could not complete. Retry synchronization.",
      });
    },
  );
  it("returns an explicit configuration failure instead of fake extraction", async () => {
    await expect(
      new OpenAIExtractor(
        undefined,
        "http://127.0.0.1:1",
        "local-contract",
      ).extract(input),
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
  });
  it("fails closed on malformed structured output", async () => {
    const base = await provider((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({ id: "resp_local", status: "completed", output: [] }),
      );
    });
    await expect(
      new OpenAIExtractor(
        "local-test-key",
        `${base}/v1`,
        "local-contract",
      ).extract(input),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});
