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
  ValidationError,
  STATE_BODY_LIMIT_BYTES,
} from "../../../../../../../backend/workerSlicingApi.ts";
import {
  failSlicingJobValidation,
  getSlicingJobById,
  markSlicingJobSlicing,
  type WorkerErrorCode,
} from "../../../../../../../backend/workerSlicingJobs.ts";

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
      ["lock_owner", "actual_slicer_package_version", "actual_parser_version", "input_sha256", "profile_sha256", "slice_params_sha256"],
      "slicing",
    );
    const lockOwner = requireLockOwner(parsed.lock_owner);
    const actualSlicer = requireText(parsed.actual_slicer_package_version, "actual_slicer_package_version");
    const actualParser = requireText(parsed.actual_parser_version, "actual_parser_version");
    const inputSha = requireSha256(parsed.input_sha256, "input_sha256");
    const profileSha = requireSha256(parsed.profile_sha256, "profile_sha256");
    const paramsSha = requireSha256(parsed.slice_params_sha256, "slice_params_sha256");

    const db = openDatabase();
    try {
      const job = getSlicingJobById(db, id);
      if (job.inputWorkerId !== auth.context.workerId) return jsonError(404, "JOB_NOT_FOUND", "Job not found");
      const mismatch = findMismatch(job, { actualSlicer, actualParser, inputSha, profileSha, paramsSha });
      if (mismatch) {
        failSlicingJobValidation(db, {
          id,
          workerId: auth.context.workerId,
          lockOwner,
          errorCode: mismatch,
          errorMessage: mismatch,
        });
        return jsonError(422, mismatch, mismatch);
      }
      const updated = markSlicingJobSlicing(db, { id, workerId: auth.context.workerId, lockOwner });
      if (!updated) return jsonError(409, "STATE_CONFLICT", "Job state does not allow slicing");
      return jsonOk({ job_id: id, status: updated.status, lease_expires_at_ms: updated.leaseExpiresAtMs });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof ValidationError) return jsonError(422, "VALIDATION_ERROR", error.message);
    throw error;
  }
}

function findMismatch(
  job: ReturnType<typeof getSlicingJobById>,
  input: { actualSlicer: string; actualParser: string; inputSha: string; profileSha: string; paramsSha: string },
): WorkerErrorCode | null {
  if (input.actualSlicer !== job.requiredSlicerPackageVersion) return "SLICER_VERSION_MISMATCH";
  if (input.actualParser !== job.requiredParserVersion) return "PARSER_VERSION_MISMATCH";
  if (input.inputSha !== job.inputSha256) return "INPUT_SHA_MISMATCH";
  if (input.profileSha !== job.profileSha256) return "PROFILE_SHA_MISMATCH";
  if (input.paramsSha !== job.sliceParamsSha256) return "SLICE_PARAMS_MISMATCH";
  return null;
}

function requireText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 120) {
    throw new ValidationError(`${fieldName} is invalid`);
  }
  return value.trim();
}
