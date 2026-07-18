import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

const TOKEN = "phase05-g-token";
const WORKER_ID = "wsl-worker-01";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

test("slicing API authentication, job id, lock body, and response cache policy", async () => {
  await withFixture(async ({ jobId, url }) => {
    assert.equal((await pendingGET(new Request(`${url}/pending`))).status, 401);
    assert.equal((await pendingGET(workerRequest(`${url}/pending`, { token: "wrong" }))).status, 401);

    const pending = await pendingGET(workerRequest(`${url}/pending`));
    assert.equal(pending.status, 200);
    assert.equal(pending.headers.get("cache-control"), "no-store");
    assert.equal((await pending.json()).jobs[0].resume_from, null);

    assert.equal((await lockPOST(workerRequest(`${url}/0/lock`, { method: "POST" }), params(0))).status, 400);
    assert.equal((await lockPOST(workerRequest(`${url}/1e3/lock`, { method: "POST" }), params("1e3"))).status, 400);
    assert.equal((await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST", rawBody: "{}" }), params(jobId))).status, 400);

    const lock = await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId));
    assert.equal(lock.status, 200);
    assert.equal(lock.headers.get("pragma"), "no-cache");
    const body = await lock.json();
    assert.match(body.lock_owner, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(body.lease_expires_at_ms - body.lease_renewed_at_ms, WORKER_SLICING_LEASE_DURATION_MS);
    assert.equal(body.lock_expires_at_ms - body.locked_at_ms, WORKER_SLICING_LEASE_DURATION_MS);

    const replay = await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId));
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).created_attempt, false);
  });
});

test("pending route returns only safe verified worker input paths", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    const response = await pendingGET(workerRequest(`${url}/pending`));
    assert.equal(response.status, 200);
    const [job] = (await response.json()).jobs;
    assert.equal(job.job_id, jobId);
    assert.equal(job.order_no.startsWith("M3D"), true);
    assert.equal(job.input_relative_path, "files/model.stl");
    assert.equal(job.input_size_bytes, 123);
    assert.equal(job.input_sha256, SHA_A);
    assert.doesNotMatch(job.input_relative_path, /^[A-Za-z]:|^\/|\\|\.\.|%/);
    assert.equal(JSON.stringify(job).includes("/srv/make3d-worker"), false);

    const db = initDatabase(dbPath);
    try {
      db.prepare("UPDATE local_file_sync_jobs SET sync_status = 'pending' WHERE file_id = ?").run(job.file_id);
      let filtered = await pendingGET(workerRequest(`${url}/pending`));
      assert.deepEqual((await filtered.json()).jobs, []);

      db.prepare("UPDATE local_file_sync_jobs SET sync_status = 'verified', worker_id = 'worker-b' WHERE file_id = ?").run(job.file_id);
      filtered = await pendingGET(workerRequest(`${url}/pending`));
      assert.deepEqual((await filtered.json()).jobs, []);

      db.prepare("UPDATE local_file_sync_jobs SET worker_id = ?, relative_path = ? WHERE file_id = ?").run(WORKER_ID, "../model.stl", job.file_id);
      db.prepare("UPDATE slicing_jobs SET input_relative_path = ? WHERE id = ?").run("../model.stl", jobId);
      filtered = await pendingGET(workerRequest(`${url}/pending`));
      assert.deepEqual((await filtered.json()).jobs, []);

      db.prepare("UPDATE local_file_sync_jobs SET relative_path = ? WHERE file_id = ?").run("files/%2e%2e/model.stl", job.file_id);
      db.prepare("UPDATE slicing_jobs SET input_relative_path = ? WHERE id = ?").run("files/%2e%2e/model.stl", jobId);
      filtered = await pendingGET(workerRequest(`${url}/pending`));
      assert.deepEqual((await filtered.json()).jobs, []);

      db.prepare("UPDATE local_file_sync_jobs SET relative_path = ? WHERE file_id = ?").run("/srv/make3d-worker/files/model.stl", job.file_id);
      db.prepare("UPDATE slicing_jobs SET input_relative_path = ? WHERE id = ?").run("/srv/make3d-worker/files/model.stl", jobId);
      filtered = await pendingGET(workerRequest(`${url}/pending`));
      assert.deepEqual((await filtered.json()).jobs, []);
    } finally {
      db.close();
    }
  });
});

test("slicing API runs normal flow with real parser payload and preserves null metrics", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    const lockBody = await (await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId))).json();
    const lockOwner = lockBody.lock_owner;

    const lease = await leasePOST(
      workerRequest(`${url}/${jobId}/lease`, { method: "POST", body: { lock_owner: lockOwner } }),
      params(jobId),
    );
    assert.equal(lease.status, 200);

    assert.equal(
      (
        await slicingPOST(
          workerRequest(`${url}/${jobId}/slicing`, {
            method: "POST",
            body: {
              lock_owner: lockOwner,
              actual_slicer_package_version: "2.7.2+dfsg-1build2",
              actual_parser_version: "phase05-c-parser-v1",
              input_sha256: SHA_A,
              profile_sha256: SHA_B,
              slice_params_sha256: getJob(dbPath, jobId).sliceParamsSha256,
            },
          }),
          params(jobId),
        )
      ).status,
      200,
    );

    const parsed = await createParsedPayload();
    assert.equal(
      (
        await slicedPOST(
          workerRequest(`${url}/${jobId}/sliced`, {
            method: "POST",
            body: slicedPayload(jobId, parsed, lockOwner),
          }),
          params(jobId),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await parsingPOST(
          workerRequest(`${url}/${jobId}/parsing`, {
            method: "POST",
            body: {
              lock_owner: lockOwner,
              actual_parser_version: "phase05-c-parser-v1",
              gcode_sha256: parsed.result.gcode_sha256,
            },
          }),
          params(jobId),
        )
      ).status,
      200,
    );

    const result = await resultPOST(
      workerRequest(`${url}/${jobId}/result`, { method: "POST", body: resultPayload(parsed, lockOwner) }),
      params(jobId),
    );
    assert.equal(result.status, 200);
    assert.equal((await result.json()).status, "completed");

    const db = initDatabase(dbPath);
    const job = getSlicingJobById(db, jobId);
    assert.equal(job.status, "completed");
    assert.equal(job.filamentWeightMg, 6310);
    assert.equal(job.parserQuoteReady, true);
    db.close();
  });
});

test("result schema rejects unknown fields, inconsistent quote readiness, and parse cache mismatch", async () => {
  await withFixture(async ({ jobId, url }) => {
    const { lockOwner, parsed } = await reachParsing(url, jobId);

    const unknown = resultPayload(parsed, lockOwner);
    unknown.metric_validation.extra = true;
    assert.equal((await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: unknown }), params(jobId))).status, 422);

    const inconsistent = resultPayload(parsed, lockOwner);
    inconsistent.metric_validation.quote_ready = false;
    assert.equal(
      (await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: inconsistent }), params(jobId))).status,
      422,
    );

    const wrongCache = resultPayload(parsed, lockOwner);
    wrongCache.parse_cache_key_sha256 = "0".repeat(64);
    const response = await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: wrongCache }), params(jobId));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, "PARSE_CACHE_KEY_MISMATCH");
  });
});

test("sliced path safety, content encoding, and failed policy are enforced", async () => {
  await withFixture(async ({ jobId, url }) => {
    const lockBody = await (await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId))).json();
    await slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body: validSlicingBody(lockBody.lock_owner, jobId) }), params(jobId));
    const parsed = await createParsedPayload();

    assert.equal(
      (
        await slicedPOST(
          workerRequest(`${url}/${jobId}/sliced`, {
            method: "POST",
            body: { ...slicedPayload(jobId, parsed, lockBody.lock_owner), gcode_relative_path: `results/prusaslicer/${jobId + 1}/output.gcode` },
          }),
          params(jobId),
        )
      ).status,
      422,
    );

    assert.equal(
      (
        await slicedPOST(
          workerRequest(`${url}/${jobId}/sliced`, {
            method: "POST",
            headers: { "content-encoding": "gzip" },
            body: slicedPayload(jobId, parsed, lockBody.lock_owner),
          }),
          params(jobId),
        )
      ).status,
      415,
    );

    const failed = await failedPOST(
      workerRequest(`${url}/${jobId}/failed`, {
        method: "POST",
        body: {
          lock_owner: lockBody.lock_owner,
          stage: "slicing",
          error_code: "WORKER_LEASE_EXPIRED_SLICING",
          error_message: "server-only",
        },
      }),
      params(jobId),
    );
    assert.equal(failed.status, 422);
  });
});

test("reconcile exposes resume_from and restricted parsing resume", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    const { lockOwner, parsed } = await reachSliced(url, jobId);
    const db = initDatabase(dbPath);
    db.prepare("UPDATE slicing_jobs SET lease_expires_at_ms = 1 WHERE id = ?").run(jobId);
    db.prepare("UPDATE slicing_job_attempts SET lease_expires_at_ms = 1 WHERE lock_owner = ?").run(lockOwner);
    db.close();

    const pending = await pendingGET(workerRequest(`${url}/pending`));
    assert.equal(pending.status, 200);
    const jobs = (await pending.json()).jobs;
    assert.equal(jobs[0].resume_from, "sliced");

    const relock = await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId));
    const relockBody = await relock.json();
    assert.equal(relockBody.resume_from, "sliced");

    assert.equal(
      (
        await parsingPOST(
          workerRequest(`${url}/${jobId}/parsing`, {
            method: "POST",
            body: {
              lock_owner: relockBody.lock_owner,
              actual_parser_version: "phase05-c-parser-v1",
              gcode_sha256: parsed.result.gcode_sha256,
            },
          }),
          params(jobId),
        )
      ).status,
      200,
    );
  });
});

test("auth route tests cover missing config, empty config, missing auth, wrong token, and ignored worker identity inputs", async () => {
  await withFixture(async ({ dbPath, url }) => {
    const previousToken = process.env.MAKE3D_WORKER_TOKEN;
    delete process.env.MAKE3D_WORKER_TOKEN;
    let response = await pendingGET(workerRequest(`${url}/pending`));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "WORKER_AUTH_NOT_CONFIGURED");

    process.env.MAKE3D_WORKER_TOKEN = "";
    response = await pendingGET(workerRequest(`${url}/pending`));
    assert.equal(response.status, 503);

    process.env.MAKE3D_WORKER_TOKEN = previousToken;
    response = await pendingGET(new Request(`${url}/pending`));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "WORKER_AUTH_REQUIRED");

    response = await pendingGET(workerRequest(`${url}/pending`, { token: "bad-token" }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "WORKER_AUTH_INVALID");

    createExtraSlicingJob(dbPath, { workerId: "worker-b", sha: "c".repeat(64), fileName: "other.stl" });
    response = await pendingGET(
      workerRequest(`${url}/pending?worker_id=worker-b`, {
        headers: { "x-make3d-worker-id": "worker-b" },
      }),
    );
    assert.equal(response.status, 200);
    const jobs = (await response.json()).jobs;
    assert.equal(jobs.every((job) => job.input_worker_id === WORKER_ID), true);

    const lock = await lockPOST(workerRequest(`${url}/${jobs[0].job_id}/lock`, { method: "POST" }), params(jobs[0].job_id));
    const lockOwner = (await lock.json()).lock_owner;
    const bodyWorker = validSlicingBody(lockOwner, jobs[0].job_id);
    bodyWorker.worker_id = "worker-b";
    response = await slicingPOST(workerRequest(`${url}/${jobs[0].job_id}/slicing`, { method: "POST", body: bodyWorker }), params(jobs[0].job_id));
    assert.equal(response.status, 422);
  });
});

test("auth and lock secrets are not written to console logs", async () => {
  await withFixture(async ({ jobId, url }) => {
    const logs = [];
    const original = { log: console.log, warn: console.warn, error: console.error };
    console.log = (...args) => logs.push(args.join(" "));
    console.warn = (...args) => logs.push(args.join(" "));
    console.error = (...args) => logs.push(args.join(" "));
    try {
      const response = await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId));
      const body = await response.json();
      const logText = logs.join("\n");
      assert.doesNotMatch(logText, new RegExp(TOKEN));
      assert.doesNotMatch(logText, /phase05-g-token/);
      assert.doesNotMatch(logText, new RegExp(body.lock_owner));
    } finally {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    }
  });
});

test("all eight route handlers return no-store headers and lock response returns no-cache pragma", async () => {
  await withFixture(async ({ jobId, url }) => {
    const pending = await pendingGET(workerRequest(`${url}/pending`));
    assertNoStore(pending);

    const lock = await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId));
    assertNoStore(lock);
    assert.equal(lock.headers.get("pragma"), "no-cache");
    const lockOwner = (await lock.clone().json()).lock_owner;

    const lease = await leasePOST(workerRequest(`${url}/${jobId}/lease`, { method: "POST", body: { lock_owner: lockOwner } }), params(jobId));
    assertNoStore(lease);

    const slicing = await slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body: validSlicingBody(lockOwner, jobId) }), params(jobId));
    assertNoStore(slicing);

    const parsed = await createParsedPayload();
    const sliced = await slicedPOST(workerRequest(`${url}/${jobId}/sliced`, { method: "POST", body: slicedPayload(jobId, parsed, lockOwner) }), params(jobId));
    assertNoStore(sliced);

    const parsing = await parsingPOST(
      workerRequest(`${url}/${jobId}/parsing`, {
        method: "POST",
        body: { lock_owner: lockOwner, actual_parser_version: "phase05-c-parser-v1", gcode_sha256: parsed.result.gcode_sha256 },
      }),
      params(jobId),
    );
    assertNoStore(parsing);

    const result = await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: resultPayload(parsed, lockOwner) }), params(jobId));
    assertNoStore(result);

    const failedFixture = await withFreshFixture(async ({ jobId: failedJobId, url: failedUrl }) => {
      const failedLock = await lockPOST(workerRequest(`${failedUrl}/${failedJobId}/lock`, { method: "POST" }), params(failedJobId));
      const failedLockOwner = (await failedLock.json()).lock_owner;
      return failedPOST(workerRequest(`${failedUrl}/${failedJobId}/failed`, { method: "POST", body: failedBody(failedLockOwner, "locked", "WORKER_IO_ERROR") }), params(failedJobId));
    });
    assertNoStore(failedFixture);
  });
});

test("job id route validation rejects invalid URL ids", async () => {
  await withFixture(async ({ jobId, url }) => {
    assert.equal((await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId))).status, 200);
    for (const value of ["0", "-1", "1.5", "1e3", " 1", "1 ", "abc", String(Number.MAX_SAFE_INTEGER + 1)]) {
      const response = await lockPOST(workerRequest(`${url}/${value}/lock`, { method: "POST" }), params(value));
      assert.equal(response.status, 400, value);
      assert.equal((await response.json()).error.code, "INVALID_JOB_ID");
    }
  });
});

test("lock request rejects any non-empty body or client-supplied lock fields", async () => {
  await withFixture(async ({ jobId, url }) => {
    assert.equal((await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId))).status, 200);
  });
  for (const rawBody of ["{}", " ", "\n", JSON.stringify({ lock_owner: "x" }), JSON.stringify({ lease_expires_at_ms: 1 })]) {
    await withFixture(async ({ jobId, url }) => {
      const response = await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST", rawBody }), params(jobId));
      assert.equal(response.status, 400, rawBody);
      assert.equal((await response.json()).error.code, "UNEXPECTED_REQUEST_BODY");
    });
  }
});

test("body limits and content type rules are enforced at route level", async () => {
  await withFixture(async ({ jobId, url }) => {
    const lockOwner = (await (await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId))).json()).lock_owner;
    const validLeaseBody = JSON.stringify({ lock_owner: lockOwner });
    assert.equal((await leasePOST(rawRequest(`${url}/${jobId}/lease`, validLeaseBody, { "content-type": "application/json" }), params(jobId))).status, 200);
    assert.equal((await leasePOST(rawRequest(`${url}/${jobId}/lease`, validLeaseBody, { "content-type": "application/json; charset=utf-8" }), params(jobId))).status, 200);
    assert.equal((await leasePOST(rawRequest(`${url}/${jobId}/lease`, validLeaseBody, { "content-type": "text/plain" }), params(jobId))).status, 415);
    assert.equal((await leasePOST(rawRequest(`${url}/${jobId}/lease`, validLeaseBody, {}), params(jobId))).status, 415);
    assert.equal((await leasePOST(rawRequest(`${url}/${jobId}/lease`, validLeaseBody, { "content-type": "application/json", "content-encoding": "identity" }), params(jobId))).status, 200);

    for (const encoding of ["gzip", "br", "deflate", "compress"]) {
      const response = await leasePOST(rawRequest(`${url}/${jobId}/lease`, validLeaseBody, { "content-type": "application/json", "content-encoding": encoding }), params(jobId));
      assert.equal(response.status, 415, encoding);
    }

    const tooLarge = JSON.stringify({ lock_owner: lockOwner, padding: "x".repeat(40 * 1024) });
    assert.equal((await leasePOST(rawRequest(`${url}/${jobId}/lease`, tooLarge, { "content-type": "application/json", "content-length": String(40 * 1024) }), params(jobId))).status, 413);
    assert.equal((await leasePOST(rawRequest(`${url}/${jobId}/lease`, tooLarge, { "content-type": "application/json" }), params(jobId))).status, 413);
    assert.equal((await leasePOST(rawRequest(`${url}/${jobId}/lease`, tooLarge, { "content-type": "application/json", "content-length": "1" }), params(jobId))).status, 413);
  });
});

test("pending route filters ownership, retryability, max attempts, sensitive fields, and runs reconcile", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    createExtraSlicingJob(dbPath, { workerId: "worker-b", sha: "c".repeat(64), fileName: "b.stl" });
    const retryable = createExtraSlicingJob(dbPath, { workerId: WORKER_ID, sha: "d".repeat(64), fileName: "retry.stl" });
    const nonRetryable = createExtraSlicingJob(dbPath, { workerId: WORKER_ID, sha: "e".repeat(64), fileName: "no-retry.stl" });
    const exhausted = createExtraSlicingJob(dbPath, { workerId: WORKER_ID, sha: "f".repeat(64), fileName: "exhausted.stl" });
    const expired = await lockJob(url, jobId);

    const db = initDatabase(dbPath);
    db.prepare("UPDATE slicing_jobs SET status = 'failed', last_error_code = 'WORKER_IO_ERROR', attempt_count = 1, max_attempts = 3 WHERE id = ?").run(retryable.id);
    db.prepare("UPDATE slicing_jobs SET status = 'failed', last_error_code = 'INPUT_SHA_MISMATCH', attempt_count = 1, max_attempts = 3 WHERE id = ?").run(nonRetryable.id);
    db.prepare("UPDATE slicing_jobs SET status = 'failed', last_error_code = 'WORKER_IO_ERROR', attempt_count = 3, max_attempts = 3 WHERE id = ?").run(exhausted.id);
    db.prepare("UPDATE slicing_jobs SET lease_expires_at_ms = 1 WHERE id = ?").run(jobId);
    db.prepare("UPDATE slicing_job_attempts SET lease_expires_at_ms = 1 WHERE lock_owner = ?").run(expired.lock_owner);
    db.close();

    const response = await pendingGET(workerRequest(`${url}/pending`));
    assert.equal(response.status, 200);
    const jobs = (await response.json()).jobs;
    const ids = jobs.map((job) => job.job_id);
    assert.ok(ids.includes(retryable.id));
    assert.ok(ids.includes(jobId));
    assert.equal(ids.includes(nonRetryable.id), false);
    assert.equal(ids.includes(exhausted.id), false);
    assert.equal(jobs.every((job) => job.input_worker_id === WORKER_ID), true);
    assert.equal(JSON.stringify(jobs).includes(TOKEN), false);
    assert.equal(JSON.stringify(jobs).includes("C:\\"), false);
    assert.equal(JSON.stringify(jobs).includes("payment"), false);

    const after = getJob(dbPath, jobId);
    assert.equal(after.status, "failed");
    assert.equal(after.lastErrorCode, "WORKER_LEASE_EXPIRED_LOCKED");
  });
});

test("lock route creates one attempt, replays safely, hides other worker jobs, and preserves resume_from", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    const first = await lockJob(url, jobId);
    const second = await lockJob(url, jobId);
    assert.equal(second.created_attempt, false);
    assert.equal(second.lock_owner, first.lock_owner);
    let db = initDatabase(dbPath);
    assert.equal(db.prepare("SELECT attempt_count AS value FROM slicing_jobs WHERE id = ?").get(jobId).value, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS value FROM slicing_job_attempts WHERE slicing_job_id = ?").get(jobId).value, 1);
    db.close();

    const other = createExtraSlicingJob(dbPath, { workerId: "worker-b", sha: "c".repeat(64), fileName: "other.stl" });
    assert.equal((await lockPOST(workerRequest(`${url}/${other.id}/lock`, { method: "POST" }), params(other.id))).status, 404);

    const resume = createExtraSlicingJob(dbPath, { workerId: WORKER_ID, sha: "d".repeat(64), fileName: "resume.stl" });
    db = initDatabase(dbPath);
    db.close();
    seedResumeArtifact(dbPath, resume.id, { errorCode: "WORKER_LEASE_EXPIRED_SLICED", sha: "c".repeat(64), size: 10 });
    const resumeLock = await lockJob(url, resume.id);
    const resumeReplay = await lockJob(url, resume.id);
    assert.equal(resumeLock.resume_from, "sliced");
    assert.equal(resumeReplay.resume_from, "sliced");
    assert.equal(resumeReplay.created_attempt, false);
  });
});

test("lease route renews without shortening, rejects expiry, wrong lock, and non-UUID locks", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    const lock = await lockJob(url, jobId);
    const longFutureLease = Date.now() + 60 * 60 * 1000;
    let db = initDatabase(dbPath);
    db.prepare("UPDATE slicing_jobs SET lease_expires_at_ms = ? WHERE id = ?").run(longFutureLease, jobId);
    db.prepare("UPDATE slicing_job_attempts SET lease_expires_at_ms = ? WHERE lock_owner = ?").run(longFutureLease, lock.lock_owner);
    db.close();

    const renewed = await leasePOST(workerRequest(`${url}/${jobId}/lease`, { method: "POST", body: { lock_owner: lock.lock_owner } }), params(jobId));
    assert.equal(renewed.status, 200);
    assert.equal((await renewed.json()).lease_expires_at_ms, longFutureLease);

    assert.equal((await leasePOST(workerRequest(`${url}/${jobId}/lease`, { method: "POST", body: { lock_owner: randomUUID() } }), params(jobId))).status, 409);
    assert.equal((await leasePOST(workerRequest(`${url}/${jobId}/lease`, { method: "POST", body: { lock_owner: "bad" } }), params(jobId))).status, 422);

    db = initDatabase(dbPath);
    db.prepare("UPDATE slicing_jobs SET lease_expires_at_ms = 1 WHERE id = ?").run(jobId);
    db.prepare("UPDATE slicing_job_attempts SET lease_expires_at_ms = 1 WHERE lock_owner = ?").run(lock.lock_owner);
    db.close();
    const expired = await leasePOST(workerRequest(`${url}/${jobId}/lease`, { method: "POST", body: { lock_owner: lock.lock_owner } }), params(jobId));
    assert.equal(expired.status, 409);
    assert.equal((await expired.json()).error.code, "LEASE_EXPIRED");
  });
});

test("slicing route succeeds and each version or SHA mismatch fails atomically without retry", async () => {
  const cases = [
    ["actual_slicer_package_version", "2.8.0", "SLICER_VERSION_MISMATCH"],
    ["actual_parser_version", "phase05-c-parser-v2", "PARSER_VERSION_MISMATCH"],
    ["input_sha256", "0".repeat(64), "INPUT_SHA_MISMATCH"],
    ["profile_sha256", "1".repeat(64), "PROFILE_SHA_MISMATCH"],
    ["slice_params_sha256", "2".repeat(64), "SLICE_PARAMS_MISMATCH"],
  ];

  await withFixture(async ({ jobId, url }) => {
    const lock = await lockJob(url, jobId);
    const ok = await slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body: validSlicingBody(lock.lock_owner, jobId) }), params(jobId));
    assert.equal(ok.status, 200);
  });

  for (const [field, value, code] of cases) {
    await withFixture(async ({ dbPath, jobId, url }) => {
      const lock = await lockJob(url, jobId);
      const body = validSlicingBody(lock.lock_owner, jobId);
      body[field] = value;
      const response = await slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body }), params(jobId));
      assert.equal(response.status, 422, field);
      assert.equal((await response.json()).error.code, code);
      const db = initDatabase(dbPath);
      const job = getSlicingJobById(db, jobId);
      const attempt = db.prepare("SELECT status, error_code AS errorCode FROM slicing_job_attempts WHERE slicing_job_id = ?").get(jobId);
      assert.equal(job.status, "failed");
      assert.equal(job.lockOwner, null);
      assert.equal(job.leaseExpiresAtMs, null);
      assert.equal(job.lastErrorCode, code);
      assert.equal(attempt.status, "failed");
      assert.equal(attempt.errorCode, code);
      db.close();
    });
  }
});

test("sliced route accepts only successful exact job-owned artifacts", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    const lock = await lockJob(url, jobId);
    await slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body: validSlicingBody(lock.lock_owner, jobId) }), params(jobId));
    const parsed = await createParsedPayload();
    const ok = await slicedPOST(workerRequest(`${url}/${jobId}/sliced`, { method: "POST", body: slicedPayload(jobId, parsed, lock.lock_owner) }), params(jobId));
    assert.equal(ok.status, 200);
    assert.equal(getJob(dbPath, jobId).artifactWorkerId, WORKER_ID);
  });

  const mutations = [
    ["exit_code", 1],
    ["gcode_size_bytes", 0],
    ["gcode_sha256", "A".repeat(64)],
    ["gcode_relative_path", (jobId) => `results/prusaslicer/${jobId + 1}/attempt-1/output.gcode`],
    ["gcode_relative_path", () => "processing/prusaslicer/1/attempt-1/output.gcode"],
    ["gcode_relative_path", () => "failed/prusaslicer/1/attempt-1/output.gcode"],
    ["gcode_relative_path", () => "/srv/make3d/output.gcode"],
    ["gcode_relative_path", () => "results\\prusaslicer\\1\\attempt-1\\output.gcode"],
    ["gcode_relative_path", () => "results/prusaslicer/1/../attempt-1/output.gcode"],
  ];

  for (const [field, value] of mutations) {
    await withFixture(async ({ jobId, url }) => {
      const lock = await lockJob(url, jobId);
      await slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body: validSlicingBody(lock.lock_owner, jobId) }), params(jobId));
      const parsed = await createParsedPayload();
      const body = slicedPayload(jobId, parsed, lock.lock_owner);
      body[field] = typeof value === "function" ? value(jobId) : value;
      const response = await slicedPOST(workerRequest(`${url}/${jobId}/sliced`, { method: "POST", body }), params(jobId));
      assert.equal(response.status, 422, `${field}=${body[field]}`);
    });
  }
});

test("parsing route enforces normal and resume transition rules", async () => {
  await withFixture(async ({ jobId, url }) => {
    const lock = await lockJob(url, jobId);
    const parsed = await createParsedPayload();
    assert.equal(
      (await parsingPOST(workerRequest(`${url}/${jobId}/parsing`, { method: "POST", body: { lock_owner: lock.lock_owner, actual_parser_version: "phase05-c-parser-v1", gcode_sha256: parsed.result.gcode_sha256 } }), params(jobId))).status,
      409,
    );
  });

  await withFixture(async ({ jobId, url }) => {
    const { lockOwner, parsed } = await reachSliced(url, jobId);
    assert.equal(
      (await parsingPOST(workerRequest(`${url}/${jobId}/parsing`, { method: "POST", body: { lock_owner: lockOwner, actual_parser_version: "phase05-c-parser-v1", gcode_sha256: parsed.result.gcode_sha256 } }), params(jobId))).status,
      200,
    );
  });

  for (const resumeCode of ["WORKER_LEASE_EXPIRED_SLICED", "WORKER_LEASE_EXPIRED_PARSING"]) {
    await withFixture(async ({ dbPath, jobId, url }) => {
      const parsed = await createParsedPayload();
      seedResumeArtifact(dbPath, jobId, { errorCode: resumeCode, sha: parsed.result.gcode_sha256, size: parsed.result.gcode_size_bytes });
      const lock = await lockJob(url, jobId);
      assert.equal(lock.resume_from, resumeCode.endsWith("PARSING") ? "parsing" : "sliced");
      assert.equal(
        (await parsingPOST(workerRequest(`${url}/${jobId}/parsing`, { method: "POST", body: { lock_owner: lock.lock_owner, actual_parser_version: "phase05-c-parser-v1", gcode_sha256: "0".repeat(64) } }), params(jobId))).status,
        409,
      );
      const ok = await parsingPOST(workerRequest(`${url}/${jobId}/parsing`, { method: "POST", body: { lock_owner: lock.lock_owner, actual_parser_version: "phase05-c-parser-v1", gcode_sha256: parsed.result.gcode_sha256 } }), params(jobId));
      assert.equal(ok.status, 200);
      assert.equal(getJob(dbPath, jobId).lastErrorCode, null);
    });
  }

  await withFixture(async ({ dbPath, jobId, url }) => {
    const parsed = await createParsedPayload();
    seedResumeArtifact(dbPath, jobId, {
      workerId: "worker-b",
      errorCode: "WORKER_LEASE_EXPIRED_SLICED",
      sha: parsed.result.gcode_sha256,
      size: parsed.result.gcode_size_bytes,
    });
    const lock = await lockJob(url, jobId);
    assert.equal(lock.resume_from, null);
    const response = await parsingPOST(workerRequest(`${url}/${jobId}/parsing`, { method: "POST", body: { lock_owner: lock.lock_owner, actual_parser_version: "phase05-c-parser-v1", gcode_sha256: parsed.result.gcode_sha256 } }), params(jobId));
    assert.equal(response.status, 409);
  });
});

test("result route covers completed, partial, forbidden statuses, unknown fields, null preservation, and cache validation", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    const { lockOwner, parsed } = await reachParsing(url, jobId, { weight: "1.23" });
    const payload = resultPayload(parsed, lockOwner);
    const response = await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: payload }), params(jobId));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "completed");
    assert.equal(getJob(dbPath, jobId).status, "completed");
  });

  await withFixture(async ({ jobId, url }) => {
    const { lockOwner, parsed } = await reachParsing(url, jobId, { weight: "1.23" });
    const payload = resultPayload(parsed, lockOwner);
    payload.parse_status = "partial";
    const response = await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: payload }), params(jobId));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "partial");
  });

  for (const mutation of [
    (payload) => { payload.parse_status = "failed"; },
    (payload) => { payload.metrics_status = "invalid"; },
    (payload) => { payload.metric_sources.extra = "missing"; },
    (payload) => { payload.metric_validation.extra = true; },
    (payload) => { payload.parse_cache_key_sha256 = "0".repeat(64); },
  ]) {
    await withFixture(async ({ jobId, url }) => {
      const { lockOwner, parsed } = await reachParsing(url, jobId);
      const payload = resultPayload(parsed, lockOwner);
      mutation(payload);
      const response = await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: payload }), params(jobId));
      assert.equal(response.status, 422);
    });
  }

  await withFixture(async ({ dbPath, jobId, url }) => {
    const { lockOwner, parsed } = await reachParsing(url, jobId, { omitWeight: true, omitDensity: true });
    const response = await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: resultPayload(parsed, lockOwner) }), params(jobId));
    assert.equal(response.status, 200);
    const job = getJob(dbPath, jobId);
    assert.equal(job.filamentWeightMg, null);
  });
});

test("failed route enforces Worker error code policy, sanitization, truncation, and retryable field rejection", async () => {
  for (const code of ["SLICER_OUTPUT_MISSING", "SLICER_OUTPUT_EMPTY", "SLICER_GCODE_SHA_MISMATCH"]) {
    await withFixture(async ({ jobId, url }) => {
      const lock = await lockJob(url, jobId);
      await slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body: validSlicingBody(lock.lock_owner, jobId) }), params(jobId));
      const response = await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: failedBody(lock.lock_owner, "slicing", code) }), params(jobId));
      assert.equal(response.status, 200, code);
    });
  }

  for (const stage of ["locked", "slicing", "sliced", "parsing"]) {
    await withFixture(async ({ jobId, url }) => {
      const { lockOwner } = await reachStage(url, jobId, stage);
      const response = await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: failedBody(lockOwner, stage, "WORKER_IO_ERROR", "token=secret 13900000000 test@example.com " + "x".repeat(700)) }), params(jobId));
      assert.equal(response.status, 200, stage);
    });
  }

  await withFixture(async ({ dbPath, jobId, url }) => {
    const lock = await lockJob(url, jobId);
    const withRetryable = failedBody(lock.lock_owner, "locked", "WORKER_IO_ERROR");
    withRetryable.retryable = true;
    assert.equal((await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: withRetryable }), params(jobId))).status, 422);
    assert.equal((await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: failedBody(lock.lock_owner, "locked", "WORKER_LEASE_EXPIRED_LOCKED") }), params(jobId))).status, 422);
    assert.equal((await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: failedBody(lock.lock_owner, "locked", "NO_SUCH_CODE") }), params(jobId))).status, 422);
    assert.equal((await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: failedBody(lock.lock_owner, "locked", "SLICER_TIMEOUT") }), params(jobId))).status, 422);

    const ok = await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: failedBody(lock.lock_owner, "locked", "WORKER_IO_ERROR", "token=secret 13900000000 test@example.com " + "x".repeat(700)) }), params(jobId));
    assert.equal(ok.status, 200);
    const job = getJob(dbPath, jobId);
    assert.doesNotMatch(job.lastError, /secret|13900000000|test@example.com/);
    assert.ok(job.lastError.length <= 500);
  });
});

test("reconcile expires each active state idempotently and preserves sliced artifacts", async () => {
  for (const stage of ["locked", "slicing", "sliced", "parsing"]) {
    await withFixture(async ({ dbPath, jobId, url }) => {
      const { lockOwner, parsed } = await reachStage(url, jobId, stage);
      const before = getJob(dbPath, jobId);
      const db = initDatabase(dbPath);
      db.prepare("UPDATE slicing_jobs SET lease_expires_at_ms = 1 WHERE id = ?").run(jobId);
      db.prepare("UPDATE slicing_job_attempts SET lease_expires_at_ms = 1 WHERE lock_owner = ?").run(lockOwner);
      db.close();
      await pendingGET(workerRequest(`${url}/pending`));
      await pendingGET(workerRequest(`${url}/pending`));

      const verify = initDatabase(dbPath);
      const job = getSlicingJobById(verify, jobId);
      const attempt = verify.prepare("SELECT status FROM slicing_job_attempts WHERE lock_owner = ?").get(lockOwner);
      assert.equal(job.status, "failed", stage);
      assert.equal(attempt.status, "expired", stage);
      assert.equal(job.lockOwner, null);
      assert.equal(job.leaseExpiresAtMs, null);
      assert.equal(job.attemptCount, before.attemptCount);
      if (stage === "sliced" || stage === "parsing") {
        assert.equal(job.gcodeSha256, parsed.result.gcode_sha256);
        assert.equal(job.artifactWorkerId, WORKER_ID);
      }
      verify.close();
    });
  }
});

test("terminal result and failed replay are idempotent and conflicting payloads return 409", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    const { lockOwner, parsed } = await reachParsing(url, jobId);
    const payload = resultPayload(parsed, lockOwner);
    assert.equal((await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: payload }), params(jobId))).status, 200);
    assert.equal((await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: payload }), params(jobId))).status, 200);
    const changed = resultPayload(parsed, lockOwner);
    changed.warnings = ["different"];
    assert.equal((await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: changed }), params(jobId))).status, 409);
    const db = initDatabase(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) AS value FROM slicing_job_attempts WHERE slicing_job_id = ?").get(jobId).value, 1);
    db.close();
  });

  await withFixture(async ({ dbPath, jobId, url }) => {
    const lock = await lockJob(url, jobId);
    const payload = failedBody(lock.lock_owner, "locked", "WORKER_IO_ERROR", "temporary");
    assert.equal((await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: payload }), params(jobId))).status, 200);
    assert.equal((await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: payload }), params(jobId))).status, 200);
    assert.equal((await failedPOST(workerRequest(`${url}/${jobId}/failed`, { method: "POST", body: failedBody(lock.lock_owner, "locked", "WORKER_IO_ERROR", "different") }), params(jobId))).status, 409);
    const db = initDatabase(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) AS value FROM slicing_job_attempts WHERE slicing_job_id = ?").get(jobId).value, 1);
    db.close();
  });
});

test("slicing API does not modify order, quote, payment, refund, or WeChat payment data", async () => {
  await withFixture(async ({ dbPath, jobId, url }) => {
    const before = snapshotNonInterference(dbPath);
    const { lockOwner, parsed } = await reachParsing(url, jobId);
    await resultPOST(workerRequest(`${url}/${jobId}/result`, { method: "POST", body: resultPayload(parsed, lockOwner) }), params(jobId));
    assert.deepEqual(snapshotNonInterference(dbPath), before);
  });
});

async function withFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "make3d-worker-slicing-api-"));
  const dbPath = join(root, "make3d.db");
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    MAKE3D_WORKER_TOKEN: process.env.MAKE3D_WORKER_TOKEN,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.MAKE3D_WORKER_TOKEN = TOKEN;
  process.env.SESSION_SECRET = "phase05-g-session";

  try {
    const db = initDatabase(dbPath);
    const order = createOrderWithFile(db, {
      customerId: null,
      customerName: "Slicing API Test",
      phone: "13900000000",
      wechat: "slicing-api",
      material: "PLA",
      color: "black",
      quantity: 1,
      estimatedPrice: 88,
      file: { filename: "model.stl", filepath: "uploads/model.stl", filesize: 123 },
    });
    const file = db.prepare("SELECT id FROM files WHERE order_id = ?").get(order.id);
    const sourceRelativePath = "uploads/model.stl";
    const sync = db.prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = ?").get(file.id);
    db.prepare(
      `UPDATE local_file_sync_jobs
       SET sync_status = 'verified',
           worker_id = ?,
           relative_path = ?,
           local_path = ?,
           local_sha256 = ?,
           local_synced_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(WORKER_ID, sourceRelativePath, "/srv/make3d-worker/files/model.stl", SHA_A, sync.id);
    const created = createSlicingJobForVerifiedFile(db, {
      fileSyncJobId: sync.id,
      fileId: file.id,
      profileKey: "bambu-p1s",
      profileVersion: "phase05-b",
      profileSha256: SHA_B,
      sliceParams: sliceParams(),
      requiredSlicerPackageVersion: "2.7.2+dfsg-1build2",
      requiredParserVersion: "phase05-c-parser-v1",
    }).job;
    db.close();

    await run({ dbPath, jobId: created.id, root, url: "https://make3d.test/api/worker/slicing/jobs" });
  } finally {
    restoreEnv(previous);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function withFreshFixture(run) {
  let output;
  await withFixture(async (fixture) => {
    output = await run(fixture);
  });
  return output;
}

function assertNoStore(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
}

function rawRequest(url, rawBody, headers = {}) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("authorization", `Bearer ${TOKEN}`);
  return new Request(url, { method: "POST", headers: requestHeaders, body: rawBody });
}

function createExtraSlicingJob(dbPath, options = {}) {
  const db = initDatabase(dbPath);
  try {
    const fileName = options.fileName || `extra-${Date.now()}.stl`;
    const sha = options.sha || "c".repeat(64);
    const order = createOrderWithFile(db, {
      customerId: null,
      customerName: "Slicing Extra",
      phone: "13900000000",
      wechat: "slicing-extra",
      material: "PLA",
      color: "black",
      quantity: 1,
      estimatedPrice: 88,
      file: { filename: fileName, filepath: `uploads/${fileName}`, filesize: 123 },
    });
    const file = db.prepare("SELECT id FROM files WHERE order_id = ?").get(order.id);
    const sourceRelativePath = `uploads/${fileName}`;
    const sync = db.prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = ?").get(file.id);
    db.prepare(
      `UPDATE local_file_sync_jobs
       SET sync_status = 'verified',
           worker_id = ?,
           relative_path = ?,
           local_path = ?,
           local_sha256 = ?,
           local_synced_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(options.workerId || WORKER_ID, sourceRelativePath, `/srv/make3d-worker/files/${fileName}`, sha, sync.id);
    return createSlicingJobForVerifiedFile(db, {
      fileSyncJobId: sync.id,
      fileId: file.id,
      profileKey: "bambu-p1s",
      profileVersion: `phase05-b-${file.id}`,
      profileSha256: SHA_B,
      sliceParams: { ...sliceParams(), material: options.material || "PLA" },
      requiredSlicerPackageVersion: "2.7.2+dfsg-1build2",
      requiredParserVersion: "phase05-c-parser-v1",
    }).job;
  } finally {
    db.close();
  }
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
           last_error = ?,
           artifact_worker_id = ?,
           gcode_relative_path = ?,
           stdout_relative_path = ?,
           stderr_relative_path = ?,
           gcode_size_bytes = ?,
           gcode_sha256 = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      attemptNo,
      options.errorCode || "WORKER_LEASE_EXPIRED_SLICED",
      "resume fixture",
      workerId,
      gcodePath,
      stdoutPath,
      stderrPath,
      size,
      sha,
      jobId,
    );
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

async function lockJob(url, jobId) {
  const response = await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId));
  assert.equal(response.status, 200);
  return response.json();
}

function failedBody(lockOwner, stage, errorCode, errorMessage = "worker failed") {
  return {
    lock_owner: lockOwner,
    stage,
    error_code: errorCode,
    error_message: errorMessage,
  };
}

function workerRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("authorization", `Bearer ${options.token || TOKEN}`);
  let body;
  if ("rawBody" in options) {
    body = options.rawBody;
  } else if (options.body) {
    headers.set("content-type", "application/json; charset=utf-8");
    body = JSON.stringify(options.body);
  }
  return new Request(url, { method: options.method || "GET", headers, body });
}

function params(jobId) {
  return { params: Promise.resolve({ id: String(jobId) }) };
}

function getJob(dbPath, jobId) {
  const db = initDatabase(dbPath);
  const job = getSlicingJobById(db, jobId);
  db.close();
  return job;
}

async function reachSliced(url, jobId, parserOptions = {}) {
  const lockBody = await (await lockPOST(workerRequest(`${url}/${jobId}/lock`, { method: "POST" }), params(jobId))).json();
  await slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body: validSlicingBody(lockBody.lock_owner, jobId) }), params(jobId));
  const parsed = await createParsedPayload(parserOptions);
  await slicedPOST(workerRequest(`${url}/${jobId}/sliced`, { method: "POST", body: slicedPayload(jobId, parsed, lockBody.lock_owner) }), params(jobId));
  return { lockOwner: lockBody.lock_owner, parsed };
}

async function reachParsing(url, jobId, parserOptions = {}) {
  const { lockOwner, parsed } = await reachSliced(url, jobId, parserOptions);
  await parsingPOST(
    workerRequest(`${url}/${jobId}/parsing`, {
      method: "POST",
      body: { lock_owner: lockOwner, actual_parser_version: "phase05-c-parser-v1", gcode_sha256: parsed.result.gcode_sha256 },
    }),
    params(jobId),
  );
  return { lockOwner, parsed };
}

async function reachStage(url, jobId, stage) {
  const lock = await lockJob(url, jobId);
  if (stage === "locked") return { lockOwner: lock.lock_owner, parsed: await createParsedPayload() };

  await slicingPOST(workerRequest(`${url}/${jobId}/slicing`, { method: "POST", body: validSlicingBody(lock.lock_owner, jobId) }), params(jobId));
  if (stage === "slicing") return { lockOwner: lock.lock_owner, parsed: await createParsedPayload() };

  const parsed = await createParsedPayload();
  await slicedPOST(workerRequest(`${url}/${jobId}/sliced`, { method: "POST", body: slicedPayload(jobId, parsed, lock.lock_owner) }), params(jobId));
  if (stage === "sliced") return { lockOwner: lock.lock_owner, parsed };

  await parsingPOST(
    workerRequest(`${url}/${jobId}/parsing`, {
      method: "POST",
      body: { lock_owner: lock.lock_owner, actual_parser_version: "phase05-c-parser-v1", gcode_sha256: parsed.result.gcode_sha256 },
    }),
    params(jobId),
  );
  return { lockOwner: lock.lock_owner, parsed };
}

function validSlicingBody(lockOwner, jobId) {
  return {
    lock_owner: lockOwner,
    actual_slicer_package_version: "2.7.2+dfsg-1build2",
    actual_parser_version: "phase05-c-parser-v1",
    input_sha256: SHA_A,
    profile_sha256: SHA_B,
    slice_params_sha256: getJob(process.env.DATABASE_URL.replace(/^file:/, ""), jobId).sliceParamsSha256,
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
    metrics: pickResultMetrics(parsed.result),
    metric_sources: pickMetricSources(parsed.metric_sources),
    metric_validation: {
      metrics_status: parsed.validation.metrics_status,
      quote_ready: parsed.validation.quote_ready,
      invalid_fields: [...parsed.validation.invalid_fields],
      warnings: [...parsed.validation.warnings],
    },
    missing_fields: [...parsed.parse.missing_fields],
    warnings: [...parsed.parse.warnings],
  };
}

async function createParsedPayload(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "make3d-parser-fixture-"));
  await mkdir(root, { recursive: true });
  const filePath = join(root, "fixture.gcode");
  await writeFile(filePath, completeGcode(options));
  return parsePrusaSlicerGcode(filePath, { allowedRoots: [root], sliceParams: sliceParams() });
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

function completeGcode(options = {}) {
  const lines = ["; generated by PrusaSlicer 2.7.2 on 2026-07-14"];
  for (let index = 1; index <= 10; index += 1) {
    lines.push(";LAYER_CHANGE", `;Z:${(index * 0.2).toFixed(2)}`, `G1 Z${(index * 0.2).toFixed(2)}`);
  }
  lines.push(
    "; filament used [mm] = 2116.64",
    "; filament used [cm3] = 5.09",
    options.omitWeight ? null : `; filament used [g] = ${options.weight ?? "6.31"}`,
    "; estimated printing time (normal mode) = 24m 56s",
    "; estimated printing time (silent mode) = 25m 44s",
    "; filament_type = PLA",
    "; printer_model = Bambu Lab P1S",
    "; nozzle_diameter = 0.4",
    "; layer_height = 0.2",
    options.omitDensity ? null : "; filament_density = 1.24",
    options.omitDensity ? null : "; filament_diameter = 1.75",
    "; prusaslicer_config = end",
  );
  return `${lines.filter(Boolean).join("\n")}\n`;
}

const RESULT_METRIC_KEYS = [
  "print_time_seconds",
  "silent_print_time_seconds",
  "filament_length_microns",
  "filament_volume_mm3",
  "filament_weight_mg",
  "layer_count",
  "max_layer_z_microns",
  "filament_type",
  "printer_model",
  "nozzle_diameter_microns",
  "layer_height_microns",
  "gcode_size_bytes",
  "gcode_sha256",
];

const RESULT_SOURCE_KEYS = [
  "print_time_source",
  "filament_length_source",
  "filament_volume_source",
  "filament_weight_source",
  "layer_count_source",
  "max_layer_z_source",
  "filament_type_source",
  "printer_model_source",
  "nozzle_diameter_source",
  "layer_height_source",
];

function pickResultMetrics(result) {
  return Object.fromEntries(RESULT_METRIC_KEYS.map((key) => [key, result[key] ?? null]));
}

function pickMetricSources(sources) {
  return Object.fromEntries(RESULT_SOURCE_KEYS.map((key) => [key, sources[key] || "missing"]));
}

function snapshotNonInterference(dbPath) {
  const db = initDatabase(dbPath);
  try {
    const tableCount = (tableName) => {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName)) return 0;
      return db.prepare(`SELECT COUNT(*) AS value FROM ${tableName}`).get().value;
    };
    const ordersColumns = db.prepare("PRAGMA table_info(orders)").all().map((column) => column.name);
    const orderSelect = ["id", "status"]
      .concat(ordersColumns.includes("payment_status") ? ["payment_status AS paymentStatus"] : [])
      .concat(ordersColumns.includes("estimated_price") ? ["estimated_price AS estimatedPrice"] : [])
      .concat(ordersColumns.includes("final_quote") ? ["final_quote AS finalQuote"] : []);
    return {
      orders: db.prepare(`SELECT ${orderSelect.join(", ")} FROM orders ORDER BY id`).all(),
      quoteDrafts: tableCount("quote_drafts"),
      quoteDraftFiles: tableCount("quote_draft_files"),
      orderPayments: tableCount("order_payments"),
      wechatPayments: tableCount("wechat_payments"),
      wechatRefunds: tableCount("wechat_refunds"),
    };
  } finally {
    db.close();
  }
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}
