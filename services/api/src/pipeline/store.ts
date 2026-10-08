import { randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  ApiError,
  EmailSummary,
  Suggestion,
  SyncRun,
} from "@action-inbox/contracts";
import { ApiFailure } from "../runtime.js";
import {
  suggestionFingerprint,
  type Extractor,
  type ValidatedExtraction,
} from "./extractor.js";
import type { NormalizedMessage } from "./normalize.js";

export interface SuggestionRow {
  id: string;
  user_id: string;
  email_id: string;
  category: Suggestion["category"];
  title: string;
  due_at: Date | null;
  deadline_certainty: Suggestion["deadlineCertainty"];
  confidence: number;
  evidence: Suggestion["evidence"];
  deadline_evidence: Suggestion["deadlineEvidence"];
  needs_review: boolean;
  review_reason: string | null;
  review_state: Suggestion["reviewState"];
  version: number;
  created_at: Date;
  fingerprint: string;
  action_key: string;
}
export function serializeSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    emailId: row.email_id,
    category: row.category,
    title: row.title,
    dueAt: row.due_at?.toISOString() ?? null,
    deadlineCertainty: row.deadline_certainty,
    confidence: row.confidence,
    evidence: row.evidence,
    deadlineEvidence: row.deadline_evidence,
    needsReview: row.needs_review,
    reviewReason: row.review_reason,
    reviewState: row.review_state,
    version: row.version,
    createdAt: row.created_at.toISOString(),
  };
}
export interface EmailRow {
  id: string;
  user_id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  sender: string;
  subject: string;
  received_at: Date;
  normalized_body: string;
  body_hash: string;
  category: EmailSummary["category"];
  extraction_status: EmailSummary["extractionStatus"];
  extraction_error: ApiError | null;
}
export function serializeEmail(
  row: EmailRow,
  suggestions: Suggestion[],
): EmailSummary {
  return {
    id: row.id,
    gmailMessageId: row.gmail_message_id,
    sender: row.sender,
    subject: row.subject,
    receivedAt: row.received_at.toISOString(),
    category: row.category,
    extractionStatus: row.extraction_status,
    extractionError: row.extraction_error,
    suggestions,
  };
}
export interface SyncRow {
  id: string;
  user_id: string;
  status: SyncRun["status"];
  imported_count: number;
  processed_count: number;
  error: ApiError | null;
  created_at: Date;
  completed_at: Date | null;
}
export function serializeRun(row: SyncRow): SyncRun {
  return {
    id: row.id,
    status: row.status,
    importedCount: row.imported_count,
    processedCount: row.processed_count,
    error: row.error,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
  };
}
export function safePipelineError(error: unknown, requestId: string): ApiError {
  if (error instanceof ApiFailure) {
    const safe: Record<string, string> = {
      PROVIDER_NOT_CONFIGURED: "AI extraction is not configured.",
      GOOGLE_RECONNECT_REQUIRED:
        "Reconnect Google, then retry synchronization.",
      GOOGLE_UNAVAILABLE:
        "Gmail could not complete synchronization. Retry synchronization.",
      RATE_LIMITED: "The provider is busy. Retry synchronization later.",
      AI_UNAVAILABLE:
        "AI extraction could not complete. Retry synchronization.",
      INVALID_EVIDENCE:
        "The extraction was not supported by the source. Retry synchronization.",
    };
    const message = safe[error.code];
    if (message)
      return { code: error.code as ApiError["code"], message, requestId };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Synchronization could not complete. Retry synchronization.",
    requestId,
  };
}
export async function withConnectedUser<T>(
  pool: pg.Pool,
  userId: string,
  action: (client: pg.PoolClient, connectionId: string) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      "SELECT id FROM users WHERE id=$1 FOR UPDATE",
      [userId],
    );
    const connection = await client.query<{ id: string }>(
      "SELECT id FROM google_connections WHERE user_id=$1 AND revoked_at IS NULL",
      [userId],
    );
    if (!user.rowCount || !connection.rowCount)
      throw new ApiFailure(
        401,
        "GOOGLE_RECONNECT_REQUIRED",
        "Reconnect Google, then retry synchronization.",
      );
    const result = await action(client, connection.rows[0]!.id);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withActiveSync<T>(
  pool: pg.Pool,
  userId: string,
  runId: string,
  connectionId: string,
  action: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withConnectedUser(
    pool,
    userId,
    async (client, currentConnectionId) => {
      const run = await client.query(
        "SELECT id FROM sync_runs WHERE id=$1 AND user_id=$2 AND status='Running' FOR UPDATE",
        [runId, userId],
      );
      // Disconnect purges the original run. Reconnection must not authorize an
      // old provider response, even when the same user reconnects immediately.
      if (!run.rowCount || currentConnectionId !== connectionId) {
        throw new ApiFailure(
          409,
          "CONFLICT",
          "This synchronization is no longer active.",
        );
      }
      return action(client);
    },
  );
}
export async function importMessage(
  pool: pg.Pool,
  userId: string,
  runId: string,
  message: NormalizedMessage,
  connectionId: string,
): Promise<EmailRow> {
  return withActiveSync(pool, userId, runId, connectionId, async (client) => {
    // Gmail messages are immutable. Never replace evidence text underneath a human decision.
    const inserted = await client.query<EmailRow>(
      `INSERT INTO email_messages
      (user_id,gmail_message_id,gmail_thread_id,sender,subject,received_at,normalized_body,body_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,gmail_message_id) DO NOTHING RETURNING *`,
      [
        userId,
        message.gmailMessageId,
        message.gmailThreadId,
        message.sender,
        message.subject,
        message.receivedAt,
        message.normalizedBody,
        message.bodyHash,
      ],
    );
    if (inserted.rowCount) {
      await client.query(
        "UPDATE sync_runs SET imported_count=imported_count+1 WHERE id=$1 AND user_id=$2",
        [runId, userId],
      );
      return inserted.rows[0]!;
    }
    const existing = await client.query<EmailRow>(
      "SELECT * FROM email_messages WHERE user_id=$1 AND gmail_message_id=$2",
      [userId, message.gmailMessageId],
    );
    return existing.rows[0]!;
  });
}
export async function beginExtraction(
  pool: pg.Pool,
  userId: string,
  runId: string,
  emailId: string,
  extractor: Extractor,
  connectionId: string,
): Promise<string> {
  return withActiveSync(pool, userId, runId, connectionId, async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO extraction_runs(id,user_id,email_id,sync_run_id,extractor_version,model,status)
      VALUES($1,$2,$3,$4,$5,$6,'Running')`,
      [id, userId, emailId, runId, extractor.version, extractor.model],
    );
    return id;
  });
}
export async function saveExtraction(
  pool: pg.Pool,
  userId: string,
  runId: string,
  extractionId: string,
  email: EmailRow,
  result: ValidatedExtraction,
  connectionId: string,
): Promise<void> {
  await withActiveSync(pool, userId, runId, connectionId, async (client) => {
    for (const action of result.actions) {
      // Source overlap is a second defence against title/quote wording drift on retries.
      const prior = await client.query<SuggestionRow>(
        `SELECT * FROM suggestions WHERE user_id=$1 AND email_id=$2
        AND (action_key=$3 OR ((evidence->>'start')::int < $5 AND (evidence->>'end')::int > $4)) FOR UPDATE`,
        [
          userId,
          email.id,
          action.actionKey,
          action.evidence.start,
          action.evidence.end,
        ],
      );
      if (prior.rowCount) continue; // Includes Proposed user edits as well as final human decisions.
      await client.query(
        `INSERT INTO suggestions(user_id,email_id,category,title,due_at,deadline_certainty,confidence,
        evidence,deadline_evidence,needs_review,review_reason,fingerprint,action_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
        [
          userId,
          email.id,
          result.category,
          action.title,
          action.dueAt,
          action.deadlineCertainty,
          action.confidence,
          JSON.stringify(action.evidence),
          action.deadlineEvidence
            ? JSON.stringify(action.deadlineEvidence)
            : null,
          action.needsReview,
          action.reviewReason,
          suggestionFingerprint(
            userId,
            email.gmail_message_id,
            action.title,
            action.dueAt,
          ),
          action.actionKey,
        ],
      );
    }
    await client.query(
      "UPDATE email_messages SET category=$3,extraction_status='Succeeded',extraction_error=NULL WHERE id=$1 AND user_id=$2",
      [email.id, userId, result.category],
    );
    await client.query(
      "UPDATE extraction_runs SET status='Succeeded',completed_at=now(),error=NULL WHERE id=$1 AND user_id=$2",
      [extractionId, userId],
    );
    await client.query(
      "UPDATE sync_runs SET processed_count=processed_count+1 WHERE id=$1 AND user_id=$2",
      [runId, userId],
    );
  });
}
export async function failExtraction(
  pool: pg.Pool,
  userId: string,
  runId: string,
  extractionId: string,
  emailId: string,
  error: ApiError,
  connectionId: string,
): Promise<void> {
  await withActiveSync(pool, userId, runId, connectionId, async (client) => {
    await client.query(
      "UPDATE email_messages SET extraction_status='Failed',extraction_error=$3 WHERE id=$1 AND user_id=$2",
      [emailId, userId, error],
    );
    await client.query(
      "UPDATE extraction_runs SET status='Failed',error=$3,completed_at=now() WHERE id=$1 AND user_id=$2",
      [extractionId, userId, error],
    );
    await client.query(
      "UPDATE sync_runs SET error=$3 WHERE id=$1 AND user_id=$2",
      [runId, userId, error],
    );
  });
}
