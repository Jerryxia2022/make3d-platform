import { NextResponse } from "next/server.js";
import {
  getLocalFileSyncJobWithFileById,
  markLocalFileSyncJobDownloaded,
  markLocalFileSyncJobFailed,
  openDatabase,
} from "../../../../../../backend/database.ts";
import {
  isWorkerAuthContext,
  readPositiveId,
  requireWorkerAuth,
  sanitizeWorkerError,
  streamFileResponse,
  validateWorkerJobFile,
} from "../../../../../../backend/workerFileSync.ts";

export const runtime = "nodejs";

export async function GET(
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
    const job = getLocalFileSyncJobWithFileById(db, id);

    if (job.workerId !== auth.workerId || !["locked", "downloaded"].includes(job.syncStatus)) {
      return NextResponse.json({ error: "Job is not locked by this worker" }, { status: 403 });
    }

    let safeFile;

    try {
      safeFile = await validateWorkerJobFile(job);
    } catch (error) {
      const message = sanitizeWorkerError(error);
      markLocalFileSyncJobFailed(db, { id, workerId: auth.workerId, error: message });
      const status = message === "unsafe-file-path" ? 403 : 404;
      return NextResponse.json({ error: status === 403 ? "Unsafe file path" : "File not found" }, { status });
    }

    markLocalFileSyncJobDownloaded(db, id, auth.workerId);
    return streamFileResponse(safeFile, job.storedFilename);
  } catch {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  } finally {
    db.close();
  }
}
