import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthResponseSchema } from "@action-inbox/contracts";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type pg from "pg";
import rateLimit from "@fastify/rate-limit";
import { apiErrorSchema } from "@action-inbox/contracts";
import { ApiFailure, type ServerConfig } from "./runtime.js";
import { registerAuth } from "./auth/index.js";
import { registerPipeline } from "./pipeline/index.js";
import { registerDomain } from "./domain/index.js";
import { registerCanvas } from "./canvas/index.js";
import type { CanvasFeedReader } from "./canvas/feed.js";

const packageMetadata = z
  .object({ version: z.string().min(1) })
  .parse(
    JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ),
  );

export function buildApp(
  options: {
    webOrigin?: string;
    pool?: pg.Pool;
    config?: ServerConfig;
    canvasFeedReader?: CanvasFeedReader;
  } = {},
) {
  const webOrigin = new URL(
    options.config?.webOrigin ?? options.webOrigin ?? "http://127.0.0.1:5173",
  ).origin;
  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID(),
    bodyLimit: 64 * 1024,
  });
  void app.register(cors, {
    origin: webOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
  });

  void app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: (request) => ({
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again shortly.",
      requestId: request.id,
    }),
  });
  if (options.pool && options.config) {
    const pool = options.pool;
    const config = options.config;
    void app.register(async (application) => {
      const { requireUser, google } = await registerAuth(
        application,
        pool,
        config,
        (client, userId) => pipeline.enqueue(client, userId),
      );
      const runtime = { pool, config, requireUser, google };
      const pipeline = await registerPipeline(application, runtime);
      application.addHook("onClose", async () => {
        await pipeline.close();
      });
      await registerDomain(application, runtime);
      await registerCanvas(application, runtime, options.canvasFeedReader);
    });
  }
  app.get(
    "/v1/health",
    {
      schema: { response: { 200: z.toJSONSchema(healthResponseSchema) } },
    },
    async () =>
      healthResponseSchema.parse({
        status: "ok",
        service: "action-inbox-api",
        timestamp: new Date().toISOString(),
        version: packageMetadata.version,
      }),
  );

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      code: "NOT_FOUND",
      message: "This resource does not exist.",
      requestId: request.id,
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiFailure) {
      return reply.code(error.status).send(
        apiErrorSchema.parse({
          code: error.code,
          message: error.message,
          requestId: request.id,
        }),
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 429
    ) {
      return reply.code(429).send({
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly.",
        requestId: request.id,
      });
    }
    const invalid =
      error instanceof z.ZodError ||
      (error instanceof Error &&
        (("validation" in error && error.validation !== undefined) ||
          ("statusCode" in error && error.statusCode === 400)));
    return reply.code(invalid ? 400 : 500).send({
      code: invalid ? "INVALID_REQUEST" : "INTERNAL_ERROR",
      message: invalid
        ? "Check the request and try again."
        : "The request could not be completed.",
      requestId: request.id,
    });
  });

  return app;
}
