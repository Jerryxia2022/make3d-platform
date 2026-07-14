import { NextResponse } from "next/server.js";
import {
  getLocalFileSyncJobWithFileById,
  markLocalFileSyncJobFailed,
  markLocalFileSyncJobVerified,
  openDatabase,
  updateLocalFileSyncJobSha256,
} from "../../../../../../backend/database.ts";
import {
  isWorkerAuthContext,
  readPositiveId,
  requireWorkerAuth,
  sanitizeWorkerError,
  sha256File,
  validateWorkerJobFile,
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
  const localPath = normalizeLocalPath(input.local_path ?? input.localPath);
  const localSha256 = normalizeSha256(input.local_sha256 ?? input.localSha256);
  const fileSizeBytes = normalizeFileSize(input.file_size_bytes ?? input.fileSizeBytes);

  if (!localPath || !localSha256 || fileSizeBytes == null) {
    return NextResponse.json({ error: "Invalid verification payload" }, { status: 400 });
  }

  const db = openDatabase();

  try {
    const job = getLocalFileSyncJobWithFileById(db, id);

    if (job.workerId !== auth.workerId || !["locked", "downloaded"].includes(job.syncStatus)) {
      return NextResponse.json({ error: "Job is not locked by this worker" }, { status: 403 });
    }

    const safeFile = await validateWorkerJobFile(job);
    const expectedSha256 = job.sha256 || (await sha256File(safeFile.absolutePath));

    if (!job.sha256) {
      updateLocalFileSyncJobSha256(db, job.id, expectedSha256);
    }

    if (fileSizeBytes !== job.fileSizeBytes || localSha256 !== expectedSha256) {
      markLocalFileSyncJobFailed(db, {
        id,
        workerId: auth.workerId,
        error: "local file verification mismatch",
      });
      return NextResponse.json({ error: "Local file verification failed" }, { status: 400 });
    }

    const updated = markLocalFileSyncJobVerified(db, {
      id,
      workerId: auth.workerId,
      localPath,
      localSha256,
    });

    if (!updated) {
      return NextResponse.json({ error: "Job verification was not accepted" }, { status: 409 });
    }

    return NextResponse.json({ success: true, status: "verified" });
  } catch (error) {
    markLocalFileSyncJobFailed(db, {
      id,
      workerId: auth.workerId,
      error: sanitizeWorkerError(error),
    });
    return NextResponse.json({ error: "Job verification failed" }, { status: 400 });
  } finally {
    db.close();
  }
}

function normalizeLocalPath(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : "";
}

function normalizeSha256(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function normalizeFileSize(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
