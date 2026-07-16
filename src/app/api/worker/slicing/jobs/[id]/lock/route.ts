import { openDatabase } from "../../../../../../../backend/database.ts";
import { authenticateSlicingWorkerRequest } from "../../../../../../../backend/workerSlicingAuth.ts";
import {
  authErrorResponse,
  jsonError,
  jsonOkWithLock,
  readJobId,
  readStrictEmptyBody,
} from "../../../../../../../backend/workerSlicingApi.ts";
import { claimSlicingJob, getSlicingJobById } from "../../../../../../../backend/workerSlicingJobs.ts";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authenticateSlicingWorkerRequest(request);
  if (!auth.ok) return authErrorResponse(auth);

  const id = readJobId((await params).id);
  if (!id) return jsonError(400, "INVALID_JOB_ID", "Invalid job id");

  const body = await readStrictEmptyBody(request);
  if (!body.ok) return body.response;

  const db = openDatabase();
  try {
    const claimed = claimSlicingJob(db, { id, requestWorkerId: auth.context.workerId });

    if (!claimed) {
      try {
        const job = getSlicingJobById(db, id);
        if (job.inputWorkerId !== auth.context.workerId) return jsonError(404, "JOB_NOT_FOUND", "Job not found");
        return jsonError(409, "STATE_CONFLICT", "Job is not available for locking");
      } catch {
        return jsonError(404, "JOB_NOT_FOUND", "Job not found");
      }
    }

    const resumeAllowed = claimed.resumeFrom === "sliced" || claimed.resumeFrom === "parsing";
    return jsonOkWithLock({
      job_id: id,
      attempt_no: claimed.attempt.attemptNo,
      lock_owner: claimed.lockOwner,
      locked_at_ms: claimed.job.lockedAtMs,
      lock_expires_at_ms: claimed.job.lockExpiresAtMs,
      lease_expires_at_ms: claimed.job.leaseExpiresAtMs,
      lease_renewed_at_ms: claimed.job.leaseRenewedAtMs,
      gcode_relative_path: resumeAllowed ? claimed.job.gcodeRelativePath : null,
      gcode_size_bytes: resumeAllowed ? claimed.job.gcodeSizeBytes : null,
      gcode_sha256: resumeAllowed ? claimed.job.gcodeSha256 : null,
      stdout_relative_path: resumeAllowed ? claimed.job.stdoutRelativePath : null,
      stderr_relative_path: resumeAllowed ? claimed.job.stderrRelativePath : null,
      created_attempt: claimed.createdAttempt,
      resume_from: claimed.resumeFrom,
    });
  } finally {
    db.close();
  }
}
