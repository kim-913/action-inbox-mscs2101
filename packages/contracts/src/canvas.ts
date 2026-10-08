import { z } from "zod";
import { apiErrorSchema, pageQuerySchema } from "./p0.js";
import { displayRangeShape, validDisplayRange } from "./display.js";

export const canvasDateSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    value: z.iso.date(),
    kind: z.literal("date"),
    timeZone: z.string().nullable(),
  }),
  z.strictObject({
    value: z.iso.datetime({ offset: true }),
    kind: z.literal("instant"),
    timeZone: z.string().nullable(),
  }),
]);
export const canvasItemSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["Assignment", "Event"]),
  title: z.string(),
  description: z.string(),
  sourceUrl: z.url().nullable(),
  start: canvasDateSchema.nullable(),
  end: canvasDateSchema.nullable(),
  cancelled: z.boolean(),
});
export const canvasConnectionSchema = z.strictObject({
  connected: z.boolean(),
  host: z.literal("sofia.instructure.com"),
  status: z.enum(["Disconnected", "Refreshing", "Ready", "Failed"]),
  itemCount: z.number().int().nonnegative(),
  lastSuccessfulFetchAt: z.iso.datetime().nullable(),
  error: apiErrorSchema.nullable(),
  refreshPolicy: z.literal("Manual"),
  coverage: z.string(),
});
export const canvasConnectRequestSchema = z.strictObject({
  feedUrl: z.string().min(1).max(2048),
});
export const canvasItemsQuerySchema = pageQuerySchema
  .extend(displayRangeShape)
  .refine(validDisplayRange, {
    message: "Provide all four ordered display bounds",
  });
export const canvasItemsResponseSchema = z.strictObject({
  items: z.array(canvasItemSchema),
  nextCursor: z.string().nullable(),
  lastSuccessfulFetchAt: z.iso.datetime().nullable(),
});
export const canvasRoutes = {
  connection: "/v1/canvas/connection",
  refresh: "/v1/canvas/refresh",
  items: "/v1/canvas/items",
} as const;
export type CanvasDate = z.infer<typeof canvasDateSchema>;
export type CanvasItem = z.infer<typeof canvasItemSchema>;
export type CanvasConnection = z.infer<typeof canvasConnectionSchema>;
