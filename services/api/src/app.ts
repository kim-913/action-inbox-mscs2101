import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthResponseSchema } from "@action-inbox/contracts";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const packageMetadata = z
  .object({ version: z.string().min(1) })
  .parse(
    JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ),
  );

export function buildApp(options: { webOrigin?: string } = {}) {
  const webOrigin = new URL(options.webOrigin ?? "http://127.0.0.1:5173")
    .origin;
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
    const invalid =
      error instanceof Error &&
      (("validation" in error && error.validation !== undefined) ||
        ("statusCode" in error && error.statusCode === 400));
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
