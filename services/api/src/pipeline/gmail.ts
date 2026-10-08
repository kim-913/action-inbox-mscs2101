import { z } from "zod";
import { ApiFailure, type GoogleGateway } from "../runtime.js";
import { normalizeGmailMessage, type NormalizedMessage } from "./normalize.js";

const pageSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1) })).optional(),
  nextPageToken: z.string().optional(),
});
export class GmailReader {
  constructor(
    private readonly google: GoogleGateway,
    private readonly baseUrl: string,
  ) {}
  async listRecent(userId: string): Promise<string[]> {
    const ids = new Set<string>();
    const tokens = new Set<string>();
    let pageToken: string | undefined;
    // A malicious or broken provider cannot cause unbounded empty-page traversal.
    for (let page = 0; page < 10 && ids.size < 100; page++) {
      const url = new URL(
        `${this.baseUrl.replace(/\/$/, "")}/users/me/messages`,
      );
      url.searchParams.set("q", "newer_than:14d");
      url.searchParams.set("maxResults", String(100 - ids.size));
      url.searchParams.set("includeSpamTrash", "false");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const result = pageSchema.safeParse(
        await this.google.request(userId, url.toString(), {
          signal: AbortSignal.timeout(20_000),
        }),
      );
      if (!result.success)
        throw new ApiFailure(
          502,
          "GOOGLE_UNAVAILABLE",
          "Gmail returned an unreadable message list. Retry synchronization.",
        );
      for (const message of result.data.messages ?? []) {
        if (ids.size < 100) ids.add(message.id);
      }
      pageToken = result.data.nextPageToken;
      if (!pageToken || ids.size === 100) return [...ids];
      if (tokens.has(pageToken)) break;
      tokens.add(pageToken);
    }
    if (pageToken && ids.size < 100)
      throw new ApiFailure(
        502,
        "GOOGLE_UNAVAILABLE",
        "Gmail pagination could not complete. Retry synchronization.",
      );
    return [...ids];
  }
  async get(userId: string, messageId: string): Promise<NormalizedMessage> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/users/me/messages/${encodeURIComponent(messageId)}?format=full`;
    const message = normalizeGmailMessage(
      await this.google.request(userId, url, {
        signal: AbortSignal.timeout(20_000),
      }),
    );
    if (message.gmailMessageId !== messageId)
      throw new ApiFailure(
        502,
        "GOOGLE_UNAVAILABLE",
        "Gmail returned an unexpected message. Retry synchronization.",
      );
    return message;
  }
}
