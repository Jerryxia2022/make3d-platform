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
  ValidationError,
  STATE_BODY_LIMIT_BYTES,
} from "../../../../../../../backend/workerSlicingApi.ts";
import {
  getSlicingJobById,
  renewSlicingJobLease,
  WORKER_SLICING_LEASE_DURATION_MS,
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
    const parsed = requireObject(body.body, ["lock_owner"], "lease");
    const lockOwner = requireLockOwner(parsed.lock_owner);
    const db = openDatabase();
    try {
      if (
        !renewSlicingJobLease(db, {
          id,
          workerId: auth.context.workerId,
          lockOwner,
          leaseDurationMs: WORKER_SLICING_LEASE_DURATION_MS,
        })
      ) {
        return jsonError(409, "LEASE_EXPIRED", "Lease has expired");
      }
      const job = getSlicingJobById(db, id);
      return jsonOk({
        job_id: id,
        lease_expires_at_ms: job.leaseExpiresAtMs,
        lease_renewed_at_ms: job.leaseRenewedAtMs,
      });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof ValidationError) return jsonError(422, "VALIDATION_ERROR", error.message);
    throw error;
  }
}
