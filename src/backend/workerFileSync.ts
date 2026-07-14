import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server.js";
import type { LocalFileSyncJobRecord, LocalFileSyncJobWithFileRecord } from "./database.ts";
import { getUploadDir } from "./uploads.ts";

export const WORKER_LOCK_TIMEOUT_MINUTES = 15;
export const WORKER_MAX_ATTEMPTS = 5;
export const WORKER_PENDING_LIMIT = 20;

export type WorkerAuthContext = {
  workerId: string;
  workerVersion: string | null;
};

export type SafeWorkerFile = {
  absolutePath: string;
  relativePath: string;
  size: number;
};

export function requireWorkerAuth(request: Request): WorkerAuthContext | NextResponse {
  const expectedToken = process.env.MAKE3D_WORKER_TOKEN;

  if (!expectedToken) {
    return NextResponse.json({ error: "Worker API is not configured" }, { status: 503 });
  }

  const providedToken = extractWorkerToken(request);

  if (!providedToken || !safeTokenEqual(providedToken, expectedToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return {
    workerId: normalizeWorkerHeader(request.headers.get("x-make3d-worker-id"), "default-worker"),
    workerVersion: normalizeWorkerHeader(request.headers.get("x-make3d-worker-version"), "") || null,
  };
}

export function isWorkerAuthContext(value: WorkerAuthContext | NextResponse): value is WorkerAuthContext {
  return !(value instanceof NextResponse);
}

export function toPendingJobResponse(job: LocalFileSyncJobRecord) {
  return {
    job_id: job.id,
    file_id: job.fileId,
    order_id: job.orderId,
    order_no: job.orderNo,
    filename: job.storedFilename,
    filesize: job.fileSizeBytes,
    relative_path: job.relativePath,
    sha256: job.sha256,
  };
}

export async function validateWorkerJobFile(job: LocalFileSyncJobWithFileRecord): Promise<SafeWorkerFile> {
  const uploadRoot = resolve(getUploadDir());
  const sourcePath = resolve(job.sourceFilepath);
  const relativePath = relative(uploadRoot, sourcePath);

  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    relativePath.includes(`..${sep}`) ||
    resolve(uploadRoot, relativePath) !== sourcePath ||
    basename(sourcePath) !== job.storedFilename
  ) {
    throw new Error("unsafe-file-path");
  }

  const fileStat = await stat(sourcePath);

  if (!fileStat.isFile()) {
    throw new Error("source-file-not-found");
  }

  return {
    absolutePath: sourcePath,
    relativePath,
    size: fileStat.size,
  };
}

export async function sha256File(filePath: string) {
  const hash = createHash("sha256");

  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });

  return hash.digest("hex");
}

export function streamFileResponse(file: SafeWorkerFile, filename: string) {
  const stream = createReadStream(file.absolutePath);
  const body = Readable.toWeb(stream) as ReadableStream;

  return new NextResponse(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${basename(filename)}"`,
      "Content-Length": String(file.size),
      "Content-Type": "application/octet-stream",
    },
  });
}

export function sanitizeWorkerError(value: unknown) {
  const token = process.env.MAKE3D_WORKER_TOKEN;
  let message = value instanceof Error ? value.message : String(value || "worker error");

  if (token) {
    message = message.split(token).join("[redacted-token]");
  }

  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/1[3-9]\d{9}/g, "[redacted-phone]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .slice(0, 500);
}

export function readPositiveId(params: { id: string }) {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function extractWorkerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-make3d-worker-token")?.trim() || "";
}

function safeTokenEqual(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function normalizeWorkerHeader(value: string | null, fallback: string) {
  const normalized = (value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "-")
    .slice(0, 80);

  return normalized || fallback;
}
