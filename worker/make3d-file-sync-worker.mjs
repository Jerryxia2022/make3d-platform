#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const WORKER_VERSION = "phase04-a";
export const DEFAULT_ROOT_DIR = "/srv/make3d-worker";
export const DEFAULT_ENV_PATH = "/etc/make3d-worker.env";
export const ALLOWED_ENV_KEYS = new Set([
  "SERVER_URL",
  "WORKER_TOKEN",
  "WORKER_ID",
  "POLL_INTERVAL",
]);

const REQUIRED_DIRS = ["incoming", "processing", "files", "failed", "logs"];

export function parseWorkerEnv(content) {
  const values = {};
  const lines = String(content || "").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error("invalid env line");
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (!ALLOWED_ENV_KEYS.has(key)) {
      throw new Error(`disallowed env key: ${key}`);
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

export async function loadWorkerConfig(options = {}) {
  const envPath = options.envPath || DEFAULT_ENV_PATH;
  let fileEnv = {};

  try {
    fileEnv = parseWorkerEnv(await readFile(envPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const merged = {
    ...fileEnv,
    SERVER_URL: process.env.SERVER_URL || fileEnv.SERVER_URL,
    WORKER_TOKEN: process.env.WORKER_TOKEN || fileEnv.WORKER_TOKEN,
    WORKER_ID: process.env.WORKER_ID || fileEnv.WORKER_ID,
    POLL_INTERVAL: process.env.POLL_INTERVAL || fileEnv.POLL_INTERVAL,
  };

  const serverUrl = normalizeServerUrl(merged.SERVER_URL);
  const workerToken = String(merged.WORKER_TOKEN || "").trim();

  if (!serverUrl) {
    throw new Error("SERVER_URL is required");
  }

  if (!workerToken || workerToken === "replace-with-worker-token") {
    throw new Error("WORKER_TOKEN is required");
  }

  return {
    serverUrl,
    workerToken,
    workerId: sanitizeWorkerId(merged.WORKER_ID || "wsl-worker-01"),
    pollIntervalMs: normalizePollInterval(merged.POLL_INTERVAL),
    rootDir: options.rootDir || DEFAULT_ROOT_DIR,
  };
}

export function sanitizeFilename(value, fallback = "file") {
  const raw = String(value || "").replace(/\\/g, "/").split("/").pop() || fallback;
  const sanitized = raw
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);

  return sanitized || fallback;
}

export function sanitizePathSegment(value, fallback = "unknown") {
  const sanitized = sanitizeFilename(value, fallback).replace(/\./g, "_").slice(0, 80);
  return sanitized || fallback;
}

export function assertInsideRoot(rootDir, targetPath) {
  const root = resolve(rootDir);
  const target = resolve(targetPath);
  const pathDiff = relative(root, target);

  if (pathDiff === "" || (!pathDiff.startsWith("..") && !isAbsolute(pathDiff))) {
    return target;
  }

  throw new Error("path escapes worker root");
}

export async function ensureWorkerDirectories(rootDir = DEFAULT_ROOT_DIR) {
  for (const dir of REQUIRED_DIRS) {
    await mkdir(assertInsideRoot(rootDir, join(rootDir, dir)), { recursive: true });
  }
}

export async function writeHeartbeat(rootDir, config, status) {
  await ensureWorkerDirectories(rootDir);
  const heartbeatPath = assertInsideRoot(rootDir, join(rootDir, "logs", "heartbeat.json"));
  const diskFree = await getDiskFree(rootDir);
  const heartbeat = {
    worker_id: config.workerId,
    hostname: hostname(),
    version: WORKER_VERSION,
    last_seen: new Date().toISOString(),
    disk_free: diskFree,
    status,
  };

  await writeFile(heartbeatPath, `${JSON.stringify(heartbeat, null, 2)}\n`, { mode: 0o600 });
  return heartbeat;
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  const stream = Readable.toWeb(Readable.from(await readFile(filePath)));
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    hash.update(value);
  }

  return hash.digest("hex");
}

export async function prepareFinalPath(rootDir, job) {
  const orderSegment = sanitizePathSegment(job.order_no || `order-${job.order_id}`, "order");
  const fileName = `${Number(job.file_id)}-${sanitizeFilename(job.filename, "file.bin")}`;
  const finalDir = assertInsideRoot(rootDir, join(rootDir, "files", orderSegment));
  const finalPath = assertInsideRoot(rootDir, join(finalDir, fileName));

  await mkdir(finalDir, { recursive: true });
  return finalPath;
}

export async function moveVerifiedFile(rootDir, tempPath, finalPath, expectedSha256) {
  assertInsideRoot(rootDir, tempPath);
  assertInsideRoot(rootDir, finalPath);

  try {
    await access(finalPath);
    const existingSha256 = await sha256File(finalPath);

    if (existingSha256 === expectedSha256) {
      await rm(tempPath, { force: true });
      return { finalPath, reused: true };
    }

    throw new Error("final file already exists with a different SHA-256");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(dirname(finalPath), { recursive: true });
  await rename(tempPath, finalPath);
  return { finalPath, reused: false };
}

export async function processJob(config, job) {
  const lockedJob = await lockJob(config, job.job_id);

  if (!lockedJob) {
    return { status: "skipped", reason: "lock-not-available" };
  }

  const activeJob = lockedJob.job || job;
  const expectedSha256 = String(activeJob.sha256 || job.sha256 || "").toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    await reportFailed(config, activeJob.job_id, "missing expected sha256");
    return { status: "failed", reason: "missing-sha256" };
  }

  const safeFilename = sanitizeFilename(activeJob.filename, "file.bin");
  const tempPath = assertInsideRoot(
    config.rootDir,
    join(config.rootDir, "incoming", `${activeJob.job_id}-${safeFilename}.part`),
  );

  try {
    await moveFailedArtifact(config.rootDir, tempPath, activeJob.job_id, safeFilename).catch(() => {});
    const bytesWritten = await downloadJobFile(config, activeJob.job_id, tempPath);
    const localSha256 = await sha256File(tempPath);

    if (localSha256 !== expectedSha256) {
      await moveFailedArtifact(config.rootDir, tempPath, activeJob.job_id, safeFilename);
      await reportFailed(config, activeJob.job_id, "sha256 mismatch");
      return { status: "failed", reason: "sha256-mismatch" };
    }

    const finalPath = await prepareFinalPath(config.rootDir, activeJob);
    const moveResult = await moveVerifiedFile(config.rootDir, tempPath, finalPath, expectedSha256);
    await verifyJob(config, activeJob.job_id, {
      local_path: moveResult.finalPath,
      local_sha256: localSha256,
      file_size_bytes: bytesWritten,
    });

    return {
      status: "verified",
      jobId: activeJob.job_id,
      finalPath: moveResult.finalPath,
      sha256: localSha256,
      reused: moveResult.reused,
    };
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    await reportFailed(config, activeJob.job_id, sanitizeWorkerError(error)).catch(() => {});
    return { status: "failed", reason: sanitizeWorkerError(error) };
  }
}

export async function pollOnce(config) {
  await ensureWorkerDirectories(config.rootDir);
  await writeHeartbeat(config.rootDir, config, "polling");
  const jobs = await getPendingJobs(config);
  const results = [];

  for (const job of jobs) {
    results.push(await processJob(config, job));
  }

  await writeHeartbeat(config.rootDir, config, jobs.length ? "processed" : "idle");
  return results;
}

export async function runWorker(config) {
  await ensureWorkerDirectories(config.rootDir);
  await writeHeartbeat(config.rootDir, config, "starting");
  logInfo(config, "worker started");

  while (true) {
    try {
      await pollOnce(config);
    } catch (error) {
      await writeHeartbeat(config.rootDir, config, "error").catch(() => {});
      logError(config, sanitizeWorkerError(error));
    }

    await sleep(config.pollIntervalMs);
  }
}

export async function getPendingJobs(config) {
  const response = await workerFetch(config, "/api/worker/jobs/pending");
  const payload = await response.json();
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

export async function lockJob(config, jobId) {
  const response = await workerFetch(config, `/api/worker/jobs/${encodeURIComponent(jobId)}/lock`, {
    method: "POST",
  });

  if (response.status === 409) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`lock failed: ${response.status}`);
  }

  return response.json();
}

export async function downloadJobFile(config, jobId, tempPath) {
  const response = await workerFetch(config, `/api/worker/jobs/${encodeURIComponent(jobId)}/download`);

  if (!response.ok || !response.body) {
    throw new Error(`download failed: ${response.status}`);
  }

  await mkdir(dirname(tempPath), { recursive: true });
  const fileStream = createWriteStream(tempPath, { flags: "wx", mode: 0o600 });
  await pipeline(Readable.fromWeb(response.body), fileStream);
  return (await stat(tempPath)).size;
}

export async function verifyJob(config, jobId, payload) {
  const response = await workerFetch(config, `/api/worker/jobs/${encodeURIComponent(jobId)}/verified`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`verified callback failed: ${response.status}`);
  }
}

export async function reportFailed(config, jobId, message) {
  const response = await workerFetch(config, `/api/worker/jobs/${encodeURIComponent(jobId)}/failed`, {
    method: "POST",
    body: JSON.stringify({ error: sanitizeWorkerError(message) }),
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`failed callback failed: ${response.status}`);
  }
}

export async function workerFetch(config, pathname, options = {}) {
  const url = new URL(pathname, config.serverUrl);
  const headers = new Headers(options.headers || {});

  headers.set("authorization", `Bearer ${config.workerToken}`);
  headers.set("x-make3d-worker-id", config.workerId);
  headers.set("x-make3d-worker-version", WORKER_VERSION);

  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`worker api authorization failed: ${response.status}`);
  }

  return response;
}

export function sanitizeWorkerError(value) {
  return String(value instanceof Error ? value.message : value || "worker error")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/1[3-9]\d{9}/g, "[redacted-phone]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .slice(0, 500);
}

async function moveFailedArtifact(rootDir, tempPath, jobId, safeFilename) {
  const failedPath = assertInsideRoot(
    rootDir,
    join(rootDir, "failed", `${jobId}-${Date.now()}-${safeFilename}.part`),
  );

  await mkdir(dirname(failedPath), { recursive: true });
  await rename(tempPath, failedPath).catch(() => {});
}

async function getDiskFree(rootDir) {
  try {
    const stats = await statfs(rootDir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

function logInfo(config, message) {
  console.log(`[make3d-worker:${config.workerId}] ${message}`);
}

function logError(config, message) {
  console.error(`[make3d-worker:${config.workerId}] ${message}`);
}

function normalizeServerUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function normalizePollInterval(value) {
  const parsed = Number(value || 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.round(parsed * 1000) : 10000;
}

function sanitizeWorkerId(value) {
  return String(value || "wsl-worker-01")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "-")
    .slice(0, 80) || "wsl-worker-01";
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function main() {
  const config = await loadWorkerConfig();
  await runWorker(config);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  main().catch((error) => {
    console.error(`[make3d-worker] ${sanitizeWorkerError(error)}`);
    process.exit(1);
  });
}
