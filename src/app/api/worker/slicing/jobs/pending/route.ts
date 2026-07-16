import { openDatabase } from "../../../../../../backend/database.ts";
import { authenticateSlicingWorkerRequest } from "../../../../../../backend/workerSlicingAuth.ts";
import { authErrorResponse, jsonError, jsonOk } from "../../../../../../backend/workerSlicingApi.ts";
import {
  listPendingSlicingJobsForWorker,
  reconcileExpiredSlicingJobs,
  toPendingSlicingJobPayload,
} from "../../../../../../backend/workerSlicingJobs.ts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = authenticateSlicingWorkerRequest(request);
  if (!auth.ok) return authErrorResponse(auth);

  const db = openDatabase();
  try {
    reconcileExpiredSlicingJobs(db, auth.context.workerId, Date.now());
    const jobs = listPendingSlicingJobsForWorker(db, auth.context.workerId).map(toPendingSlicingJobPayload);
    return jsonOk({ jobs });
  } catch {
    return jsonError(500, "BAD_REQUEST", "Failed to load slicing jobs");
  } finally {
    db.close();
  }
}
