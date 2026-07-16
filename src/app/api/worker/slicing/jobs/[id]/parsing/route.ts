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
import { getSlicingJobById, markSlicingJobParsing } from "../../../../../../../backend/workerSlicingJobs.ts";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authenticateSlicingWorkerRequest(request);
  if (!auth.ok) return authErrorResponse(auth);
  const id = readJobId((await params).id);
  if (!id) return jsonError(400, "INVALID_JOB_ID", "Invalid job id");

  const body = await readLimitedJsonBody(request, STATE_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;

  try {
    const parsed = requireObject(body.body, ["lock_owner", "actual_parser_version", "gcode_sha256"], "parsing");
    const lockOwner = requireLockOwner(parsed.lock_owner);
    const actualParser = requireText(parsed.actual_parser_version, "actual_parser_version");
    const gcodeSha = requireSha256(parsed.gcode_sha256, "gcode_sha256");
    const db = openDatabase();
    try {
      const job = getSlicingJobById(db, id);
      if (job.inputWorkerId !== auth.context.workerId) return jsonError(404, "JOB_NOT_FOUND", "Job not found");
      if (actualParser !== job.requiredParserVersion) return jsonError(422, "PARSER_VERSION_MISMATCH", "Parser version mismatch");
      const updated = markSlicingJobParsing(db, { id, workerId: auth.context.workerId, lockOwner, gcodeSha256: gcodeSha });
      if (!updated) return jsonError(409, "STATE_CONFLICT", "Job state does not allow parsing");
      return jsonOk({ job_id: id, status: updated.status, lease_expires_at_ms: updated.leaseExpiresAtMs });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof ValidationError) return jsonError(422, "VALIDATION_ERROR", error.message);
    throw error;
  }
}

function requireText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 120) {
    throw new ValidationError(`${fieldName} is invalid`);
  }
  return value.trim();
}
