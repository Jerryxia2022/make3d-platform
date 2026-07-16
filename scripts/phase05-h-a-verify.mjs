#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { initDatabase } from "../src/backend/database.ts";
import { sha256File } from "../worker/prusaslicer-result-parser.mjs";

const dbPath = requireEnv("PHASE05_H_DB_PATH");
const rootDir = requireEnv("PHASE05_H_ROOT_DIR");
const workerLogPath = process.env.PHASE05_H_WORKER_LOG || "";

const db = initDatabase(dbPath);

try {
  const job = db.prepare(
    `SELECT *
     FROM slicing_jobs
     ORDER BY id DESC
     LIMIT 1`,
  ).get();
  if (!job) throw new Error("slicing job not found");

  const attempt = db.prepare(
    `SELECT *
     FROM slicing_job_attempts
     WHERE slicing_job_id = ?
     ORDER BY id DESC
     LIMIT 1`,
  ).get(job.id);
  if (!attempt) throw new Error("slicing job attempt not found");

  const gcodePath = join(rootDir, job.gcode_relative_path || "");
  const gcodeStat = await stat(gcodePath);
  const localGcodeSha = await sha256File(gcodePath);
  if (localGcodeSha !== job.gcode_sha256) throw new Error("G-code SHA mismatch");
  const workerResult = workerLogPath ? await readWorkerResult(workerLogPath) : null;

  const summary = {
    database_path: dbPath,
    root_dir: rootDir,
    slicing_job_id: job.id,
    file_id: job.file_id,
    file_sync_job_id: job.file_sync_job_id,
    status: job.status,
    attempt_status: attempt.status,
    attempt_count: job.attempt_count,
    worker_id: job.worker_id,
    artifact_worker_id: job.artifact_worker_id,
    locked_at_ms: job.locked_at_ms,
    lock_expires_at_ms: job.lock_expires_at_ms,
    lease_expires_at_ms: job.lease_expires_at_ms,
    lease_renewed_at_ms: job.lease_renewed_at_ms,
    attempt_started_at_ms: attempt.started_at_ms,
    attempt_lease_renewed_at_ms: attempt.lease_renewed_at_ms,
    attempt_lease_expires_at_ms: attempt.lease_expires_at_ms,
    attempt_lease_delta_ms:
      attempt.lease_expires_at_ms != null && attempt.lease_renewed_at_ms != null
        ? attempt.lease_expires_at_ms - attempt.lease_renewed_at_ms
        : null,
    worker_initial_locked_at_ms: workerResult?.lockedAtMs ?? null,
    worker_initial_lock_expires_at_ms: workerResult?.lockExpiresAtMs ?? null,
    worker_initial_lease_renewed_at_ms: workerResult?.leaseRenewedAtMs ?? null,
    worker_initial_lease_expires_at_ms: workerResult?.initialLeaseExpiresAtMs ?? null,
    worker_initial_lock_delta_ms: workerResult?.initialLockDeltaMs ?? null,
    worker_initial_lease_delta_ms: workerResult?.initialLeaseDeltaMs ?? null,
    gcode_relative_path: job.gcode_relative_path,
    gcode_size_bytes: job.gcode_size_bytes,
    gcode_sha256: job.gcode_sha256,
    local_gcode_size_bytes: gcodeStat.size,
    local_gcode_sha256: localGcodeSha,
    parse_status: job.parse_status,
    metrics_status: job.metrics_status,
    parser_quote_ready: Boolean(job.parser_quote_ready),
    print_time_seconds: job.print_time_seconds,
    filament_weight_mg: job.filament_weight_mg,
    missing_fields_json: job.missing_fields_json,
    warnings_json: job.warnings_json,
  };

  if (!["completed", "partial"].includes(summary.status)) throw new Error(`unexpected job status: ${summary.status}`);
  if (summary.attempt_status !== summary.status) throw new Error(`unexpected attempt status: ${summary.attempt_status}`);
  if (summary.attempt_count !== 1) throw new Error(`unexpected attempt_count: ${summary.attempt_count}`);
  if (summary.worker_id !== "wsl-worker-01") throw new Error(`unexpected worker_id: ${summary.worker_id}`);
  if (summary.artifact_worker_id !== "wsl-worker-01") throw new Error(`unexpected artifact_worker_id: ${summary.artifact_worker_id}`);
  if (summary.attempt_lease_delta_ms !== 120000) throw new Error(`unexpected attempt lease delta: ${summary.attempt_lease_delta_ms}`);
  if (workerLogPath && summary.worker_initial_lock_delta_ms !== 120000) {
    throw new Error(`unexpected initial lock delta: ${summary.worker_initial_lock_delta_ms}`);
  }
  if (workerLogPath && summary.worker_initial_lease_delta_ms !== 120000) {
    throw new Error(`unexpected initial lease delta: ${summary.worker_initial_lease_delta_ms}`);
  }
  if (!summary.gcode_size_bytes || summary.gcode_size_bytes <= 0) throw new Error("G-code size is empty");
  if (summary.gcode_size_bytes !== summary.local_gcode_size_bytes) throw new Error("G-code size mismatch");

  console.log(JSON.stringify(summary, null, 2));
} finally {
  db.close();
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function readWorkerResult(path) {
  const content = await readFile(path, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Ignore non-JSON diagnostic lines.
    }
  }
  return null;
}
