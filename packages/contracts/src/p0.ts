import { z } from "zod";

const id = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const title = z.string().trim().min(1).max(300);
const version = z.number().int().nonnegative();
export const emptyRequestSchema = z.strictObject({});
export const successResponseSchema = z.strictObject({ ok: z.literal(true) });
export const errorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CSRF_INVALID",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "PROVIDER_NOT_CONFIGURED",
  "GOOGLE_RECONNECT_REQUIRED",
  "GOOGLE_UNAVAILABLE",
  "AI_UNAVAILABLE",
  "INVALID_EVIDENCE",
  "OAUTH_INVALID",
  "INTERNAL_ERROR",
]);
export const apiErrorSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().min(1),
  requestId: z.string().min(1),
});
export const userSchema = z.strictObject({
  id,
  email: z.email(),
  displayName: z.string(),
  timezone: z.string().min(1),
});
export const sessionResponseSchema = z.strictObject({
  authenticated: z.boolean(),
  user: userSchema.nullable(),
  csrfToken: z.string().min(32),
  expiresAt: timestamp,
  googleConnected: z.boolean(),
});
export const googleStartResponseSchema = z.strictObject({
  authorizationUrl: z.url(),
});
export const categorySchema = z.enum([
  "Action Required",
  "Read / Review",
  "Reference",
]);
export const reviewStateSchema = z.enum(["Proposed", "Approved", "Rejected"]);
export const taskStatusSchema = z.enum([
  "Pending",
  "Waiting for Reply",
  "Completed",
]);
export const syncRunSchema = z.strictObject({
  id,
  status: z.enum(["Queued", "Running", "Succeeded", "Failed"]),
  importedCount: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  error: apiErrorSchema.nullable(),
  createdAt: timestamp,
  completedAt: timestamp.nullable(),
});
export const dataStateSchema = z.strictObject({
  lastSuccessfulSyncAt: timestamp.nullable(),
  latestSyncRun: syncRunSchema.nullable(),
});
export const evidenceSchema = z
  .strictObject({
    quote: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .refine((value) => value.end > value.start, {
    message: "Invalid evidence offsets",
  });
export const suggestionSchema = z.strictObject({
  deadlineEvidence: evidenceSchema.nullable(),
  id,
  emailId: id,
  category: categorySchema,
  title,
  dueAt: timestamp.nullable(),
  deadlineCertainty: z.enum(["Explicit", "Uncertain", "None"]),
  confidence: z.number().min(0).max(1),
  evidence: evidenceSchema,
  needsReview: z.boolean(),
  reviewReason: z.string().nullable(),
  reviewState: reviewStateSchema,
  version,
  createdAt: timestamp,
});
export const emailSummarySchema = z.strictObject({
  id,
  gmailMessageId: z.string().min(1),
  sender: z.string(),
  subject: z.string(),
  extractionError: apiErrorSchema.nullable(),
  receivedAt: timestamp,
  category: categorySchema.nullable(),
  extractionStatus: z.enum(["Pending", "Succeeded", "Failed"]),
  suggestions: z.array(suggestionSchema),
});
export const emailResponseSchema = emailSummarySchema.extend({
  normalizedBody: z.string(),
});
export const pageQuerySchema = z.strictObject({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const inboxQuerySchema = pageQuerySchema.extend({
  category: categorySchema.optional(),
  reviewState: reviewStateSchema.optional(),
});
export const inboxResponseSchema = z.strictObject({
  items: z.array(emailSummarySchema),
  nextCursor: z.string().nullable(),
  dataState: dataStateSchema,
});
export const suggestionEditRequestSchema = z
  .strictObject({
    version,
    title: title.optional(),
    dueAt: timestamp.nullable().optional(),
  })
  .refine((value) => value.title !== undefined || value.dueAt !== undefined, {
    message: "An edit is required",
  });
export const suggestionApproveRequestSchema = z.strictObject({
  version,
  title: title.optional(),
  dueAt: timestamp.nullable().optional(),
});
export const versionRequestSchema = z.strictObject({ version });
export const reminderSchema = z.strictObject({
  id,
  taskId: id,
  scheduledAt: timestamp,
  status: z.enum(["Scheduled", "Cancelled"]),
  delivery: z.literal("Not configured"),
});
export const calendarLinkSchema = z.strictObject({
  status: z.enum(["Requested", "Created", "Failed"]),
  googleEventId: z.string().nullable(),
  htmlLink: z.url().nullable(),
  error: apiErrorSchema.nullable(),
});
export const taskSchema = z.strictObject({
  id,
  title,
  dueAt: timestamp.nullable(),
  status: taskStatusSchema,
  sourceSuggestionId: id.nullable(),
  sourceEmailId: id.nullable(),
  approvedAt: timestamp,
  completedAt: timestamp.nullable(),
  version,
  reminders: z.array(reminderSchema),
  calendarLink: calendarLinkSchema.nullable(),
  createdAt: timestamp,
});
export const tasksQuerySchema = pageQuerySchema.extend({
  status: taskStatusSchema.optional(),
});
export const tasksResponseSchema = z.strictObject({
  items: z.array(taskSchema),
  nextCursor: z.string().nullable(),
});
export const taskCreateRequestSchema = z.strictObject({
  requestId: id,
  title,
  dueAt: timestamp.nullable(),
});
export const taskEditRequestSchema = z
  .strictObject({
    version,
    title: title.optional(),
    dueAt: timestamp.nullable().optional(),
    status: taskStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.dueAt !== undefined ||
      value.status !== undefined,
    { message: "An edit is required" },
  );
export const reminderCreateRequestSchema = z.strictObject({
  requestId: id,
  scheduledAt: timestamp,
});
export const reminderEditRequestSchema = z.strictObject({
  scheduledAt: timestamp,
});
export const calendarEventCreateRequestSchema = z
  .strictObject({
    requestId: id,
    title,
    startAt: timestamp,
    endAt: timestamp,
    timezone: z.string().min(1).max(100),
  })
  .refine((value) => Date.parse(value.endAt) > Date.parse(value.startAt), {
    message: "Event end must follow start",
  });
export const calendarEventSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean(),
  htmlLink: z.url().nullable(),
});
export const upcomingCalendarResponseSchema = z.strictObject({
  items: z.array(calendarEventSchema),
  lastSuccessfulFetchAt: timestamp.nullable(),
  error: apiErrorSchema.nullable(),
});

// Paths are versioned here so client and server cannot silently drift.
export const apiRoutes = {
  session: "/v1/auth/session",
  googleStart: "/v1/auth/google/start",
  googleCallback: "/v1/auth/google/callback",
  refresh: "/v1/auth/refresh",
  logout: "/v1/auth/logout",
  disconnect: "/v1/connections/google/disconnect",
  sync: "/v1/sync/gmail",
  syncRun: "/v1/sync-runs/:id",
  inbox: "/v1/inbox",
  email: "/v1/emails/:id",
  suggestion: "/v1/suggestions/:id",
  approve: "/v1/suggestions/:id/approve",
  reject: "/v1/suggestions/:id/reject",
  tasks: "/v1/tasks",
  task: "/v1/tasks/:id",
  reminders: "/v1/tasks/:id/reminders",
  reminder: "/v1/reminders/:id",
  upcoming: "/v1/calendar/upcoming",
  createEvent: "/v1/tasks/:id/calendar-event",
  deleteData: "/v1/account/data",
} as const;

export type ApiError = z.infer<typeof apiErrorSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SyncRun = z.infer<typeof syncRunSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type EmailSummary = z.infer<typeof emailSummarySchema>;
export type EmailResponse = z.infer<typeof emailResponseSchema>;
export type InboxResponse = z.infer<typeof inboxResponseSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
