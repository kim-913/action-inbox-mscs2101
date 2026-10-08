import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("action-inbox-api"),
  timestamp: z.iso.datetime(),
  version: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./p0.js";
export * from "./canvas.js";
export * from "./display.js";
