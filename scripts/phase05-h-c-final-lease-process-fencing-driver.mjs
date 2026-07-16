#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { copyFile, chmod, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createOrderWithFile, initDatabase } from "../src/backend/database.ts";
import { createSlicingJobForVerifiedFile } from "../src/backend/workerSlicingJobs.ts";
import { PARSER_VERSION, parsePrusaSlicerGcode, sha256File } from "../worker/prusaslicer-result-parser.mjs";
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

const allowedRoot = "/srv/make3d-worker/test-integration/phase05-h-c-final";
const dbPath = requireEnv("PHASE05_HC_FINAL_DB_PATH");
const rootDir = requireEnv("PHASE05_HC_FINAL_ROOT_DIR");
const sourceStl = requireEnv("PHASE05_HC_FINAL_SOURCE_STL");
const profilePath = requireEnv("PHASE05_HC_FINAL_PROFILE_PATH");
const serverUrl = requireEnv("SERVER_URL").replace(/\/+$/, "");
const workerToken = requireEnv("WORKER_TOKEN");
const workerId = process.env.WORKER_ID || "wsl-worker-01";
const slicerVersion = process.env.PHASE05_HC_FINAL_SLICER_VERSION || (await getPackageVersion());

await assertInsideAllowedRoot(dbPath);
await assertInsideAllowedRoot(rootDir);
await mkdir(join(rootDir, "logs"), { recursive: true, mode: 0o750 });

const summary = {
  database_path: dbPath,
  root_dir: rootDir,
  worker_id: workerId,
  scenarios: {},
};

await runScenario("lease_loss_process_termination", leaseLossProcessTerminationScenario);
await runScenario("worker_sigterm_cleanup", workerSigtermCleanupScenario);
await runScenario("long_parser_heartbeat", longParserHeartbeatScenario);
await runScenario("resume_parser_heartbeat", resumeParserHeartbeatScenario);

console.log(JSON.stringify(summary, null, 2));

async function leaseLossProcessTerminationScenario() {
  const scenario = "lease-loss-process-termination";
  const slowSlicer = await createSlowSlicer(scenario);
  const pidFile = join(rootDir, "logs", `${scenario}-pids.json`);
  const requestLog = join(rootDir, "logs", `${scenario}-requests.jsonl`);
  const workerLog = join(rootDir, "logs", `${scenario}-worker.log`);
  await rm(pidFile, { force: true });
  await rm(requestLog, { force: true });

  const task = await createTask(scenario);
  const worker = spawnWorker({
    scenario,
    prusaSlicerBin: slowSlicer,
    requestLog,
    workerLog,
    extraEnv: {
      PHASE05_HC_FINAL_PID_FILE: pidFile,
      LEASE_INTERVAL_MS: "1000",
    },
  });

  const pids = await waitForPidFile(pidFile, 30000);
  if (!pidExists(pids.parent_pid)) throw new Error("slow slicer parent pid was not running");
  if (!pidExists(pids.child_pid)) throw new Error("slow slicer child pid was not running");

  expireJob(task.jobId);
  await api("GET", "/api/worker/slicing/jobs/pending");
  const workerResult = await waitWorker(worker, 45000);
  await waitForPidGone(pids.parent_pid, 10000);
  await waitForPidGone(pids.child_pid, 10000);

  const job = getJob(task.jobId);
  const requests = await readRequestLog(requestLog);
  const lockedJobId = firstLockedJobId(requests);
  if (lockedJobId !== task.jobId) throw new Error(`Worker SIGTERM scenario locked job ${lockedJobId}, expected ${task.jobId}`);
  const forbiddenReports = requests.filter((request) => /\/(sliced|parsing|result|failed)$/.test(request.path));
  const formalPath = join(rootDir, "results", "prusaslicer", String(task.jobId), "attempt-1", "output.gcode");
  const formalExists = await exists(formalPath);
  if (forbiddenReports.length !== 0) throw new Error("lease loss scenario reported a forbidden terminal state");
  if (formalExists) throw new Error("lease loss scenario published formal G-code");
  if (pidExists(pids.parent_pid) || pidExists(pids.child_pid)) throw new Error("lease loss scenario left slicer processes running");
  retireJob(task.jobId);

  return {
    job_id: task.jobId,
    worker_pid: worker.pid,
    slicer_parent_pid: pids.parent_pid,
    slicer_child_pid: pids.child_pid,
    lease_error_statuses: requests.filter((request) => request.path.endsWith("/lease") && request.status >= 400).map((request) => request.status),
    sigterm_sent: true,
    sigkill_scheduled: true,
    parent_pid_exists_final: pidExists(pids.parent_pid),
    child_pid_exists_final: pidExists(pids.child_pid),
    worker_exit: workerResult,
    forbidden_report_count: forbiddenReports.length,
    formal_gcode_exists: formalExists,
    final_job_status: job.status,
    final_error_code: job.lastErrorCode,
    request_log: requestLog,
    worker_log: workerLog,
  };
}

async function workerSigtermCleanupScenario() {
  const scenario = "worker-sigterm-cleanup";
  const slowSlicer = await createSlowSlicer(scenario);
  const pidFile = join(rootDir, "logs", `${scenario}-pids.json`);
  const requestLog = join(rootDir, "logs", `${scenario}-requests.jsonl`);
  const workerLog = join(rootDir, "logs", `${scenario}-worker.log`);
  await rm(pidFile, { force: true });
  await rm(requestLog, { force: true });

  const task = await createTask(scenario);
  const worker = spawnWorker({
    scenario,
    prusaSlicerBin: slowSlicer,
    requestLog,
    workerLog,
    extraEnv: {
      PHASE05_HC_FINAL_PID_FILE: pidFile,
      LEASE_INTERVAL_MS: "1000",
    },
  });
  const pids = await waitForPidFile(pidFile, 30000);
  if (!pidExists(pids.parent_pid) || !pidExists(pids.child_pid)) throw new Error("slow slicer process tree did not start");

  process.kill(worker.pid, "SIGTERM");
  const workerResult = await waitWorker(worker, 45000);
  await waitForPidGone(pids.parent_pid, 10000);
  await waitForPidGone(pids.child_pid, 10000);

  const requests = await readRequestLog(requestLog);
  const forbiddenReports = requests.filter((request) => /\/(sliced|parsing|result|failed)$/.test(request.path));
  const formalPath = join(rootDir, "results", "prusaslicer", String(task.jobId), "attempt-1", "output.gcode");
  const formalExists = await exists(formalPath);
  if (forbiddenReports.length !== 0) throw new Error("Worker SIGTERM scenario reported a forbidden terminal state");
  if (formalExists) throw new Error("Worker SIGTERM scenario published formal G-code");
  if (pidExists(pids.parent_pid) || pidExists(pids.child_pid)) throw new Error("Worker SIGTERM scenario left slicer processes running");
  const finalJob = getJob(task.jobId);
  retireJob(task.jobId);

  return {
    job_id: task.jobId,
    worker_pid: worker.pid,
    slicer_parent_pid: pids.parent_pid,
    slicer_child_pid: pids.child_pid,
    sigterm_sent_to_worker: true,
    sigterm_sent_to_slicer_group: true,
    sigkill_scheduled: true,
    parent_pid_exists_final: pidExists(pids.parent_pid),
    child_pid_exists_final: pidExists(pids.child_pid),
    worker_exit: workerResult,
    forbidden_report_count: forbiddenReports.length,
    formal_gcode_exists: formalExists,
    final_job_status_before_retire: finalJob.status,
    request_log: requestLog,
    worker_log: workerLog,
  };
}

async function longParserHeartbeatScenario() {
  const scenario = "long-parser-heartbeat";
  const requestLog = join(rootDir, "logs", `${scenario}-requests.jsonl`);
  const workerLog = join(rootDir, "logs", `${scenario}-worker.log`);
  await rm(requestLog, { force: true });
  const task = await createTask(scenario);
  const result = await runWorkerOnce({
    scenario,
    requestLog,
    workerLog,
    parserDelayMs: 35000,
    leaseIntervalMs: 1000,
  });
  const requests = await readRequestLog(requestLog);
  if (result.jobId !== task.jobId) throw new Error(`long parser Worker picked job ${result.jobId}, expected ${task.jobId}`);
  const parsingIndex = requests.findIndex((request) => request.path.endsWith("/parsing"));
  const leasesAfterParsing = parsingIndex >= 0 ? requests.slice(parsingIndex + 1).filter((request) => request.path.endsWith("/lease") && request.status === 200) : [];
  const finalJob = getJob(task.jobId);
  if (leasesAfterParsing.length < 1) throw new Error("long parser scenario did not renew after parsing started");
  if (!requests.some((request) => request.path.endsWith("/result") && request.status === 200)) throw new Error("long parser scenario did not post result");
  retireJob(task.jobId);
  return {
    job_id: task.jobId,
    worker_result: result,
    lease_calls_after_parsing: leasesAfterParsing.length,
    result_called: requests.some((request) => request.path.endsWith("/result") && request.status === 200),
    final_status: finalJob.status,
    request_log: requestLog,
    worker_log: workerLog,
  };
}

async function resumeParserHeartbeatScenario() {
  const scenario = "resume-parser-heartbeat";
  const requestLog = join(rootDir, "logs", `${scenario}-requests.jsonl`);
  const workerLog = join(rootDir, "logs", `${scenario}-worker.log`);
  await rm(requestLog, { force: true });
  const task = await createTask(scenario);
  const pendingBeforeLock = await findPending(task.jobId);
  const lock = await lockJob(task.jobId);
  const sliced = await runToParsing(task, lock, pendingBeforeLock);
  const before = getJob(task.jobId);
  expireJob(task.jobId);
  await api("GET", "/api/worker/slicing/jobs/pending");
  const pending = await findPending(task.jobId);
  if (pending.resume_from !== "parsing") throw new Error(`expected resume_from=parsing, got ${pending.resume_from}`);

  const result = await runWorkerOnce({
    scenario,
    requestLog,
    workerLog,
    parserDelayMs: 35000,
    leaseIntervalMs: 1000,
  });
  const requests = await readRequestLog(requestLog);
  if (result.jobId !== task.jobId) throw new Error(`resume parser Worker picked job ${result.jobId}, expected ${task.jobId}`);
  const lockIndex = requests.findIndex((request) => request.path.endsWith("/lock"));
  const leaseAfterLock = requests.slice(lockIndex + 1).filter((request) => request.path.endsWith("/lease") && request.status === 200);
  const after = getJob(task.jobId);
  if (result.resumedFrom !== "parsing") throw new Error(`expected Worker resume_from=parsing, got ${result.resumedFrom}`);
  if (result.prusaSlicerRan !== false) throw new Error("resume parser scenario reran PrusaSlicer");
  if (leaseAfterLock.length < 1) throw new Error("resume parser scenario did not renew lease after lock");
  retireJob(task.jobId);

  return {
    job_id: task.jobId,
    first_gcode_sha256: sliced.gcodeSha256,
    worker_result: result,
    resume_from: result.resumedFrom,
    prusa_slicer_ran: result.prusaSlicerRan,
    lease_calls_after_lock: leaseAfterLock.length,
    gcode_sha_preserved: before.gcodeSha256 === after.gcodeSha256,
    final_status: after.status,
    request_log: requestLog,
    worker_log: workerLog,
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
      customerName: `Phase05-H-C Final ${label}`,
      phone: "13900000004",
      wechat: "phase05-h-c-final-test",
      email: "phase05-h-c-final@example.invalid",
      material: "PLA",
      color: "black",
      quantity: 1,
      estimatedPrice: 0,
      file: {
        filename: `${label}.stl`,
        filepath: `phase05-h-c-final/${label}.stl`,
        filesize: sourceInfo.size,
      },
    });
    const file = db.prepare("SELECT id FROM files WHERE order_id = ? ORDER BY id DESC LIMIT 1").get(order.id);
    const inputRelativePath = `files/${file.id}-synthetic-cube.stl`;
    const localPath = join(filesDir, `${file.id}-synthetic-cube.stl`);
    await copyFile(sourceStl, localPath);
    const localSha = await sha256File(localPath);
    if (localSha !== sourceSha) throw new Error("copied STL SHA mismatch");
    const sync = db.prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = ?").get(file.id);
    db.prepare(
      `UPDATE local_file_sync_jobs
       SET sync_status = 'verified',
           worker_id = ?,
           relative_path = ?,
           local_path = ?,
           local_sha256 = ?,
           local_synced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(workerId, inputRelativePath, localPath, localSha, sync.id);
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
    return { label, orderNo: order.orderNo, fileId: file.id, syncJobId: sync.id, jobId: slicing.job.id };
  } finally {
    db.close();
  }
}

async function runToParsing(task, lock, pending) {
  const context = { job: pending, lock, currentStage: "locked" };
  const input = await verifyLocalInput({ rootDir }, pending);
  const profile = await verifyProfile(pending, { "bambu-p1s": { path: profilePath } });
  const actualSlicerPackageVersion = await getPrusaSlicerPackageVersion({ execFileImpl: execFile });
  validateRequiredVersions(pending, actualSlicerPackageVersion, PARSER_VERSION);
  await expectOk(postSlicing(apiConfig(), context, {
    actualSlicerPackageVersion,
    inputSha256: input.sha256,
    profileSha256: profile.sha256,
  }));
  context.currentStage = "slicing";
  const sliceResult = await runPrusaSlicer(apiConfig(), context, input, profile, actualSlicerPackageVersion);
  await expectOk(postSliced(apiConfig(), context, actualSlicerPackageVersion, sliceResult));
  await expectOk(postParsing(apiConfig(), context, sliceResult.gcodeSha256));
  const parsed = await parsePrusaSlicerGcode(sliceResult.gcodePath, {
    allowedRoots: [resolve(rootDir, "results")],
    parserVersion: PARSER_VERSION,
    sliceParams: pending.slice_params,
  });
  return { ...sliceResult, parsed };
}

function spawnWorker({ scenario, prusaSlicerBin, requestLog, workerLog, extraEnv = {} }) {
  const child = spawn(process.execPath, ["worker/make3d-slicing-worker.mjs", "--once"], {
    cwd: resolve("."),
    env: workerEnv({ prusaSlicerBin, requestLog, extraEnv }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
  child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
  child.on("close", async () => {
    await writeFile(workerLog, chunks.join(""), { mode: 0o600 });
  });
  child.scenario = scenario;
  child.outputChunks = chunks;
  return child;
}

async function runWorkerOnce({ scenario, requestLog, workerLog, parserDelayMs, leaseIntervalMs }) {
  const result = await execFilePromise(process.execPath, ["worker/make3d-slicing-worker.mjs", "--once"], {
    cwd: resolve("."),
    env: workerEnv({
      requestLog,
      extraEnv: {
        MAKE3D_WORKER_PARSER_DELAY_MS: String(parserDelayMs || 0),
        LEASE_INTERVAL_MS: String(leaseIntervalMs || 1000),
      },
    }),
    timeout: 180000,
  });
  await writeFile(workerLog, `${result.stdout}${result.stderr}`, { mode: 0o600 });
  const payload = parseLastJsonLine(result.stdout);
  if (!payload) throw new Error(`Worker did not emit JSON for ${scenario}`);
  return payload;
}

function workerEnv({ prusaSlicerBin = "/usr/bin/prusa-slicer", requestLog, extraEnv = {} }) {
  return {
    ...process.env,
    SERVER_URL: serverUrl,
    WORKER_TOKEN: workerToken,
    WORKER_ID: workerId,
    ROOT_DIR: rootDir,
    PRUSASLICER_BIN: prusaSlicerBin,
    MAKE3D_WORKER_INTEGRATION_TEST_MODE: "1",
    MAKE3D_WORKER_REQUEST_LOG_PATH: requestLog,
    ...extraEnv,
  };
}

async function createSlowSlicer(label) {
  const path = join(rootDir, `${label}-slow-slicer.cjs`);
  const script = `#!/usr/bin/env node
const fs = require("fs");
const { spawn } = require("child_process");
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";
const pidFile = process.env.PHASE05_HC_FINAL_PID_FILE;
const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{}, 1000);"], { stdio: "ignore" });
if (pidFile) {
  fs.writeFileSync(pidFile, JSON.stringify({ parent_pid: process.pid, child_pid: child.pid, output }) + "\\n");
}
if (output) {
  fs.mkdirSync(require("path").dirname(output), { recursive: true });
  fs.writeFileSync(output, "; slow slicer diagnostic partial output\\n");
}
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`;
  await writeFile(path, script, { mode: 0o700 });
  await chmod(path, 0o700);
  return path;
}

async function waitForPidFile(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await exists(path)) return JSON.parse(await readFile(path, "utf8"));
    await sleep(100);
  }
  throw new Error(`pid file not written: ${path}`);
}

async function waitForPidGone(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidExists(pid)) return;
    await sleep(100);
  }
  throw new Error(`pid still exists: ${pid}`);
}

function pidExists(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function waitWorker(child, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Worker ${child.scenario} did not exit`)), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolvePromise({
        code,
        signal,
        payload: parseLastJsonLine(child.outputChunks.join("")),
      });
    });
  });
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

function retireJob(jobId) {
  const db = openDirectDb();
  try {
    db.prepare(
      `UPDATE slicing_jobs
       SET status = 'failed',
           last_error_code = 'SLICER_NON_ZERO_EXIT',
           last_error = 'phase05-h-c-final scenario retired',
           lock_owner = NULL,
           locked_at_ms = NULL,
           lock_expires_at_ms = NULL,
           lease_expires_at_ms = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(jobId);
    db.prepare(
      `UPDATE slicing_job_attempts
       SET status = CASE WHEN status IN ('completed', 'partial', 'failed', 'expired') THEN status ELSE 'failed' END,
           error_code = 'SLICER_NON_ZERO_EXIT',
           error_message = 'phase05-h-c-final scenario retired',
           updated_at = CURRENT_TIMESTAMP
       WHERE slicing_job_id = ?`,
    ).run(jobId);
  } finally {
    db.close();
  }
}

function firstLockedJobId(requests) {
  const lock = requests.find((request) => /\/api\/worker\/slicing\/jobs\/[0-9]+\/lock$/.test(request.path));
  if (!lock) return null;
  const match = lock.path.match(/\/jobs\/([0-9]+)\/lock$/);
  return match ? Number(match[1]) : null;
}

async function findPending(jobId) {
  const response = await api("GET", "/api/worker/slicing/jobs/pending");
  const job = response.body.jobs.find((item) => item.job_id === jobId);
  if (!job) throw new Error(`job ${jobId} not pending`);
  return job;
}

async function lockJob(jobId) {
  const response = await api("POST", `/api/worker/slicing/jobs/${jobId}/lock`, undefined, { rawBody: "" });
  if (response.status !== 200) throw new Error(`lock failed: ${response.status}`);
  return response.body;
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

async function readRequestLog(path) {
  if (!(await exists(path))) return [];
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

function getJob(jobId) {
  const db = openDirectDb();
  try {
    return db.prepare("SELECT * FROM slicing_jobs WHERE id = ?").get(jobId);
  } finally {
    db.close();
  }
}

function openDirectDb() {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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
