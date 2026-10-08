import type { ApiError } from "@action-inbox/contracts";
import { ApiFailure, type Runtime } from "../runtime.js";
import { validateExtraction, type Extractor } from "./extractor.js";
import { GmailReader } from "./gmail.js";
import {
  beginExtraction,
  failExtraction,
  importMessage,
  safePipelineError,
  saveExtraction,
  withActiveSync,
  withConnectedUser,
  type EmailRow,
} from "./store.js";

export interface SyncJob {
  runId: string;
  userId: string;
}
export async function finishFailedRun(
  runtime: Runtime,
  job: SyncJob,
  error: ApiError,
): Promise<void> {
  const client = await runtime.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
      job.userId,
    ]);
    const connection = await client.query(
      "SELECT id FROM google_connections WHERE user_id=$1 AND revoked_at IS NULL",
      [job.userId],
    );
    const safeError: ApiError = connection.rowCount
      ? error
      : {
          code: "GOOGLE_RECONNECT_REQUIRED",
          message: "Reconnect Google, then retry synchronization.",
          requestId: job.runId,
        };
    // Unlike content writes, safe failure UPDATEs are permitted after revocation.
    // A concurrent purge holds the same user lock; these cannot recreate deleted data.
    await client.query(
      `UPDATE email_messages SET extraction_status='Failed',extraction_error=$3
      WHERE user_id=$2 AND id IN (SELECT email_id FROM extraction_runs WHERE sync_run_id=$1 AND status='Running')`,
      [job.runId, job.userId, safeError],
    );
    await client.query(
      "UPDATE extraction_runs SET status='Failed',error=$3,completed_at=now() WHERE sync_run_id=$1 AND user_id=$2 AND status='Running'",
      [job.runId, job.userId, safeError],
    );
    await client.query(
      "UPDATE sync_runs SET status='Failed',error=$3,completed_at=now() WHERE id=$1 AND user_id=$2 AND status IN ('Queued','Running')",
      [job.runId, job.userId, safeError],
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    // Queue storage must never receive raw database errors containing private values.
    throw new Error("Synchronization failure could not be persisted.");
  } finally {
    client.release();
  }
}
export async function processSync(
  runtime: Runtime,
  job: SyncJob,
  extractor: Extractor,
  gmail = new GmailReader(runtime.google, runtime.config.gmailBaseUrl),
): Promise<void> {
  let failure: ApiError | null = null;
  try {
    const connectionId = await withConnectedUser(
      runtime.pool,
      job.userId,
      async (client, currentConnectionId) => {
        const run = await client.query(
          "UPDATE sync_runs SET status='Running',completed_at=NULL WHERE id=$1 AND user_id=$2 AND status IN ('Queued','Running') RETURNING id",
          [job.runId, job.userId],
        );
        return run.rowCount ? currentConnectionId : null;
      },
    );
    if (!connectionId) return;
    const user = await runtime.pool.query<{ timezone: string }>(
      "SELECT timezone FROM users WHERE id=$1",
      [job.userId],
    );
    const timezone = user.rows[0]?.timezone ?? "UTC";
    // Persisted failures get priority even if they have aged out of Gmail's recent window.
    const retries = await runtime.pool.query<EmailRow>(
      "SELECT * FROM email_messages WHERE user_id=$1 AND extraction_status <> 'Succeeded' ORDER BY received_at DESC,id DESC LIMIT 100",
      [job.userId],
    );
    const listed = await gmail.listRecent(job.userId);
    const retryById = new Map(
      retries.rows.map((row) => [row.gmail_message_id, row]),
    );
    const ids = [...new Set([...retryById.keys(), ...listed])].slice(0, 100);
    for (const gmailId of ids) {
      let email: EmailRow;
      try {
        const retry = retryById.get(gmailId);
        if (retry) email = retry;
        else {
          const existing = await runtime.pool.query<EmailRow>(
            "SELECT * FROM email_messages WHERE user_id=$1 AND gmail_message_id=$2",
            [job.userId, gmailId],
          );
          email =
            existing.rows[0] ??
            (await importMessage(
              runtime.pool,
              job.userId,
              job.runId,
              await gmail.get(job.userId, gmailId),
              connectionId,
            ));
        }
      } catch (error) {
        if (
          error instanceof ApiFailure &&
          (error.code === "CONFLICT" ||
            error.code === "GOOGLE_RECONNECT_REQUIRED")
        )
          throw error;
        failure = safePipelineError(error, job.runId);
        continue;
      }
      if (email.extraction_status === "Succeeded") continue;
      const extractionId = await beginExtraction(
        runtime.pool,
        job.userId,
        job.runId,
        email.id,
        extractor,
        connectionId,
      );
      try {
        const output = await extractor.extract({
          sender: email.sender,
          subject: email.subject,
          receivedAt: email.received_at.toISOString(),
          timezone,
          normalizedBody: email.normalized_body,
        });
        const validated = validateExtraction(output, email.normalized_body);
        await saveExtraction(
          runtime.pool,
          job.userId,
          job.runId,
          extractionId,
          email,
          validated,
          connectionId,
        );
      } catch (error) {
        failure = safePipelineError(error, job.runId);
        await failExtraction(
          runtime.pool,
          job.userId,
          job.runId,
          extractionId,
          email.id,
          failure,
          connectionId,
        );
      }
    }
    await withActiveSync(
      runtime.pool,
      job.userId,
      job.runId,
      connectionId,
      async (client) => {
        await client.query(
          "UPDATE sync_runs SET status=$3,error=$4,completed_at=now() WHERE id=$1 AND user_id=$2 AND status='Running'",
          [job.runId, job.userId, failure ? "Failed" : "Succeeded", failure],
        );
        // An interrupted attempt can leave an extraction audit entry behind after a successful retry.
        await client.query(
          "UPDATE extraction_runs SET status='Failed',error=$3,completed_at=now() WHERE sync_run_id=$1 AND user_id=$2 AND status='Running'",
          [job.runId, job.userId, safePipelineError(null, job.runId)],
        );
      },
    );
  } catch (error) {
    await finishFailedRun(runtime, job, safePipelineError(error, job.runId));
  }
}
