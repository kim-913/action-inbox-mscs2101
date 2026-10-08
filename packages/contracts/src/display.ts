import { z } from "zod";

export const displayPreferencesSchema = z.strictObject({
  windowDays: z.number().int().min(1).max(365),
});
export type DisplayPreferences = z.infer<typeof displayPreferencesSchema>;
export const displayRoutes = {
  preferences: "/v1/preferences/display",
} as const;

export const displayRangeShape = {
  startAt: z.iso.datetime({ offset: true }).optional(),
  endAt: z.iso.datetime({ offset: true }).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
};
export type DisplayRangeQuery = z.infer<z.ZodObject<typeof displayRangeShape>>;
export function validDisplayRange(value: DisplayRangeQuery): boolean {
  const fields = [value.startAt, value.endAt, value.startDate, value.endDate];
  if (fields.every((field) => field === undefined)) return true;
  return (
    fields.every((field) => field !== undefined) &&
    Date.parse(value.startAt!) < Date.parse(value.endAt!) &&
    value.startDate! < value.endDate!
  );
}
export const displayRangeQuerySchema = z
  .strictObject(displayRangeShape)
  .refine(validDisplayRange, {
    message: "Provide all four ordered display bounds",
  });
export const upcomingCalendarQuerySchema = displayRangeQuerySchema;
export const includeUndatedSchema = z.enum(["true", "false"]).default("false");
