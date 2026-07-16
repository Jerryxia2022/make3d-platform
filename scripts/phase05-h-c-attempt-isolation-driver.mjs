#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { copyFile, chmod, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createOrderWithFile, initDatabase } from "../src/backend/database.ts";
import { createSlicingJobForVerifiedFile } from "../src/backend/workerSlicingJobs.ts";
import { PARSER_VERSION, parsePrusaSlicerGcode, sha256File } from "../worker/prusaslicer-result-parser.mjs";
import {
  getPrusaSlicerPackageVersion,
  postParsing,
  postResult,
  postSliced,
  postSlicing,
  resolveArtifactPaths,
  runPrusaSlicer,
  validateRequiredVersions,
  verifyLocalInput,
  verifyProfile,
} from "../worker/make3d-slicing-worker.mjs";

const allowedRoot = "/srv/make3d-worker/test-integration/phase05-h-c";
const dbPath = requireEnv("PHASE05_HC_DB_PATH");
const rootDir = requireEnv("PHASE05_HC_ROOT_DIR");
const sourceStl = requireEnv("PHASE05_HC_SOURCE_STL");
const profilePath = requireEnv("PHASE05_HC_PROFILE_PATH");
const serverUrl = requireEnv("SERVER_URL").replace(/\/+$/, "");
const workerToken = requireEnv("WORKER_TOKEN");
const workerId = process.env.WORKER_ID || "wsl-worker-01";
const slicerVersion = process.env.PHASE05_HC_SLICER_VERSION || (await getPackageVersion());

await assertInsideAllowedRoot(dbPath);
await assertInsideAllowedRoot(rootDir);
await mkdir(join(rootDir, "logs"), { recursive: true, mode: 0o750 });

const summary = {
  database_path: dbPath,
  root_dir: rootDir,
  worker_id: workerId,
  scenarios: {},
};

await runScenario("old_attempt_isolation", oldAttemptIsolationScenario);
await runScenario("sliced_resume_attempt_path", slicedResumeScenario);

console.log(JSON.stringify(summary, null, 2));

async function oldAttemptIsolationScenario() {
  const slowSlicer = await createSlowSlicer();
  const task = await createTask("old-attempt-isolation");
  const lock1 = await lockJob(task.jobId);
  await expectOk(postSlicing(apiConfig(), { job: task.pending, lock: lock1, currentStage: "locked" }, await slicingInput(task.pending)));
  const attempt1Paths = resolveArtifactPaths(rootDir, task.jobId, 1);
  await mkdir(attempt1Paths.processingDir, { recursive: true, mode: 0o750 });
  const oldWorker = spawn(slowSlicer, ["--output", attempt1Paths.processingGcodePartPath], {
    cwd: rootDir,
    shell: false,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const oldStdout = [];
  const oldStderr = [];
  oldWorker.stdout.on("data", (chunk) => oldStdout.push(String(chunk)));
  oldWorker.stderr.on("data", (chunk) => oldStderr.push(String(chunk)));

  const attempt1 = getAttempt(task.jobId, 1);
  expireJob(task.jobId);
  await api("GET", "/api/worker/slicing/jobs/pending");
  await waitForJobStatus(task.jobId, "failed", 10000);

  const pending = await getPendingJob(task.jobId);
  if (pending.resume_from !== null) throw new Error("slicing expiry must not resume from attempt 1");
  const lock2 = await lockJob(task.jobId);
  if (lock2.attempt_no !== 2) throw new Error(`expected attempt 2, got ${lock2.attempt_no}`);
  const slice2 = await runToSliced(task, lock2);
  const before = await artifactEvidence(task.jobId);
  const stale = await api("POST", `/api/worker/slicing/jobs/${task.jobId}/sliced`, staleSlicedPayload(task.jobId, attempt1.lock_owner, slice2));
  if (stale.status !== 409) throw new Error(`old attempt /sliced expected 409, got ${stale.status}`);
  const oldExit = await waitChild(oldWorker, 40000);
  const after = await artifactEvidence(task.jobId);
  assertSameArtifact(before, after);

  await expectOk(postParsing(apiConfig(), { job: task.pending, lock: lock2 }, slice2.gcodeSha256));
  const parsed = await parsePrusaSlicerGcode(before.path, {
    allowedRoots: [resolve(rootDir, "results")],
    parserVersion: PARSER_VERSION,
    sliceParams: task.pending.slice_params,
  });
  await expectOk(postResult(apiConfig(), { job: task.pending, lock: lock2 }, parsed));

  return {
    job_id: task.jobId,
    attempt_1_dir: `processing/prusaslicer/${task.jobId}/attempt-1`,
    attempt_2_dir: `results/prusaslicer/${task.jobId}/attempt-2`,
    attempt_1_status: getAttempt(task.jobId, 1).status,
    attempt_2_status: getAttempt(task.jobId, 2).status,
    old_worker_exit: oldExit,
    old_stdout: oldStdout.join("").trim(),
    old_stderr: oldStderr.join("").trim(),
    stale_sliced_status: stale.status,
    gcode: after,
  };
}

async function slicedResumeScenario() {
  const task = await createTask("sliced-resume-attempt-path");
  const lock1 = await lockJob(task.jobId);
  const firstSlice = await runToSliced(task, lock1);
  const before = await artifactEvidence(task.jobId);
  expireJob(task.jobId);
  const pending = await getPendingJob(task.jobId);
  if (pending.resume_from !== "sliced") throw new Error(`expected sliced resume, got ${pending.resume_from}`);
  const worker = await runWorker("sliced-resume-attempt-path");
  const after = await artifactEvidence(task.jobId);
  assertSameArtifact(before, after);
  if (worker.prusaSlicerRan !== false || worker.resumedFrom !== "sliced") throw new Error("resume Worker did not reuse historical attempt artifact");
  return {
    job_id: task.jobId,
    first_slice: firstSlice,
    worker,
    before,
    after,
  };
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
      customerName: `Phase05-H-C ${label}`,
      phone: "13900000003",
      wechat: "phase05-h-c-test",
      email: "phase05-h-c@example.invalid",
      material: "PLA",
      color: "black",
      quantity: 1,
      estimatedPrice: 0,
      file: {
        filename: `${label}.stl`,
        filepath: `phase05-h-c/${label}.stl`,
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
  await expectOk(postSliced(apiConfig(), context, actualSlicerPackageVersion, sliceResult));
  return {
    gcodeRelativePath: sliceResult.apiPaths.gcode,
    gcodeSizeBytes: sliceResult.gcodeSizeBytes,
    gcodeSha256: sliceResult.gcodeSha256,
  };
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
      LEASE_INTERVAL_MS: "1000",
    },
    timeout: 180000,
  });
  await writeFile(logPath, `${result.stdout}${result.stderr}`, { mode: 0o600 });
  const payload = parseLastJsonLine(result.stdout);
  if (!payload) throw new Error(`Worker did not emit JSON for ${label}`);
  return { ...payload, log_path: logPath };
}

async function createSlowSlicer() {
  const path = join(rootDir, "slow-slicer.cjs");
  const script = `#!/usr/bin/env node
const fs = require("fs");
const out = process.argv[process.argv.indexOf("--output") + 1];
setTimeout(() => {
  fs.mkdirSync(require("path").dirname(out), { recursive: true });
  fs.writeFileSync(out, "; slow slicer should have been killed\\n");
  process.exit(0);
}, 30000);
`;
  await writeFile(path, script, { mode: 0o700 });
  await chmod(path, 0o700);
  return path;
}

function expireJob(jobId) {
  const db = openDirectDb();
  try {
    db.prepare("UPDATE slicing_jobs SET lease_expires_at_ms = 1, lock_expires_at_ms = 1 WHERE id = ?").run(jobId);
    db.prepare("UPDATE slicing_job_attempts SET lease_expires_at_ms = 1 WHERE slicing_job_id = ? AND status IN ('locked', 'slicing', 'sliced', 'parsing')").run(jobId);
  } finally {
    db.close();
  }
}

async function waitForJobStatus(jobId, status, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getJob(jobId).status === status) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`job ${jobId} did not reach ${status}`);
}

async function getPendingJob(jobId) {
  const response = await api("GET", "/api/worker/slicing/jobs/pending");
  await expectOk(response);
  const job = response.body.jobs.find((item) => item.job_id === jobId);
  if (!job) throw new Error(`job ${jobId} not pending`);
  return job;
}

async function lockJob(jobId) {
  const response = await api("POST", `/api/worker/slicing/jobs/${jobId}/lock`, undefined, { rawBody: "" });
  await expectOk(response);
  return response.body;
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

function staleSlicedPayload(jobId, lockOwner, slice) {
  return {
    lock_owner: lockOwner,
    actual_slicer_package_version: slicerVersion,
    slicer_banner_version: `PrusaSlicer-${slicerVersion}`,
    slice_duration_ms: 1,
    exit_code: 0,
    gcode_relative_path: `results/prusaslicer/${jobId}/attempt-1/output.gcode`,
    gcode_size_bytes: slice.gcodeSizeBytes,
    gcode_sha256: slice.gcodeSha256,
    stdout_relative_path: `results/prusaslicer/${jobId}/attempt-1/stdout.log`,
    stderr_relative_path: `results/prusaslicer/${jobId}/attempt-1/stderr.log`,
  };
}

function assertSameArtifact(before, after) {
  if (before.relative_path !== after.relative_path) throw new Error("artifact relative path changed");
  if (before.size_bytes !== after.size_bytes || before.db_size_bytes !== after.db_size_bytes) throw new Error("artifact size changed");
  if (before.sha256 !== after.sha256 || before.db_sha256 !== after.db_sha256) throw new Error("artifact SHA changed");
  if (before.mtime_ms !== after.mtime_ms) throw new Error("artifact mtime changed");
}

function getJob(jobId) {
  const db = openDirectDb();
  try {
    return db.prepare("SELECT * FROM slicing_jobs WHERE id = ?").get(jobId);
  } finally {
    db.close();
  }
}

function getAttempt(jobId, attemptNo) {
  const db = openDirectDb();
  try {
    return db.prepare("SELECT * FROM slicing_job_attempts WHERE slicing_job_id = ? AND attempt_no = ?").get(jobId, attemptNo);
  } finally {
    db.close();
  }
}

function openDirectDb() {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
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

async function waitChild(child, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => reject(new Error("child did not exit")), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolvePromise({ code, signal });
    });
  });
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
