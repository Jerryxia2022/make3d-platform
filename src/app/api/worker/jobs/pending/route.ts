import { NextResponse } from "next/server.js";
import {
  getLocalFileSyncJobWithFileById,
  listPendingLocalFileSyncJobs,
  openDatabase,
  updateLocalFileSyncJobSha256,
} from "../../../../../backend/database.ts";
import {
  isWorkerAuthContext,
  requireWorkerAuth,
  sha256File,
  toPendingJobResponse,
  validateWorkerJobFile,
  WORKER_LOCK_TIMEOUT_MINUTES,
  WORKER_MAX_ATTEMPTS,
  WORKER_PENDING_LIMIT,
} from "../../../../../backend/workerFileSync.ts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireWorkerAuth(request);

  if (!isWorkerAuthContext(auth)) {
    return auth;
  }

  const db = openDatabase();

  try {
    const jobs = listPendingLocalFileSyncJobs(db, {
      limit: WORKER_PENDING_LIMIT,
      lockTimeoutMinutes: WORKER_LOCK_TIMEOUT_MINUTES,
      maxAttempts: WORKER_MAX_ATTEMPTS,
    });
    const hydratedJobs = [];

    for (const job of jobs) {
      if (job.sha256) {
        hydratedJobs.push(job);
        continue;
      }

      const jobWithFile = getLocalFileSyncJobWithFileById(db, job.id);
      const safeFile = await validateWorkerJobFile(jobWithFile);
      const sha256 = await sha256File(safeFile.absolutePath);
      updateLocalFileSyncJobSha256(db, job.id, sha256);
      hydratedJobs.push({ ...job, sha256 });
    }

    return NextResponse.json({ jobs: hydratedJobs.map(toPendingJobResponse) });
  } catch {
    return NextResponse.json({ error: "Failed to load worker jobs" }, { status: 500 });
  } finally {
    db.close();
  }
}
