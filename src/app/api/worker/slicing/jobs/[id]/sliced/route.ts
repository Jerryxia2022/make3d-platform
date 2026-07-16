import { openDatabase } from "../../../../../../../backend/database.ts";
import { authenticateSlicingWorkerRequest } from "../../../../../../../backend/workerSlicingAuth.ts";
import {
  authErrorResponse,
  jsonError,
  jsonOk,
  readJobId,
  readLimitedJsonBody,
  requireLockOwner,
  requireObject,
  requireSha256,
  validateSlicedArtifactPaths,
  ValidationError,
  STATE_BODY_LIMIT_BYTES,
} from "../../../../../../../backend/workerSlicingApi.ts";
import { getSlicingJobAttemptByLockOwner, getSlicingJobById, markSlicingJobSliced } from "../../../../../../../backend/workerSlicingJobs.ts";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authenticateSlicingWorkerRequest(request);
  if (!auth.ok) return authErrorResponse(auth);
  const id = readJobId((await params).id);
  if (!id) return jsonError(400, "INVALID_JOB_ID", "Invalid job id");

  const body = await readLimitedJsonBody(request, STATE_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;

  try {
    const parsed = requireObject(
      body.body,
      [
        "lock_owner",
        "actual_slicer_package_version",
        "slicer_banner_version",
        "slice_duration_ms",
        "exit_code",
        "gcode_relative_path",
        "gcode_size_bytes",
        "gcode_sha256",
        "stdout_relative_path",
        "stderr_relative_path",
      ],
      "sliced",
    );
    const lockOwner = requireLockOwner(parsed.lock_owner);
    if (parsed.exit_code !== 0) return jsonError(422, "VALIDATION_ERROR", "exit_code must be 0; use /failed");
    const duration = requireSafeInteger(parsed.slice_duration_ms, "slice_duration_ms", 0, 24 * 60 * 60 * 1000);
    const gcodeSize = requireSafeInteger(parsed.gcode_size_bytes, "gcode_size_bytes", 1, 268435456);
    const gcodeSha = requireSha256(parsed.gcode_sha256, "gcode_sha256");
    const actualSlicer = requireText(parsed.actual_slicer_package_version, "actual_slicer_package_version");

    const db = openDatabase();
    try {
      const job = getSlicingJobById(db, id);
      if (job.inputWorkerId !== auth.context.workerId) return jsonError(404, "JOB_NOT_FOUND", "Job not found");
      let attempt;
      try {
        attempt = getSlicingJobAttemptByLockOwner(db, lockOwner);
      } catch {
        return jsonError(404, "JOB_NOT_FOUND", "Job not found");
      }
      if (attempt.slicingJobId !== id || attempt.workerId !== auth.context.workerId) {
        return jsonError(404, "JOB_NOT_FOUND", "Job not found");
      }
      validateSlicedArtifactPaths(id, attempt.attemptNo, parsed);
      if (actualSlicer !== job.requiredSlicerPackageVersion) {
        return jsonError(422, "SLICER_VERSION_MISMATCH", "Slicer version mismatch");
      }
      const updated = markSlicingJobSliced(db, {
        id,
        workerId: auth.context.workerId,
        lockOwner,
        actualSlicerPackageVersion: actualSlicer,
        artifactWorkerId: auth.context.workerId,
        gcodeRelativePath: String(parsed.gcode_relative_path),
        stdoutRelativePath: String(parsed.stdout_relative_path),
        stderrRelativePath: String(parsed.stderr_relative_path),
        gcodeSizeBytes: gcodeSize,
        gcodeSha256: gcodeSha,
        sliceDurationMs: duration,
        exitCode: 0,
      });
      if (!updated) return jsonError(409, "STATE_CONFLICT", "Job state does not allow sliced");
      return jsonOk({ job_id: id, status: updated.status, lease_expires_at_ms: updated.leaseExpiresAtMs });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof ValidationError) return jsonError(422, "VALIDATION_ERROR", error.message);
    throw error;
  }
}

function requireSafeInteger(value: unknown, fieldName: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new ValidationError(`${fieldName} is outside allowed range`);
  }
  return Number(value);
}

function requireText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 120) {
    throw new ValidationError(`${fieldName} is invalid`);
  }
  return value.trim();
}
