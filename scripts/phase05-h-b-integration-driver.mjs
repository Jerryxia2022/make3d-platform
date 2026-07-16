#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createOrderWithFile, initDatabase } from "../src/backend/database.ts";
import { createSlicingJobForVerifiedFile } from "../src/backend/workerSlicingJobs.ts";
import {
  PARSER_VERSION,
  sha256File,
} from "../worker/prusaslicer-result-parser.mjs";
import {
  getPrusaSlicerPackageVersion,
  postParsing,
  postSliced,
  postSlicing,
  runPrusaSlicer,
  validateRequiredVersions,
  verifyLocalInput,
  verifyProfile,
} from "../worker/make3d-slicing-worker.mjs";

const allowedRoot = "/srv/make3d-worker/test-integration/phase05-h-b";
const dbPath = requireEnv("PHASE05_HB_DB_PATH");
const rootDir = requireEnv("PHASE05_HB_ROOT_DIR");
const sourceStl = requireEnv("PHASE05_HB_SOURCE_STL");
const profilePath = requireEnv("PHASE05_HB_PROFILE_PATH");
const serverUrl = requireEnv("SERVER_URL").replace(/\/+$/, "");
const workerToken = requireEnv("WORKER_TOKEN");
const workerId = process.env.WORKER_ID || "wsl-worker-01";
const slicerVersion = process.env.PHASE05_HB_SLICER_VERSION || (await getPackageVersion());

await assertInsideAllowedRoot(dbPath);
await assertInsideAllowedRoot(rootDir);
await mkdir(join(rootDir, "logs"), { recursive: true, mode: 0o750 });

const summary = {
  database_path: dbPath,
  root_dir: rootDir,
  server_url: serverUrl,
  worker_id: workerId,
  slicer_version: slicerVersion,
  scenarios: {},
  prusaslicer_run_count: 0,
};

await runScenario("retryable_failure", retryableFailureScenario);
await runScenario("non_retryable_failure", nonRetryableFailureScenario);
await runScenario("locked_expiry", lockedExpiryScenario);
await runScenario("slicing_expiry", slicingExpiryScenario);
await runScenario("sliced_resume", slicedResumeScenario);
await runScenario("parsing_resume", parsingResumeScenario);
await runScenario("different_artifact_worker", differentArtifactWorkerScenario);
await runScenario("lease_renewal", leaseRenewalScenario);
await runScenario("missing_resume_artifact", missingResumeArtifactScenario);

console.log(JSON.stringify(summary, null, 2));

async function retryableFailureScenario() {
  const task = await createTask("retryable-failure");
  const first = await lockJob(task.jobId);
  await expectOk(postSlicing(apiConfig(), { job: task.pending, lock: first }, await slicingInput(task.pending)));
  await expectOk(api("POST", `/api/worker/slicing/jobs/${task.jobId}/failed`, {
    lock_owner: first.lock_owner,
    stage: "slicing",
    error_code: "SLICER_TIMEOUT",
    error_message: "synthetic timeout",
  }));
  const pendingAfterFailure = await getPendingJob(task.jobId);
  if (pendingAfterFailure.resume_from !== null) throw new Error("retryable failure resume_from must be null");
  const worker = await runWorker("retryable-failure");
  if (worker.attemptNo !== 2) throw new Error("retryable failure Worker did not create attempt 2");
  const attempts = getAttempts(task.jobId);
  assertAttemptStatuses(attempts, ["failed", "partial"]);
  return { job_id: task.jobId, attempt_statuses: redactAttempts(attempts), worker };
}

async function nonRetryableFailureScenario() {
  const task = await createTask("non-retryable-failure");
  const first = await lockJob(task.jobId);
  await expectOk(postSlicing(apiConfig(), { job: task.pending, lock: first }, await slicingInput(task.pending)));
  await expectOk(api("POST", `/api/worker/slicing/jobs/${task.jobId}/failed`, {
    lock_owner: first.lock_owner,
    stage: "slicing",
    error_code: "SLICER_NON_ZERO_EXIT",
    error_message: "synthetic non-zero",
  }));
  if (await maybePendingJob(task.jobId)) throw new Error("non-retryable failure returned to pending");
  const relock = await api("POST", `/api/worker/slicing/jobs/${task.jobId}/lock`, undefined, { rawBody: "" });
  if (relock.status !== 409) throw new Error(`non-retryable relock expected 409, got ${relock.status}`);
  const attempts = getAttempts(task.jobId);
  assertAttemptStatuses(attempts, ["failed"]);
  return { job_id: task.jobId, attempt_statuses: redactAttempts(attempts), relock_status: relock.status };
}

async function lockedExpiryScenario() {
  const task = await createTask("locked-expiry");
  await lockJob(task.jobId);
  await expireJob(task.jobId);
  const pending = await getPendingJob(task.jobId);
  if (pending.resume_from !== null) throw new Error("locked expiry resume_from must be null");
  const worker = await runWorker("locked-expiry");
  if (worker.attemptNo !== 2) throw new Error("locked expiry Worker did not create attempt 2");
  const attempts = getAttempts(task.jobId);
  assertAttemptStatuses(attempts, ["expired", "partial"]);
  return { job_id: task.jobId, last_error_code: getJob(task.jobId).last_error_code, attempt_statuses: redactAttempts(attempts), worker };
}

async function slicingExpiryScenario() {
  const task = await createTask("slicing-expiry");
  const first = await lockJob(task.jobId);
  await expectOk(postSlicing(apiConfig(), { job: task.pending, lock: first }, await slicingInput(task.pending)));
  await expireJob(task.jobId);
  const pending = await getPendingJob(task.jobId);
  if (pending.resume_from !== null) throw new Error("slicing expiry resume_from must be null");
  const worker = await runWorker("slicing-expiry");
  if (worker.attemptNo !== 2) throw new Error("slicing expiry Worker did not create attempt 2");
  const attempts = getAttempts(task.jobId);
  assertAttemptStatuses(attempts, ["expired", "partial"]);
  return { job_id: task.jobId, last_error_code: getJob(task.jobId).last_error_code, attempt_statuses: redactAttempts(attempts), worker };
}

async function slicedResumeScenario() {
  const task = await createTask("sliced-resume");
  const first = await lockJob(task.jobId);
  const sliced = await runToSliced(task, first);
  const before = await artifactEvidence(task.jobId);
  await expireJob(task.jobId);
  const pending = await getPendingJob(task.jobId);
  if (pending.resume_from !== "sliced") throw new Error(`expected sliced resume, got ${pending.resume_from}`);
  const worker = await runWorker("sliced-resume");
  const after = await artifactEvidence(task.jobId);
  assertSameArtifact(before, after);
  const attempts = getAttempts(task.jobId);
  assertAttemptStatuses(attempts, ["expired", "partial"]);
  return { job_id: task.jobId, before, after, attempt_statuses: redactAttempts(attempts), worker, initial_slice: sliced };
}

async function parsingResumeScenario() {
  const task = await createTask("parsing-resume");
  const first = await lockJob(task.jobId);
  const sliced = await runToSliced(task, first);
  await expectOk(postParsing(apiConfig(), { job: task.pending, lock: first }, sliced.gcodeSha256));
  const before = await artifactEvidence(task.jobId);
  await expireJob(task.jobId);
  const pending = await getPendingJob(task.jobId);
  if (pending.resume_from !== "parsing") throw new Error(`expected parsing resume, got ${pending.resume_from}`);
  const worker = await runWorker("parsing-resume");
  const after = await artifactEvidence(task.jobId);
  assertSameArtifact(before, after);
  const attempts = getAttempts(task.jobId);
  assertAttemptStatuses(attempts, ["expired", "partial"]);
  return { job_id: task.jobId, before, after, attempt_statuses: redactAttempts(attempts), worker };
}

async function differentArtifactWorkerScenario() {
  const task = await createTask("different-artifact-worker");
  const db = initDatabase(dbPath);
  try {
    db.prepare(
      `UPDATE slicing_jobs
       SET status = 'failed',
           last_error_code = 'WORKER_LEASE_EXPIRED_SLICED',
           last_error = 'Worker lease expired after slicing',
           artifact_worker_id = 'test-other-worker',
           gcode_relative_path = ?,
           gcode_size_bytes = 123,
           gcode_sha256 = ?
       WHERE id = ?`,
    ).run(`results/prusaslicer/${task.jobId}/output.gcode`, "b".repeat(64), task.jobId);
  } finally {
    db.close();
  }
  const pending = await getPendingJob(task.jobId);
  if (pending.resume_from !== null) throw new Error("different artifact worker returned resume_from");
  cancelTestJob(task.jobId);
  return { job_id: task.jobId, resume_from: pending.resume_from, artifact_worker_id: "test-other-worker" };
}

async function leaseRenewalScenario() {
  const task = await createTask("lease-renewal");
  const first = await lockJob(task.jobId);
  const before = getJob(task.jobId);
  const renewedResponse = await api("POST", `/api/worker/slicing/jobs/${task.jobId}/lease`, { lock_owner: first.lock_owner });
  await expectOk(renewedResponse);
  const renewed = renewedResponse.body;
  if (renewed.lease_expires_at_ms < before.lease_expires_at_ms) throw new Error("lease renewal shortened expiry");
  if (renewed.lease_renewed_at_ms < before.lease_renewed_at_ms) throw new Error("lease renewal did not update renewed timestamp");
  if (first.lease_expires_at_ms - first.lease_renewed_at_ms !== 120000) throw new Error("lock lease was not 120000 ms");
  await expectOk(api("POST", `/api/worker/slicing/jobs/${task.jobId}/failed`, {
    lock_owner: first.lock_owner,
    stage: "locked",
    error_code: "WORKER_IO_ERROR",
    error_message: "end lease renewal test",
  }));
  exhaustRetryableTestJob(task.jobId);
  return { job_id: task.jobId, initial_lease_delta_ms: first.lease_expires_at_ms - first.lease_renewed_at_ms, renewed };
}

async function missingResumeArtifactScenario() {
  const task = await createTask("missing-resume-artifact");
  const first = await lockJob(task.jobId);
  const sliced = await runToSliced(task, first);
  const before = await artifactEvidence(task.jobId);
  await expireJob(task.jobId);
  await unlink(before.path);
  const worker = await runWorker("missing-resume-artifact");
  if (worker.status !== "failed") throw new Error("missing resume artifact did not fail");
  const attempts = getAttempts(task.jobId);
  assertAttemptStatuses(attempts, ["expired", "failed"]);
  return { job_id: task.jobId, deleted_gcode_path: before.relative_path, attempt_statuses: redactAttempts(attempts), worker, initial_slice: sliced };
}

async function createTask(label) {
  const db = initDatabase(dbPath);
  try {
    const filesDir = resolve(rootDir, "files");
    await mkdir(filesDir, { recursive: true, mode: 0o750 });
    const sourceInfo = await stat(sourceStl);
    const sourceSha = await sha256File(sourceStl);
    const profileSha = await sha256File(profilePath);
    const order = createOrderWithFile(db, {
      customerId: null,
      customerName: `Phase05-H-B ${label}`,
      phone: "13900000002",
      wechat: "phase05-h-b-test",
      email: "phase05-h-b@example.invalid",
      material: "PLA",
      color: "black",
      quantity: 1,
      estimatedPrice: 0,
      file: {
        filename: `${label}.stl`,
        filepath: `phase05-h-b/${label}.stl`,
        filesize: sourceInfo.size,
      },
    });
    const file = db.prepare("SELECT id FROM files WHERE order_id = ? ORDER BY id DESC LIMIT 1").get(order.id);
    const localPath = join(filesDir, `${file.id}-synthetic-cube.stl`);
    await copyFile(sourceStl, localPath);
    const localSha = await sha256File(localPath);
    if (localSha !== sourceSha) throw new Error("copied STL SHA mismatch");
    const sync = db.prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = ?").get(file.id);
    db.prepare(
      `UPDATE local_file_sync_jobs
       SET sync_status = 'verified',
           worker_id = ?,
           local_path = ?,
           local_sha256 = ?,
           local_synced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(workerId, localPath, localSha, sync.id);
    const slicing = createSlicingJobForVerifiedFile(db, {
      fileSyncJobId: sync.id,
      fileId: file.id,
      profileKey: "bambu-p1s",
      profileVersion: "phase05-b",
      profileSha256: profileSha,
      sliceParams: sliceParams(),
      requiredSlicerPackageVersion: slicerVersion,
      requiredParserVersion: PARSER_VERSION,
    });
    const pending = await getPendingJob(slicing.job.id);
    return { label, orderNo: order.orderNo, fileId: file.id, syncJobId: sync.id, jobId: slicing.job.id, pending };
  } finally {
    db.close();
  }
}

async function runToSliced(task, lock) {
  const context = { job: task.pending, lock, currentStage: "locked" };
  const input = await verifyLocalInput({ rootDir }, task.pending);
  const profile = await verifyProfile(task.pending, { "bambu-p1s": { path: profilePath } });
  const actualSlicerPackageVersion = await getPrusaSlicerPackageVersion({ execFileImpl: execFile });
  validateRequiredVersions(task.pending, actualSlicerPackageVersion, PARSER_VERSION);
  await expectOk(postSlicing(apiConfig(), context, {
    actualSlicerPackageVersion,
    inputSha256: input.sha256,
    profileSha256: profile.sha256,
  }));
  context.currentStage = "slicing";
  const sliceResult = await runPrusaSlicer(apiConfig(), context, input, profile, actualSlicerPackageVersion);
  summary.prusaslicer_run_count += 1;
  await expectOk(postSliced(apiConfig(), context, actualSlicerPackageVersion, sliceResult));
  return {
    gcodeRelativePath: sliceResult.apiPaths.gcode,
    gcodeSizeBytes: sliceResult.gcodeSizeBytes,
    gcodeSha256: sliceResult.gcodeSha256,
  };
}

async function runWorker(label) {
  const logPath = join(rootDir, "logs", `${label}-worker.log`);
  const result = await execFilePromise(process.execPath, ["worker/make3d-slicing-worker.mjs", "--once"], {
    cwd: resolve("."),
    env: {
      ...process.env,
      SERVER_URL: serverUrl,
      WORKER_TOKEN: workerToken,
      WORKER_ID: workerId,
      ROOT_DIR: rootDir,
      PRUSASLICER_BIN: "/usr/bin/prusa-slicer",
    },
    timeout: 180000,
  });
  await writeFile(logPath, `${result.stdout}${result.stderr}`, { mode: 0o600 });
  const payload = parseLastJsonLine(result.stdout);
  if (!payload) throw new Error(`Worker did not emit JSON for ${label}`);
  if (payload.prusaSlicerRan) summary.prusaslicer_run_count += 1;
  return { ...payload, log_path: logPath };
}

async function expireJob(jobId) {
  const result = await execFilePromise(process.execPath, [
    "--experimental-strip-types",
    "--experimental-specifier-resolution=node",
    "scripts/phase05-h-b-fault-inject.mjs",
    "--db",
    dbPath,
    "--job",
    String(jobId),
    "--now-ms",
    String(Date.now()),
  ], { cwd: resolve("."), timeout: 30000 });
  return JSON.parse(result.stdout);
}

async function getPendingJob(jobId) {
  const job = await maybePendingJob(jobId);
  if (!job) throw new Error(`job ${jobId} not found in pending list`);
  return job;
}

async function maybePendingJob(jobId) {
  const response = await api("GET", "/api/worker/slicing/jobs/pending");
  await expectOk(response);
  return response.body.jobs.find((job) => job.job_id === jobId) || null;
}

async function lockJob(jobId) {
  const response = await api("POST", `/api/worker/slicing/jobs/${jobId}/lock`, undefined, { rawBody: "" });
  await expectOk(response);
  return response.body;
}

async function slicingInput(job) {
  const input = await verifyLocalInput({ rootDir }, job);
  const profile = await verifyProfile(job, { "bambu-p1s": { path: profilePath } });
  const actualSlicerPackageVersion = await getPrusaSlicerPackageVersion({ execFileImpl: execFile });
  return {
    actualSlicerPackageVersion,
    inputSha256: input.sha256,
    profileSha256: profile.sha256,
  };
}

async function artifactEvidence(jobId) {
  const job = getJob(jobId);
  const path = resolve(rootDir, job.gcode_relative_path || "");
  const info = await stat(path);
  return {
    relative_path: job.gcode_relative_path,
    path,
    size_bytes: info.size,
    db_size_bytes: job.gcode_size_bytes,
    sha256: await sha256File(path),
    db_sha256: job.gcode_sha256,
    mtime_ms: info.mtimeMs,
  };
}

function assertSameArtifact(before, after) {
  if (before.relative_path !== after.relative_path) throw new Error("artifact relative path changed");
  if (before.size_bytes !== after.size_bytes || before.db_size_bytes !== after.db_size_bytes) throw new Error("artifact size changed");
  if (before.sha256 !== after.sha256 || before.db_sha256 !== after.db_sha256) throw new Error("artifact SHA changed");
  if (before.mtime_ms !== after.mtime_ms) throw new Error("artifact mtime changed");
}

function getJob(jobId) {
  const db = initDatabase(dbPath);
  try {
    return db.prepare("SELECT * FROM slicing_jobs WHERE id = ?").get(jobId);
  } finally {
    db.close();
  }
}

function getAttempts(jobId) {
  const db = initDatabase(dbPath);
  try {
    return db
      .prepare(
        `SELECT attempt_no, status, worker_id, started_at_ms, finished_at_ms, error_code,
                lease_renewed_at_ms, lease_expires_at_ms, gcode_relative_path, gcode_size_bytes, gcode_sha256
         FROM slicing_job_attempts
         WHERE slicing_job_id = ?
         ORDER BY attempt_no`,
      )
      .all(jobId);
  } finally {
    db.close();
  }
}

function cancelTestJob(jobId) {
  const db = initDatabase(dbPath);
  try {
    db.prepare("UPDATE slicing_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(jobId);
  } finally {
    db.close();
  }
}

function exhaustRetryableTestJob(jobId) {
  const db = initDatabase(dbPath);
  try {
    db.prepare("UPDATE slicing_jobs SET attempt_count = max_attempts, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(jobId);
  } finally {
    db.close();
  }
}

function assertAttemptStatuses(attempts, expected) {
  const actual = attempts.map((attempt) => attempt.status);
  if (actual.join(",") !== expected.join(",")) throw new Error(`attempt statuses ${actual.join(",")} did not match ${expected.join(",")}`);
}

function redactAttempts(attempts) {
  return attempts.map((attempt) => ({ ...attempt }));
}

function apiConfig() {
  return {
    serverUrl: `${serverUrl}/`,
    workerToken,
    workerId,
    rootDir,
    prusaSlicerBin: "/usr/bin/prusa-slicer",
    fetchImpl: fetch,
    execFileImpl: execFile,
    spawnImpl: spawn,
  };
}

async function api(method, path, body, options = {}) {
  const headers = { Authorization: `Bearer ${workerToken}`, "X-Make3D-Worker-ID": workerId };
  let requestBody;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  } else if (Object.prototype.hasOwnProperty.call(options, "rawBody")) {
    requestBody = options.rawBody;
  }
  const response = await fetch(new URL(path, `${serverUrl}/`), { method, headers, body: requestBody });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  return { status: response.status, body: parsed };
}

async function expectOk(responsePromise) {
  const response = await responsePromise;
  if (response.status === undefined) return response;
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`expected 2xx response, got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response;
}

async function runScenario(name, fn) {
  try {
    summary.scenarios[name] = await fn();
    summary.scenarios[name].passed = true;
  } catch (error) {
    summary.scenarios[name] = { passed: false, error: String(error?.message || error) };
    throw error;
  }
}

async function assertInsideAllowedRoot(path) {
  const actualRoot = await realpath(resolve(allowedRoot));
  const resolvedPath = resolve(path);
  if (resolvedPath !== actualRoot && !resolvedPath.startsWith(`${actualRoot}/`)) {
    throw new Error(`path is outside ${allowedRoot}: ${path}`);
  }
}

async function getPackageVersion() {
  const { stdout } = await execFilePromise("dpkg-query", ["-W", "-f=${Version}", "prusa-slicer"], { timeout: 15000 });
  return stdout.trim();
}

async function execFilePromise(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolvePromise({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function parseLastJsonLine(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Continue scanning.
    }
  }
  return null;
}

function sliceParams() {
  return {
    material: "PLA",
    printer_model: "Bambu Lab P1S",
    nozzle_diameter_microns: 400,
    layer_height_microns: 200,
    fill_density_percent: 50,
    support_mode: "none",
    brim_width_microns: 0,
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
