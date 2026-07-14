import { NextResponse } from "next/server.js";
import { lockLocalFileSyncJob, openDatabase } from "../../../../../../backend/database.ts";
import {
  isWorkerAuthContext,
  readPositiveId,
  requireWorkerAuth,
  toPendingJobResponse,
  WORKER_LOCK_TIMEOUT_MINUTES,
  WORKER_MAX_ATTEMPTS,
} from "../../../../../../backend/workerFileSync.ts";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireWorkerAuth(request);

  if (!isWorkerAuthContext(auth)) {
    return auth;
  }

  const id = readPositiveId(await params);

  if (!id) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const db = openDatabase();

  try {
    const job = lockLocalFileSyncJob(db, {
      id,
      workerId: auth.workerId,
      workerVersion: auth.workerVersion,
      lockTimeoutMinutes: WORKER_LOCK_TIMEOUT_MINUTES,
      maxAttempts: WORKER_MAX_ATTEMPTS,
    });

    if (!job) {
      return NextResponse.json({ error: "Job is not available" }, { status: 409 });
    }

    return NextResponse.json({ job: toPendingJobResponse(job) });
  } finally {
    db.close();
  }
}
