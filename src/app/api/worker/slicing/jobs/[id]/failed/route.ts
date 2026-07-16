import { openDatabase } from "../../../../../../../backend/database.ts";
import { authenticateSlicingWorkerRequest } from "../../../../../../../backend/workerSlicingAuth.ts";
import {
  authErrorResponse,
  CodedValidationError,
  jsonError,
  jsonOk,
  normalizeFailedPayload,
  readJobId,
  readLimitedJsonBody,
  STATE_BODY_LIMIT_BYTES,
  stableJson,
  ValidationError,
} from "../../../../../../../backend/workerSlicingApi.ts";
import {
  failSlicingJob,
  getSlicingJobAttemptByLockOwner,
  getSlicingJobById,
} from "../../../../../../../backend/workerSlicingJobs.ts";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authenticateSlicingWorkerRequest(request);
  if (!auth.ok) return authErrorResponse(auth);
  const id = readJobId((await params).id);
  if (!id) return jsonError(400, "INVALID_JOB_ID", "Invalid job id");

  const body = await readLimitedJsonBody(request, STATE_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;

  const db = openDatabase();
  try {
    const job = getSlicingJobById(db, id);
    if (job.inputWorkerId !== auth.context.workerId) return jsonError(404, "JOB_NOT_FOUND", "Job not found");
    const normalized = normalizeFailedPayload(body.body);

    if (job.status === "completed" || job.status === "partial" || job.status === "failed") {
      const attempt = getSlicingJobAttemptByLockOwner(db, normalized.lockOwner);
      if (attempt.slicingJobId !== id || attempt.workerId !== auth.context.workerId) {
        return jsonError(404, "JOB_NOT_FOUND", "Job not found");
      }
      if (job.status === "failed" && stableJson({ stage: normalized.stage, error_code: job.lastErrorCode, error_message: job.lastError }) !== normalized.normalizedJson) {
        return jsonError(409, "IDEMPOTENCY_PAYLOAD_CONFLICT", "Failed payload conflicts with terminal result");
      }
      return jsonOk({ job_id: id, status: job.status });
    }

    if (job.status !== normalized.stage) {
      return jsonError(422, "VALIDATION_ERROR", "Failure stage does not match current job state");
    }

    const failed = failSlicingJob(db, {
      id,
      workerId: auth.context.workerId,
      lockOwner: normalized.lockOwner,
      errorCode: normalized.errorCode,
      errorMessage: normalized.errorMessage,
    });
    if (!failed) return jsonError(409, "STATE_CONFLICT", "Job state does not allow failure");
    return jsonOk({ job_id: id, status: failed.status });
  } catch (error) {
    if (error instanceof CodedValidationError) return jsonError(422, error.code, error.message);
    if (error instanceof ValidationError) return jsonError(422, "VALIDATION_ERROR", error.message);
    throw error;
  } finally {
    db.close();
  }
}
