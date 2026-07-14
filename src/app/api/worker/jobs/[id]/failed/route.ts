import { NextResponse } from "next/server.js";
import {
  getLocalFileSyncJobById,
  markLocalFileSyncJobFailed,
  openDatabase,
} from "../../../../../../backend/database.ts";
import {
  isWorkerAuthContext,
  readPositiveId,
  requireWorkerAuth,
  sanitizeWorkerError,
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

  const input = await request.json().catch(() => ({}));
  const error = sanitizeWorkerError(input.error || input.message || "worker reported failure");
  const db = openDatabase();

  try {
    const job = getLocalFileSyncJobById(db, id);

    if (job.workerId && job.workerId !== auth.workerId) {
      return NextResponse.json({ error: "Job is not locked by this worker" }, { status: 403 });
    }

    const updated = markLocalFileSyncJobFailed(db, {
      id,
      workerId: auth.workerId,
      error,
    });

    if (!updated) {
      return NextResponse.json({ error: "Job failure was not accepted" }, { status: 409 });
    }

    return NextResponse.json({ success: true, status: "failed" });
  } catch {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  } finally {
    db.close();
  }
}
