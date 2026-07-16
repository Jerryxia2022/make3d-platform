import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createOrderWithFile, initDatabase } from "../src/backend/database.ts";
import {
  computeParseCacheKey,
  createSlicingJobForVerifiedFile,
  getSlicingJobById,
  WORKER_SLICING_LEASE_DURATION_MS,
} from "../src/backend/workerSlicingJobs.ts";
import { parsePrusaSlicerGcode } from "../worker/prusaslicer-result-parser.mjs";
import { GET as pendingGET } from "../src/app/api/worker/slicing/jobs/pending/route.ts";
import { POST as lockPOST } from "../src/app/api/worker/slicing/jobs/[id]/lock/route.ts";
import { POST as leasePOST } from "../src/app/api/worker/slicing/jobs/[id]/lease/route.ts";
import { POST as slicingPOST } from "../src/app/api/worker/slicing/jobs/[id]/slicing/route.ts";
import { POST as slicedPOST } from "../src/app/api/worker/slicing/jobs/[id]/sliced/route.ts";
import { POST as parsingPOST } from "../src/app/api/worker/slicing/jobs/[id]/parsing/route.ts";
import { POST as resultPOST } from "../src/app/api/worker/slicing/jobs/[id]/result/route.ts";
import { POST as failedPOST } from "../src/app/api/worker/slicing/jobs/[id]/failed/route.ts";

const TOKEN = "phase05-h-b-token";
const WORKER_ID = "wsl-worker-01";
const OTHER_WORKER_ID = "test-other-worker";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

test("retryable Worker failure returns to pending and creates an independent second attempt", async () => {
  await withRecoveryFixture(async ({ dbPath, jobId, url }) => {
    const first = await lockJob(url, jobId);
    assert.equal((await postSlicing(url, jobId, first.lock_owner)).status, 200);
    const failed = await postFailed(url, jobId, first.lock_owner, "slicing", "SLICER_TIMEOUT");
    assert.equal(failed.status, 200);
    assert.equal(getJob(dbPath, jobId).status, "failed");
    assert.equal(getJob(dbPath, jobId).lastErrorCode, "SLICER_TIMEOUT");

    const pending = await pendingJobs(url);
    assert.equal(pending.find((job) => job.job_id === jobId)?.resume_from, null);

    const second = await lockJob(url, jobId);
    assert.equal(second.attempt_no, 2);
    assert.notEqual(second.lock_owner, first.lock_owner);
    await assertOldLockRejected(url, jobId, first.lock_owner);

    const parsed = await completeViaApi(url, jobId, second.lock_owner);
    assert.equal(parsed.status, "partial");
    assertAttemptStatuses(dbPath, jobId, ["failed", "partial"]);
  });
});

test("non-retryable Worker failure does not reappear in pending or create attempt 2", async () => {
  await withRecoveryFixture(async ({ dbPath, jobId, url }) => {
    const lock = await lockJob(url, jobId);
    assert.equal((await postSlicing(url, jobId, lock.lock_owner)).status, 200);
    assert.equal((await postFailed(url, jobId, lock.lock_owner, "slicing", "SLICER_NON_ZERO_EXIT")).status, 200);

    assert.equal(getJob(dbPath, jobId).lastErrorCode, "SLICER_NON_ZERO_EXIT");
    assert.equal((await pendingJobs(url)).some((job) => job.job_id === jobId), false);
    assert.equal((await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId))).status, 409);
    assertAttemptStatuses(dbPath, jobId, ["failed"]);
  });
});

test("locked lease expiry reconciles to failed, relocks with attempt 2, and completes", async () => {
  await withRecoveryFixture(async ({ dbPath, jobId, url }) => {
    const first = await lockJob(url, jobId);
    expireLease(dbPath, jobId);

    const pending = await pendingJobs(url);
    assert.equal(pending.find((job) => job.job_id === jobId)?.resume_from, null);
    assert.equal(getJob(dbPath, jobId).lastErrorCode, "WORKER_LEASE_EXPIRED_LOCKED");
    assertAttemptStatuses(dbPath, jobId, ["expired"]);

    const second = await lockJob(url, jobId);
    assert.equal(second.attempt_no, 2);
    assert.notEqual(second.lock_owner, first.lock_owner);
    const parsed = await completeViaApi(url, jobId, second.lock_owner);
    assert.equal(parsed.status, "partial");
    assertAttemptStatuses(dbPath, jobId, ["expired", "partial"]);
  });
});

test("slicing lease expiry reconciles and requires a new slicing attempt", async () => {
  await withRecoveryFixture(async ({ dbPath, jobId, url }) => {
    const first = await lockJob(url, jobId);
    assert.equal((await postSlicing(url, jobId, first.lock_owner)).status, 200);
    expireLease(dbPath, jobId);

    const pending = await pendingJobs(url);
    assert.equal(pending.find((job) => job.job_id === jobId)?.resume_from, null);
    assert.equal(getJob(dbPath, jobId).lastErrorCode, "WORKER_LEASE_EXPIRED_SLICING");
    assertAttemptStatuses(dbPath, jobId, ["expired"]);

    const second = await lockJob(url, jobId);
    assert.equal(second.attempt_no, 2);
    const parsed = await completeViaApi(url, jobId, second.lock_owner);
    assert.equal(parsed.status, "partial");
    assertAttemptStatuses(dbPath, jobId, ["expired", "partial"]);
  });
});

test("sliced lease expiry resumes from sliced and preserves artifact metadata", async () => {
  await withRecoveryFixture(async ({ dbPath, jobId, url }) => {
    const first = await lockJob(url, jobId);
    const parsed = await reachSliced(url, jobId, first.lock_owner);
    const before = getJob(dbPath, jobId);
    expireLease(dbPath, jobId);

    const pending = await pendingJobs(url);
    assert.equal(pending.find((job) => job.job_id === jobId)?.resume_from, "sliced");
    assert.equal(getJob(dbPath, jobId).lastErrorCode, "WORKER_LEASE_EXPIRED_SLICED");
    assertAttemptStatuses(dbPath, jobId, ["expired"]);

    const second = await lockJob(url, jobId);
    assert.equal(second.resume_from, "sliced");
    assert.equal(second.gcode_sha256, before.gcodeSha256);
    assert.equal(second.gcode_size_bytes, before.gcodeSizeBytes);
    assert.equal(second.gcode_relative_path, before.gcodeRelativePath);

    assert.equal((await postParsing(url, jobId, second.lock_owner, parsed.result.gcode_sha256)).status, 200);
    const result = await postResult(url, jobId, second.lock_owner, parsed);
    assert.equal((await result.json()).status, "partial");
    const after = getJob(dbPath, jobId);
    assert.equal(after.gcodeSha256, before.gcodeSha256);
    assert.equal(after.gcodeSizeBytes, before.gcodeSizeBytes);
    assertAttemptStatuses(dbPath, jobId, ["expired", "partial"]);
  });
});

test("parsing lease expiry resumes from parsing and preserves artifact metadata", async () => {
  await withRecoveryFixture(async ({ dbPath, jobId, url }) => {
    const first = await lockJob(url, jobId);
    const parsed = await reachParsing(url, jobId, first.lock_owner);
    const before = getJob(dbPath, jobId);
    expireLease(dbPath, jobId);

    const pending = await pendingJobs(url);
    assert.equal(pending.find((job) => job.job_id === jobId)?.resume_from, "parsing");
    assert.equal(getJob(dbPath, jobId).lastErrorCode, "WORKER_LEASE_EXPIRED_PARSING");

    const second = await lockJob(url, jobId);
    assert.equal(second.resume_from, "parsing");
    assert.equal((await postParsing(url, jobId, second.lock_owner, parsed.result.gcode_sha256)).status, 200);
    const result = await postResult(url, jobId, second.lock_owner, parsed);
    assert.equal((await result.json()).status, "partial");
    const after = getJob(dbPath, jobId);
    assert.equal(after.gcodeSha256, before.gcodeSha256);
    assertAttemptStatuses(dbPath, jobId, ["expired", "partial"]);
  });
});

test("different artifact Worker never receives sliced or parsing resume_from", async () => {
  await withRecoveryFixture(async ({ dbPath, jobId, url }) => {
    seedResumeArtifact(dbPath, jobId, { workerId: OTHER_WORKER_ID, sha: SHA_B, size: 123 });

    const pending = await pendingJobs(url);
    assert.equal(pending.find((job) => job.job_id === jobId)?.resume_from, null);
    const lock = await lockJob(url, jobId);
    assert.equal(lock.resume_from, null);
  });
});

test("lease renewal uses the frozen duration and does not shorten", async () => {
  await withRecoveryFixture(async ({ dbPath, jobId, url }) => {
    const lock = await lockJob(url, jobId);
    assert.equal(lock.lease_expires_at_ms - lock.lease_renewed_at_ms, WORKER_SLICING_LEASE_DURATION_MS);
    const longFutureLease = Date.now() + 60 * 60 * 1000;
    const db = initDatabase(dbPath);
    db.prepare("UPDATE slicing_jobs SET lease_expires_at_ms = ? WHERE id = ?").run(longFutureLease, jobId);
    db.prepare("UPDATE slicing_job_attempts SET lease_expires_at_ms = ? WHERE lock_owner = ?").run(longFutureLease, lock.lock_owner);
    db.close();

    const renewed = await leasePOST(workerRequest(`${url}/${jobId}/lease`, { method: "POST", body: { lock_owner: lock.lock_owner } }), params(jobId));
    assert.equal(renewed.status, 200);
    const body = await renewed.json();
    assert.equal(body.lease_expires_at_ms, longFutureLease);
    assert.ok(body.lease_renewed_at_ms >= lock.lease_renewed_at_ms);

    assert.equal((await postFailed(url, jobId, lock.lock_owner, "locked", "WORKER_IO_ERROR")).status, 200);
  });
});

async function withRecoveryFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "make3d-slicing-recovery-"));
  const dbPath = join(root, "make3d.db");
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    MAKE3D_WORKER_TOKEN: process.env.MAKE3D_WORKER_TOKEN,
  };
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.MAKE3D_WORKER_TOKEN = TOKEN;

  try {
    const db = initDatabase(dbPath);
    const jobId = createSyntheticSlicingJob(db);
    db.close();
    await run({ dbPath, jobId, root, url: "https://make3d.test/api/worker/slicing/jobs" });
  } finally {
    restoreEnv(previousEnv);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function createSyntheticSlicingJob(db) {
  const order = createOrderWithFile(db, {
    customerId: null,
    customerName: "Phase05-H-B Synthetic TEST",
    phone: "13900000002",
    wechat: "phase05-h-b-test",
    material: "PLA",
    color: "black",
    quantity: 1,
    estimatedPrice: 0,
    file: {
      filename: "test-cube-20mm.stl",
      filepath: "phase05-h-b/test-cube-20mm.stl",
      filesize: 1497,
    },
  });
  const file = db.prepare("SELECT id FROM files WHERE order_id = ? ORDER BY id DESC LIMIT 1").get(order.id);
  const sync = db.prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = ?").get(file.id);
  db.prepare(
    `UPDATE local_file_sync_jobs
     SET sync_status = 'verified',
         worker_id = ?,
         relative_path = ?,
         local_path = ?,
         local_sha256 = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(
    WORKER_ID,
    `files/${file.id}-synthetic-cube.stl`,
    `/srv/make3d-worker/test-integration/phase05-h-b/files/${file.id}-synthetic-cube.stl`,
    SHA_A,
    sync.id,
  );

  return createSlicingJobForVerifiedFile(db, {
    fileSyncJobId: sync.id,
    fileId: file.id,
    profileKey: "bambu-p1s",
    profileVersion: "phase05-b",
    profileSha256: SHA_B,
    sliceParams,
    requiredSlicerPackageVersion: "2.7.2+dfsg-1build2",
    requiredParserVersion: "phase05-c-parser-v1",
  }).job.id;
}

async function pendingJobs(url) {
  const response = await pendingGET(workerRequest(`${url}/pending`));
  assert.equal(response.status, 200);
  return (await response.json()).jobs;
}

async function lockJob(url, jobId) {
  const response = await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId));
  assert.equal(response.status, 200);
  return response.json();
}

function expireLease(dbPath, jobId) {
  const db = initDatabase(dbPath);
  db.prepare("UPDATE slicing_jobs SET lease_expires_at_ms = 1, lock_expires_at_ms = 1 WHERE id = ?").run(jobId);
  db.prepare("UPDATE slicing_job_attempts SET lease_expires_at_ms = 1 WHERE slicing_job_id = ? AND status IN ('locked', 'slicing', 'sliced', 'parsing')").run(jobId);
  db.close();
}

async function reachSliced(url, jobId, lockOwner) {
  const dbPath = process.env.DATABASE_URL.replace(/^file:/, "");
  const attemptNo = getJob(dbPath, jobId).attemptCount;
  assert.equal((await postSlicing(url, jobId, lockOwner)).status, 200);
  const parsed = await createParsedPayload();
  assert.equal((await slicedPOST(workerRequest(`${url}/${jobId}/sliced`, { method: "POST", body: slicedPayload(jobId, parsed, lockOwner, attemptNo) }), params(jobId))).status, 200);
  return parsed;
}

async function reachParsing(url, jobId, lockOwner) {
  const parsed = await reachSliced(url, jobId, lockOwner);
  assert.equal((await postParsing(url, jobId, lockOwner, parsed.result.gcode_sha256)).status, 200);
  return parsed;
}

async function completeViaApi(url, jobId, lockOwner) {
  const parsed = await reachParsing(url, jobId, lockOwner);
  const response = await postResult(url, jobId, lockOwner, parsed);
  assert.equal(response.status, 200);
  return response.json();
}

function postSlicing(url, jobId, lockOwner) {
  return slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body: validSlicingBody(lockOwner, jobId) }), params(jobId));
}

function postParsing(url, jobId, lockOwner, gcodeSha) {
  return parsingPOST(
    workerRequest(`${url}/${jobId}/parsing`, {
      method: "POST",
      body: { lock_owner: lockOwner, actual_parser_version: "phase05-c-parser-v1", gcode_sha256: gcodeSha },
    }),
    params(jobId),
  );
}

function postResult(url, jobId, lockOwner, parsed) {
  return resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: resultPayload(parsed, lockOwner) }), params(jobId));
}

function postFailed(url, jobId, lockOwner, stage, errorCode) {
  return failedPOST(
    workerRequest(`${url}/${jobId}/failed`, {
      method: "POST",
      body: { lock_owner: lockOwner, stage, error_code: errorCode, error_message: errorCode },
    }),
    params(jobId),
  );
}

async function assertOldLockRejected(url, jobId, oldLockOwner) {
  const parsed = await createParsedPayload();
  const checks = [
    leasePOST(workerRequest(`${url}/${jobId}/lease`, { method: "POST", body: { lock_owner: oldLockOwner } }), params(jobId)),
    postSlicing(url, jobId, oldLockOwner),
    slicedPOST(workerRequest(`${url}/${jobId}/sliced`, { method: "POST", body: slicedPayload(jobId, parsed, oldLockOwner) }), params(jobId)),
    postParsing(url, jobId, oldLockOwner, parsed.result.gcode_sha256),
    postResult(url, jobId, oldLockOwner, parsed),
    postFailed(url, jobId, oldLockOwner, "locked", "WORKER_IO_ERROR"),
  ];
  for (const responsePromise of checks) {
    const response = await responsePromise;
    assert.ok([409, 422].includes(response.status), `old lock should be rejected, got ${response.status}`);
  }
}

function assertAttemptStatuses(dbPath, jobId, expected) {
  const db = initDatabase(dbPath);
  const rows = db
    .prepare("SELECT attempt_no AS attemptNo, status FROM slicing_job_attempts WHERE slicing_job_id = ? ORDER BY attempt_no")
    .all(jobId);
  db.close();
  assert.deepEqual(rows.map((row) => row.attemptNo), expected.map((_, index) => index + 1));
  assert.deepEqual(rows.map((row) => row.status), expected);
}

function seedResumeArtifact(dbPath, jobId, options = {}) {
  const db = initDatabase(dbPath);
  const workerId = options.workerId || WORKER_ID;
  const attemptNo = options.attemptNo || 1;
  const sha = options.sha || SHA_B;
  const size = options.size || 123;
  const gcodePath = `results/prusaslicer/${jobId}/attempt-${attemptNo}/output.gcode`;
  const stdoutPath = `results/prusaslicer/${jobId}/attempt-${attemptNo}/stdout.log`;
  const stderrPath = `results/prusaslicer/${jobId}/attempt-${attemptNo}/stderr.log`;
  const lockOwner = randomUUID();
  try {
    db.prepare(
      `UPDATE slicing_jobs
       SET status = 'failed',
           attempt_count = MAX(attempt_count, ?),
           last_error_code = ?,
           last_error = 'resume fixture',
           artifact_worker_id = ?,
           gcode_relative_path = ?,
           stdout_relative_path = ?,
           stderr_relative_path = ?,
           gcode_size_bytes = ?,
           gcode_sha256 = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(attemptNo, options.errorCode || "WORKER_LEASE_EXPIRED_SLICED", workerId, gcodePath, stdoutPath, stderrPath, size, sha, jobId);
    db.prepare(
      `INSERT OR REPLACE INTO slicing_job_attempts (
        slicing_job_id,
        attempt_no,
        worker_id,
        lock_owner,
        status,
        started_at_ms,
        finished_at_ms,
        gcode_relative_path,
        stdout_relative_path,
        stderr_relative_path,
        gcode_size_bytes,
        gcode_sha256,
        error_code,
        error_message,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'expired', 1, 2, ?, ?, ?, ?, ?, ?, 'resume fixture', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).run(jobId, attemptNo, workerId, lockOwner, gcodePath, stdoutPath, stderrPath, size, sha, options.errorCode || "WORKER_LEASE_EXPIRED_SLICED");
  } finally {
    db.close();
  }
}

function validSlicingBody(lockOwner, jobId) {
  const job = getJob(process.env.DATABASE_URL.replace(/^file:/, ""), jobId);
  return {
    lock_owner: lockOwner,
    actual_slicer_package_version: "2.7.2+dfsg-1build2",
    actual_parser_version: "phase05-c-parser-v1",
    input_sha256: SHA_A,
    profile_sha256: SHA_B,
    slice_params_sha256: job.sliceParamsSha256,
  };
}

function slicedPayload(jobId, parsed, lockOwner, attemptNo = 1) {
  return {
    lock_owner: lockOwner,
    actual_slicer_package_version: "2.7.2+dfsg-1build2",
    slicer_banner_version: "PrusaSlicer-2.7.2",
    slice_duration_ms: 12345,
    exit_code: 0,
    gcode_relative_path: `results/prusaslicer/${jobId}/attempt-${attemptNo}/output.gcode`,
    gcode_size_bytes: parsed.result.gcode_size_bytes,
    gcode_sha256: parsed.result.gcode_sha256,
    stdout_relative_path: `results/prusaslicer/${jobId}/attempt-${attemptNo}/stdout.log`,
    stderr_relative_path: `results/prusaslicer/${jobId}/attempt-${attemptNo}/stderr.log`,
  };
}

function resultPayload(parsed, lockOwner) {
  const cache = computeParseCacheKey({
    gcodeSha256: parsed.result.gcode_sha256,
    parserVersion: "phase05-c-parser-v1",
  });
  return {
    lock_owner: lockOwner,
    gcode_sha256: parsed.result.gcode_sha256,
    parse_cache_key_version: "1.0",
    parse_cache_key_sha256: cache,
    parse_status: parsed.parse.status,
    metrics_status: parsed.validation.metrics_status,
    parser_quote_ready: parsed.validation.quote_ready,
    metrics: structuredClone(parsed.result),
    metric_sources: structuredClone(parsed.metric_sources),
    metric_validation: structuredClone(parsed.validation),
    missing_fields: [...parsed.parse.missing_fields],
    warnings: [...parsed.parse.warnings],
  };
}

async function createParsedPayload() {
  const root = await mkdtemp(join(tmpdir(), "make3d-recovery-parser-"));
  await mkdir(root, { recursive: true });
  const filePath = join(root, "fixture.gcode");
  await writeFile(filePath, completeGcode());
  return parsePrusaSlicerGcode(filePath, { allowedRoots: [root], sliceParams });
}

function completeGcode() {
  const lines = ["; generated by PrusaSlicer 2.7.2 on 2026-07-14"];
  for (let index = 1; index <= 10; index += 1) {
    lines.push(";LAYER_CHANGE", `;Z:${(index * 0.2).toFixed(2)}`, `G1 Z${(index * 0.2).toFixed(2)}`);
  }
  lines.push(
    "; filament used [mm] = 2116.64",
    "; filament used [cm3] = 5.09",
    "; total filament used [g] = 0.00",
    "; estimated printing time (normal mode) = 24m 56s",
    "; estimated printing time (silent mode) = 25m 44s",
    "; filament_type = PLA",
    "; printer_model = Bambu Lab P1S",
    "; nozzle_diameter = 0.4",
    "; layer_height = 0.2",
    "; prusaslicer_config = end",
  );
  return `${lines.join("\n")}\n`;
}

function getJob(dbPath, jobId) {
  const db = initDatabase(dbPath);
  try {
    return getSlicingJobById(db, jobId);
  } finally {
    db.close();
  }
}

function workerRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("authorization", `Bearer ${options.token || TOKEN}`);
  headers.set("x-make3d-worker-id", options.workerId || WORKER_ID);

  let body;
  if (options.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  } else if (options.rawBody !== undefined) {
    body = options.rawBody;
  }

  return new Request(url, {
    method: options.method || "GET",
    headers,
    body,
  });
}

function params(jobId) {
  return { params: Promise.resolve({ id: String(jobId) }) };
}

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const sliceParams = {
  material: "PLA",
  printer_model: "Bambu Lab P1S",
  nozzle_diameter_microns: 400,
  layer_height_microns: 200,
  fill_density_percent: 50,
  support_mode: "none",
  brim_width_microns: 0,
};
