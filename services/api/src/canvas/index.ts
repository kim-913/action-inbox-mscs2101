import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import {
  canvasConnectRequestSchema,
  canvasConnectionSchema,
  canvasItemSchema,
  canvasItemsQuerySchema,
  canvasItemsResponseSchema,
  canvasRoutes,
  emptyRequestSchema,
  type ApiError,
  type CanvasConnection,
  type CanvasItem,
} from "@action-inbox/contracts";
import { TokenCipher } from "../auth/crypto.js";
import { parse, transaction } from "../domain/store.js";
import { ApiFailure, authenticatedUser, type Runtime } from "../runtime.js";
import {
  fetchCanvasFeed,
  validateCanvasFeedUrl,
  type CanvasFeedReader,
} from "./feed.js";
import { canvasInRange, filterKey } from "../domain/display-window.js";

const coverage =
  "Only the items exposed by Canvas's bounded calendar feed, typically 30 days past and 366 days ahead; not complete coursework. This app rejects snapshots over 1,000 items rather than truncating them, retaining the last successful import. Undated assignments and To Do items may be absent. No grades, submissions or completion status; date-only assignments have no exact due time. Refresh is manual.";
const metadataColumns =
  "id, status, jsonb_array_length(snapshot) AS item_count, last_successful_fetch_at, error";

interface ConnectionMetadata extends pg.QueryResultRow {
  id: string;
  status: "Refreshing" | "Ready" | "Failed";
  item_count: number;
  last_successful_fetch_at: Date | null;
  error: ApiError | null;
}
interface RefreshOperation extends pg.QueryResultRow {
  id: string;
  refresh_token: string;
  encrypted_feed_url: string;
}
interface Snapshot extends pg.QueryResultRow {
  id: string;
  snapshot: CanvasItem[];
  snapshot_revision: string | null;
  last_successful_fetch_at: Date | null;
}

function serializeConnection(row?: ConnectionMetadata): CanvasConnection {
  return canvasConnectionSchema.parse({
    connected: Boolean(row),
    host: "sofia.instructure.com",
    status: row?.status ?? "Disconnected",
    itemCount: row?.item_count ?? 0,
    lastSuccessfulFetchAt: row?.last_successful_fetch_at?.toISOString() ?? null,
    error: row?.error ?? null,
    refreshPolicy: "Manual",
    coverage,
  });
}

function changed(): never {
  throw new ApiFailure(
    409,
    "CONFLICT",
    "The Canvas subscription or snapshot changed. Reload and try again.",
  );
}

function safeFeedError(error: unknown, requestId: string): ApiError {
  return error instanceof ApiFailure && error.code === "CANVAS_FEED_INVALID"
    ? {
        code: "CANVAS_FEED_INVALID",
        message:
          "Canvas did not return a supported calendar feed. Check the subscription and try again.",
        requestId,
      }
    : {
        code: "CANVAS_UNAVAILABLE",
        message:
          "The Canvas calendar feed is unavailable. Try refreshing again later.",
        requestId,
      };
}

function cipher(runtime: Runtime): TokenCipher {
  try {
    return new TokenCipher(runtime.config.tokenEncryptionKey ?? "");
  } catch {
    throw new ApiFailure(
      503,
      "CANVAS_UNAVAILABLE",
      "The Canvas subscription is unavailable. Try again later.",
    );
  }
}

function connectionIdentity(userId: string, connectionId: string): string {
  return JSON.stringify([connectionId, userId]);
}

const snapshotSchema = z.array(canvasItemSchema).max(1000);
function validatedSnapshot(input: CanvasItem[]): CanvasItem[] {
  const result = snapshotSchema.safeParse(input);
  if (!result.success)
    throw new ApiFailure(
      502,
      "CANVAS_FEED_INVALID",
      "Invalid Canvas snapshot.",
    );
  const items = result.data;
  items.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  for (let index = 1; index < items.length; index++) {
    if (items[index - 1]!.id === items[index]!.id)
      throw new ApiFailure(
        502,
        "CANVAS_FEED_INVALID",
        "Invalid Canvas snapshot.",
      );
  }
  return items;
}

const cursorSchema = z.strictObject({
  connectionId: z.uuid(),
  revision: z.uuid(),
  id: z.string().min(1),
  filter: z.string().length(64),
});
function decodeCursor(cursor?: string): z.infer<typeof cursorSchema> | null {
  if (cursor === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid cursor");
    return cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    throw new ApiFailure(400, "INVALID_REQUEST", "The page cursor is invalid.");
  }
}

export function registerCanvas(
  app: FastifyInstance,
  runtime: Runtime,
  readFeed: CanvasFeedReader = fetchCanvasFeed,
): void {
  // No transaction or user lock spans the network request. Both the connection
  // identity and operation generation must still match when it completes.
  async function refresh(
    userId: string,
    operation: RefreshOperation,
    requestId: string,
  ): Promise<CanvasConnection> {
    let snapshot: CanvasItem[] = [];
    let error: ApiError | null = null;
    try {
      const feedUrl = validateCanvasFeedUrl(
        cipher(runtime).decrypt(
          operation.encrypted_feed_url,
          connectionIdentity(userId, operation.id),
          "canvas-feed",
        ),
      );
      snapshot = validatedSnapshot(await readFeed(feedUrl));
    } catch (failure) {
      error = safeFeedError(failure, requestId);
    }
    return transaction(runtime, userId, async (client) => {
      const result = error
        ? await client.query<ConnectionMetadata>(
            `UPDATE canvas_connections SET status='Failed', error=$4::jsonb, updated_at=now()
             WHERE user_id=$1 AND id=$2 AND refresh_token=$3 RETURNING ${metadataColumns}`,
            [
              userId,
              operation.id,
              operation.refresh_token,
              JSON.stringify(error),
            ],
          )
        : await client.query<ConnectionMetadata>(
            `UPDATE canvas_connections SET status='Ready', snapshot=$4::jsonb,
             snapshot_revision=$5, last_successful_fetch_at=now(), error=NULL, updated_at=now()
             WHERE user_id=$1 AND id=$2 AND refresh_token=$3 RETURNING ${metadataColumns}`,
            [
              userId,
              operation.id,
              operation.refresh_token,
              JSON.stringify(snapshot),
              randomUUID(),
            ],
          );
      return serializeConnection(result.rows[0] ?? changed());
    });
  }

  app.get(
    canvasRoutes.connection,
    { preHandler: runtime.requireUser },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const userId = authenticatedUser(request);
      return transaction(runtime, userId, async (client) => {
        const result = await client.query<ConnectionMetadata>(
          `SELECT ${metadataColumns} FROM canvas_connections WHERE user_id=$1`,
          [userId],
        );
        return serializeConnection(result.rows[0]);
      });
    },
  );

  app.post(
    canvasRoutes.connection,
    { preHandler: runtime.requireUser },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const userId = authenticatedUser(request);
      const { feedUrl: input } = parse(
        canvasConnectRequestSchema,
        request.body,
      );
      let feedUrl: string;
      try {
        feedUrl = validateCanvasFeedUrl(input);
      } catch {
        throw new ApiFailure(
          400,
          "CANVAS_FEED_INVALID",
          "Use your Sofia Canvas calendar subscription URL.",
        );
      }
      const operation = await transaction(runtime, userId, async (client) => {
        const existing = await client.query(
          "SELECT id FROM canvas_connections WHERE user_id=$1",
          [userId],
        );
        if (existing.rowCount) changed();
        const id = randomUUID();
        const encrypted = cipher(runtime).encrypt(
          feedUrl,
          connectionIdentity(userId, id),
          "canvas-feed",
        );
        const result = await client.query<RefreshOperation>(
          `INSERT INTO canvas_connections(id, user_id, encrypted_feed_url, refresh_token)
           VALUES($1,$2,$3,$4) RETURNING id, encrypted_feed_url, refresh_token`,
          [id, userId, encrypted, randomUUID()],
        );
        return result.rows[0]!;
      });
      return refresh(userId, operation, request.id);
    },
  );

  app.post(
    canvasRoutes.refresh,
    { preHandler: runtime.requireUser },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      parse(emptyRequestSchema, request.body ?? {});
      const userId = authenticatedUser(request);
      const operation = await transaction(runtime, userId, async (client) => {
        const result = await client.query<RefreshOperation>(
          `UPDATE canvas_connections SET refresh_token=$2, status='Refreshing', error=NULL, updated_at=now()
           WHERE user_id=$1 RETURNING id, encrypted_feed_url, refresh_token`,
          [userId, randomUUID()],
        );
        return result.rows[0] ?? changed();
      });
      return refresh(userId, operation, request.id);
    },
  );

  app.get(
    canvasRoutes.items,
    { preHandler: runtime.requireUser },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const userId = authenticatedUser(request);
      const query = parse(canvasItemsQuerySchema, request.query);
      const cursor = decodeCursor(query.cursor);
      const filter = filterKey(userId, query);
      return transaction(runtime, userId, async (client) => {
        const result = await client.query<Snapshot>(
          "SELECT id, snapshot, snapshot_revision, last_successful_fetch_at FROM canvas_connections WHERE user_id=$1",
          [userId],
        );
        const row = result.rows[0];
        if (
          cursor &&
          (!row ||
            row.id !== cursor.connectionId ||
            row.snapshot_revision !== cursor.revision)
        )
          changed();
        if (cursor && cursor.filter !== filter)
          throw new ApiFailure(
            400,
            "INVALID_REQUEST",
            "The page cursor does not match these filters.",
          );
        const snapshot = (row?.snapshot ?? []).filter((item) =>
          canvasInRange(item, query),
        );
        let start = 0;
        if (cursor) {
          const previous = snapshot.findIndex((item) => item.id === cursor.id);
          if (previous === -1)
            throw new ApiFailure(
              400,
              "INVALID_REQUEST",
              "The page cursor is invalid.",
            );
          start = previous + 1;
        }
        const items = snapshot.slice(start, start + query.limit);
        const last = items.at(-1);
        const nextCursor =
          last && start + items.length < snapshot.length
            ? Buffer.from(
                JSON.stringify({
                  connectionId: row!.id,
                  revision: row!.snapshot_revision,
                  id: last.id,
                  filter,
                }),
              ).toString("base64url")
            : null;
        return canvasItemsResponseSchema.parse({
          items,
          nextCursor,
          lastSuccessfulFetchAt:
            row?.last_successful_fetch_at?.toISOString() ?? null,
        });
      });
    },
  );

  app.delete(
    canvasRoutes.connection,
    { preHandler: runtime.requireUser },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const userId = authenticatedUser(request);
      await transaction(runtime, userId, async (client) => {
        await client.query("DELETE FROM canvas_connections WHERE user_id=$1", [
          userId,
        ]);
      });
      return { ok: true };
    },
  );
}
