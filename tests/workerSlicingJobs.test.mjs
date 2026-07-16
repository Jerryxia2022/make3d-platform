import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createOrderWithFile, initDatabase } from "../src/backend/database.ts";
import {
  claimSlicingJob,
  completeSlicingJobResult,
  computeParseCacheKey,
  computeSliceCacheKey,
  createMetricsCacheReuseJob,
  createSlicingJobForVerifiedFile,
  failSlicingJob,
  getSlicingJobAttemptByLockOwner,
  getSlicingJobById,
  listPendingSlicingJobsForWorker,
  markSlicingJobParsing,
  markSlicingJobSliced,
  markSlicingJobSlicing,
  renewSlicingJobLease,
  toPendingSlicingJobPayload,
  validateSlicingJobRequiredVersions,
  WORKER_SLICING_LEASE_DURATION_MS,
} from "../src/backend/workerSlicingJobs.ts";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);

test("creates slicing tables while keeping legacy slice_jobs unchanged and empty", async () => {
  await withDb(async ({ db }) => {
    assert.ok(tableExists(db, "slicing_jobs"));
    assert.ok(tableExists(db, "slicing_job_attempts"));
    assert.ok(tableExists(db, "slice_jobs"));

    const legacyColumns = columnNames(db, "slice_jobs");
    assert.ok(legacyColumns.includes("estimated_price"));
    assert.ok(legacyColumns.includes("material_fee"));
    assert.equal(countRows(db, "slicing_jobs"), 0);
    assert.equal(countRows(db, "slicing_job_attempts"), 0);
  });
});

test("verified file can create a slicing job and input_worker_id comes from sync job", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const job = createSlicingJob(db, jobInput(fixture));

    assert.equal(job.fileId, fixture.fileId);
    assert.equal(job.fileSyncJobId, fixture.syncJobId);
    assert.equal(job.inputWorkerId, "worker-a");
    assert.equal(job.status, "pending");
    assert.equal(job.inputSha256, SHA_A);
  });
});

test("pending payload exposes slice_params as an object for Worker APIs", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const job = createSlicingJob(db, jobInput(fixture));
    const payload = toPendingSlicingJobPayload(job);

    assert.equal(payload.job_id, job.id);
    assert.equal(payload.input_worker_id, "worker-a");
    assert.equal(typeof payload.slice_params, "object");
    assert.equal(payload.slice_params.layer_height_microns, 200);
    assert.equal(payload.required_slicer_package_version, "2.7.2+dfsg-1build2");
  });
});

test("required slicer and parser version checks are read-only and explicit", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const job = createSlicingJob(db, jobInput(fixture));

    assert.deepEqual(
      validateSlicingJobRequiredVersions(db, job.id, {
        actualSlicerPackageVersion: "2.7.2+dfsg-1build2",
        actualParserVersion: "phase05-c-parser-v1",
      }),
      { ok: true, errorCode: null },
    );
    assert.deepEqual(
      validateSlicingJobRequiredVersions(db, job.id, {
        actualSlicerPackageVersion: "2.8.0",
        actualParserVersion: "phase05-c-parser-v1",
      }),
      { ok: false, errorCode: "SLICER_VERSION_MISMATCH" },
    );
    assert.deepEqual(
      validateSlicingJobRequiredVersions(db, job.id, {
        actualSlicerPackageVersion: "2.7.2+dfsg-1build2",
        actualParserVersion: "phase05-c-parser-v2",
      }),
      { ok: false, errorCode: "PARSER_VERSION_MISMATCH" },
    );
    assert.equal(getSlicingJobById(db, job.id).status, "pending");
  });
});

test("unverified file cannot create a slicing job", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a", syncStatus: "pending" });
    assert.throws(() => createSlicingJob(db, jobInput(fixture)), /not verified/);
  });
});

test("file_id mismatch is rejected when creating a slicing job", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    assert.throws(
      () => createSlicingJob(db, { ...jobInput(fixture), fileId: fixture.fileId + 1 }),
      /file_id does not match/,
    );
  });
});

test("same file_sync_job_id can create separate PLA and PETG slicing tasks", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const pla = createSlicingJob(db, jobInput(fixture));
    const petg = createSlicingJob(db, {
      ...jobInput(fixture),
      sliceParams: {
        ...jobInput(fixture).sliceParams,
        material: "PETG",
      },
    });

    assert.notEqual(pla.id, petg.id);
    assert.equal(pla.fileSyncJobId, fixture.syncJobId);
    assert.equal(petg.fileSyncJobId, fixture.syncJobId);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("same file_sync_job_id can create a new task when fill density changes", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const first = createSlicingJob(db, jobInput(fixture));
    const changed = createSlicingJob(db, {
      ...jobInput(fixture),
      sliceParams: {
        ...jobInput(fixture).sliceParams,
        fill_density_percent: 20,
      },
    });

    assert.notEqual(first.id, changed.id);
    assert.notEqual(first.sliceParamsSha256, changed.sliceParamsSha256);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("same file_sync_job_id can create a new task when layer height changes", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const first = createSlicingJob(db, jobInput(fixture));
    const changed = createSlicingJob(db, {
      ...jobInput(fixture),
      sliceParams: {
        ...jobInput(fixture).sliceParams,
        layer_height_microns: 120,
      },
    });

    assert.notEqual(first.id, changed.id);
    assert.notEqual(first.sliceParamsSha256, changed.sliceParamsSha256);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("same file_sync_job_id can create a new task when profile_sha256 changes", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const first = createSlicingJob(db, jobInput(fixture));
    const changed = createSlicingJob(db, {
      ...jobInput(fixture),
      profileVersion: "phase05-b-alt",
      profileSha256: SHA_C,
    });

    assert.notEqual(first.id, changed.id);
    assert.notEqual(first.sliceCacheKeySha256, changed.sliceCacheKeySha256);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("same file_sync_job_id can create a new task when required slicer package version changes", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const first = createSlicingJob(db, jobInput(fixture));
    const changed = createSlicingJob(db, {
      ...jobInput(fixture),
      requiredSlicerPackageVersion: "2.8.0",
    });

    assert.notEqual(first.id, changed.id);
    assert.notEqual(first.sliceCacheKeySha256, changed.sliceCacheKeySha256);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("identical active slicing task is idempotent and does not create a duplicate active row", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const first = createSlicingJobForVerifiedFile(db, jobInput(fixture));
    const second = createSlicingJobForVerifiedFile(db, jobInput(fixture));

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.job.id, second.job.id);
    assert.equal(countRows(db, "slicing_jobs"), 1);
  });
});

test("simulated concurrent active identity insert returns existing task instead of throwing", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const racingDb = createInsertRaceDb(db);
    const result = createSlicingJobForVerifiedFile(racingDb, jobInput(fixture));

    assert.equal(result.created, false);
    assert.equal(result.job.status, "pending");
    assert.equal(countRows(db, "slicing_jobs"), 1);
  });
});

test("terminal completed task allows a new identical slicing task", async () => {
  await withDb(async ({ db }) => {
    const { job, fixture } = createCompletedSourceJob(db);
    const result = createSlicingJobForVerifiedFile(db, jobInput(fixture));

    assert.equal(job.status, "completed");
    assert.equal(result.created, true);
    assert.notEqual(result.job.id, job.id);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("terminal partial task allows a new identical slicing task", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job, fixture } = createParsingJob(db);
    const partial = completeSlicingJobResult(db, {
      ...activeInput(job.id, claimed.lockOwner),
      actualParserVersion: "phase05-c-parser-v1",
      parseStatus: "partial",
      metricsStatus: "warning",
      parserQuoteReady: false,
      gcodeSha256: SHA_C,
    });
    const result = createSlicingJobForVerifiedFile(db, jobInput(fixture));

    assert.equal(partial.status, "partial");
    assert.equal(result.created, true);
    assert.notEqual(result.job.id, partial.id);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("terminal failed task allows a new identical slicing task", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job, fixture } = createClaimedJob(db);
    const failed = failSlicingJob(db, {
      ...activeInput(job.id, claimed.lockOwner),
      errorCode: "INPUT_SHA_MISMATCH",
      errorMessage: "input hash mismatch",
    });
    const result = createSlicingJobForVerifiedFile(db, jobInput(fixture));

    assert.equal(failed.status, "failed");
    assert.equal(result.created, true);
    assert.notEqual(result.job.id, failed.id);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("terminal cancelled task allows a new identical slicing task", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const cancelled = createSlicingJob(db, jobInput(fixture));
    db.prepare("UPDATE slicing_jobs SET status = 'cancelled' WHERE id = ?").run(cancelled.id);

    const result = createSlicingJobForVerifiedFile(db, jobInput(fixture));

    assert.equal(result.created, true);
    assert.notEqual(result.job.id, cancelled.id);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("same slice cache identity with different required parser version can be active together", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const first = createSlicingJob(db, jobInput(fixture));
    const changed = createSlicingJob(db, {
      ...jobInput(fixture),
      requiredParserVersion: "phase05-c-parser-v2",
    });

    assert.notEqual(first.id, changed.id);
    assert.equal(first.sliceCacheKeySha256, changed.sliceCacheKeySha256);
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("Worker B cannot list or claim Worker A task", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const job = createSlicingJob(db, jobInput(fixture));

    assert.equal(listPendingSlicingJobsForWorker(db, "worker-b").length, 0);
    assert.equal(claimSlicingJob(db, { id: job.id, requestWorkerId: "worker-b", nowMs: 1000 }), null);
    assert.equal(getSlicingJobById(db, job.id).status, "pending");
  });
});

test("two workers competing for the same job result in one successful lock", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const job = createSlicingJob(db, jobInput(fixture));

    const first = claimSlicingJob(db, { id: job.id, requestWorkerId: "worker-a", nowMs: 1000 });
    const second = claimSlicingJob(db, { id: job.id, requestWorkerId: "worker-a", nowMs: 1001 });

    assert.ok(first);
    assert.ok(second);
    assert.equal(second.createdAttempt, false);
    assert.equal(second.lockOwner, first.lockOwner);
    assert.equal(getSlicingJobById(db, job.id).attemptCount, 1);
    assert.equal(countRows(db, "slicing_job_attempts"), 1);
  });
});

test("failed retryable job can be claimed again while attempts remain", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createClaimedJob(db);
    failSlicingJob(db, {
      ...activeInput(job.id, claimed.lockOwner),
      errorCode: "WORKER_IO_ERROR",
      errorMessage: "temporary worker io error",
    });

    const retry = claimSlicingJob(db, { id: job.id, requestWorkerId: "worker-a", nowMs: 3000 });

    assert.ok(retry);
    assert.equal(retry.job.attemptCount, 2);
    assert.equal(retry.job.status, "locked");
    assert.equal(countRows(db, "slicing_job_attempts"), 2);
  });
});

test("failed non-retryable job cannot be claimed again", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createClaimedJob(db);
    failSlicingJob(db, {
      ...activeInput(job.id, claimed.lockOwner),
      errorCode: "INPUT_SHA_MISMATCH",
      errorMessage: "input hash mismatch",
    });

    assert.equal(claimSlicingJob(db, { id: job.id, requestWorkerId: "worker-a", nowMs: 3000 }), null);
    assert.equal(getSlicingJobById(db, job.id).attemptCount, 1);
  });
});

test("claim update failure does not create an orphan attempt", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const job = createSlicingJob(db, jobInput(fixture));

    assert.equal(claimSlicingJob(db, { id: job.id, requestWorkerId: "worker-b", nowMs: 1000 }), null);
    assert.equal(countRows(db, "slicing_job_attempts"), 0);
  });
});

test("claim inserts attempt atomically and rolls back if attempt insert fails", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const job = createSlicingJob(db, jobInput(fixture));
    db.exec(`
      CREATE TRIGGER block_slicing_attempt_insert
      BEFORE INSERT ON slicing_job_attempts
      BEGIN
        SELECT RAISE(ABORT, 'attempt insert blocked');
      END;
    `);

    assert.throws(
      () => claimSlicingJob(db, { id: job.id, requestWorkerId: "worker-a", nowMs: 1000 }),
      /attempt insert blocked/,
    );

    const after = getSlicingJobById(db, job.id);
    assert.equal(after.status, "pending");
    assert.equal(after.attemptCount, 0);
    assert.equal(countRows(db, "slicing_job_attempts"), 0);
  });
});

test("lock_owner is random and unique", async () => {
  await withDb(async ({ db }) => {
    const firstFixture = createVerifiedSyncFixture(db, { workerId: "worker-a", fileName: "a.stl" });
    const secondFixture = createVerifiedSyncFixture(db, { workerId: "worker-a", fileName: "b.stl", sha: SHA_B });
    const firstJob = createSlicingJob(db, jobInput(firstFixture));
    const secondJob = createSlicingJob(db, jobInput(secondFixture));

    const first = claimSlicingJob(db, { id: firstJob.id, requestWorkerId: "worker-a", nowMs: 1000 });
    const second = claimSlicingJob(db, { id: secondJob.id, requestWorkerId: "worker-a", nowMs: 1000 });

    assert.ok(first?.lockOwner);
    assert.ok(second?.lockOwner);
    assert.notEqual(first.lockOwner, second.lockOwner);
    assert.match(first.lockOwner, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(first.lockOwner, "worker-a");
  });
});

test("new slicing lock uses the frozen 120 second lease and lock expiry", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createClaimedJob(db, { nowMs: 10_000 });
    const locked = getSlicingJobById(db, job.id);
    const attempt = getSlicingJobAttemptByLockOwner(db, claimed.lockOwner);

    assert.equal(WORKER_SLICING_LEASE_DURATION_MS, 120_000);
    assert.equal(locked.lockedAtMs, 10_000);
    assert.equal(locked.leaseRenewedAtMs, 10_000);
    assert.equal(locked.leaseExpiresAtMs - locked.lockedAtMs, WORKER_SLICING_LEASE_DURATION_MS);
    assert.equal(locked.lockExpiresAtMs - locked.lockedAtMs, WORKER_SLICING_LEASE_DURATION_MS);
    assert.equal(attempt.leaseExpiresAtMs - attempt.leaseRenewedAtMs, WORKER_SLICING_LEASE_DURATION_MS);
  });
});

test("default slicing lease renewal uses the frozen 120 second lease and does not shorten", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createClaimedJob(db, { nowMs: 10_000 });

    assert.equal(
      renewSlicingJobLease(db, {
        id: job.id,
        workerId: "worker-a",
        lockOwner: claimed.lockOwner,
        nowMs: 20_000,
      }),
      true,
    );

    let renewed = getSlicingJobById(db, job.id);
    let attempt = getSlicingJobAttemptByLockOwner(db, claimed.lockOwner);
    assert.equal(renewed.leaseRenewedAtMs, 20_000);
    assert.equal(renewed.leaseExpiresAtMs - renewed.leaseRenewedAtMs, WORKER_SLICING_LEASE_DURATION_MS);
    assert.equal(attempt.leaseExpiresAtMs - attempt.leaseRenewedAtMs, WORKER_SLICING_LEASE_DURATION_MS);

    const longFutureLease = 1_000_000;
    db.prepare("UPDATE slicing_jobs SET lease_expires_at_ms = ? WHERE id = ?").run(longFutureLease, job.id);
    db.prepare("UPDATE slicing_job_attempts SET lease_expires_at_ms = ? WHERE lock_owner = ?").run(
      longFutureLease,
      claimed.lockOwner,
    );

    assert.equal(
      renewSlicingJobLease(db, {
        id: job.id,
        workerId: "worker-a",
        lockOwner: claimed.lockOwner,
        nowMs: 30_000,
      }),
      true,
    );

    renewed = getSlicingJobById(db, job.id);
    attempt = getSlicingJobAttemptByLockOwner(db, claimed.lockOwner);
    assert.equal(renewed.leaseExpiresAtMs, longFutureLease);
    assert.equal(renewed.leaseRenewedAtMs, 30_000);
    assert.equal(attempt.leaseExpiresAtMs, longFutureLease);
    assert.equal(attempt.leaseRenewedAtMs, 30_000);
  });
});

test("Worker Slicing lease paths do not use the stale five minute default", async () => {
  const files = [
    "../src/backend/workerSlicingJobs.ts",
    "../src/app/api/worker/slicing/jobs/[id]/lock/route.ts",
    "../src/app/api/worker/slicing/jobs/[id]/lease/route.ts",
  ];

  for (const file of files) {
    const content = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(content, /5\s*\*\s*60\s*\*\s*1000|300_?000|DEFAULT_LEASE_DURATION_MS|DEFAULT_LOCK_DURATION_MS/);
  }
});

test("lease renewal updates main job and attempt together, and expired lease returns conflict", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createClaimedJob(db, { nowMs: 1000, leaseDurationMs: 1000 });

    assert.equal(
      renewSlicingJobLease(db, {
        id: job.id,
        workerId: "worker-a",
        lockOwner: claimed.lockOwner,
        nowMs: 1500,
        leaseDurationMs: 2000,
      }),
      true,
    );

    const renewed = getSlicingJobById(db, job.id);
    const attempt = getSlicingJobAttemptByLockOwner(db, claimed.lockOwner);
    assert.equal(renewed.leaseRenewedAtMs, 1500);
    assert.equal(renewed.leaseExpiresAtMs, 3500);
    assert.equal(attempt.leaseRenewedAtMs, 1500);
    assert.equal(attempt.leaseExpiresAtMs, 3500);

    assert.equal(
      renewSlicingJobLease(db, {
        id: job.id,
        workerId: "worker-a",
        lockOwner: claimed.lockOwner,
        nowMs: 3500,
      }),
      false,
    );
  });
});

test("status transitions validate current state, worker, and lock_owner", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createClaimedJob(db);

    assert.equal(markSlicingJobParsing(db, activeInput(job.id, claimed.lockOwner)), null);
    assert.equal(markSlicingJobSlicing(db, activeInput(job.id, "wrong-lock"))?.id ?? null, null);
    assert.equal(markSlicingJobSlicing(db, activeInput(job.id, claimed.lockOwner))?.status, "slicing");
    assert.equal(markSlicingJobSliced(db, activeInput(job.id, claimed.lockOwner))?.status, "sliced");
    assert.equal(markSlicingJobParsing(db, activeInput(job.id, claimed.lockOwner))?.status, "parsing");
  });
});

test("entering sliced writes artifact_worker_id", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createClaimedJob(db);
    markSlicingJobSlicing(db, activeInput(job.id, claimed.lockOwner));
    const sliced = markSlicingJobSliced(db, {
      ...activeInput(job.id, claimed.lockOwner),
      artifactWorkerId: "worker-a",
      gcodeRelativePath: "results/job/output.gcode",
      gcodeSizeBytes: 123,
      gcodeSha256: SHA_C,
    });

    assert.equal(sliced?.artifactWorkerId, "worker-a");
    assert.equal(sliced?.gcodeRelativePath, "results/job/output.gcode");
  });
});

test("complete result finalizes attempt and clears lock and lease fields", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createParsingJob(db);
    const completed = completeSlicingJobResult(db, {
      ...activeInput(job.id, claimed.lockOwner),
      actualParserVersion: "phase05-c-parser-v1",
      parseStatus: "parsed",
      metricsStatus: "valid",
      parserQuoteReady: true,
      gcodeSha256: SHA_C,
      printTimeSeconds: 100,
    });

    assert.equal(completed?.status, "completed");
    assert.equal(completed?.lockOwner, null);
    assert.equal(completed?.lockedAtMs, null);
    assert.equal(completed?.lockExpiresAtMs, null);
    assert.equal(completed?.leaseExpiresAtMs, null);

    const attempt = getSlicingJobAttemptByLockOwner(db, claimed.lockOwner);
    assert.equal(attempt.status, "completed");
  });
});

test("partial result is selected when parser metrics are warning or not quote ready", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createParsingJob(db);
    const partial = completeSlicingJobResult(db, {
      ...activeInput(job.id, claimed.lockOwner),
      actualParserVersion: "phase05-c-parser-v1",
      parseStatus: "parsed",
      metricsStatus: "warning",
      parserQuoteReady: false,
      gcodeSha256: SHA_C,
    });

    assert.equal(partial?.status, "partial");
    assert.equal(partial?.parserQuoteReady, false);
  });
});

test("completed job cannot be overwritten by failed", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createParsingJob(db);
    completeSlicingJobResult(db, {
      ...activeInput(job.id, claimed.lockOwner),
      actualParserVersion: "phase05-c-parser-v1",
      parseStatus: "parsed",
      metricsStatus: "valid",
      parserQuoteReady: true,
      gcodeSha256: SHA_C,
    });

    assert.equal(
      failSlicingJob(db, {
        ...activeInput(job.id, claimed.lockOwner),
        errorCode: "WORKER_IO_ERROR",
        errorMessage: "late failure",
      }),
      null,
    );
    assert.equal(getSlicingJobById(db, job.id).status, "completed");
  });
});

test("failed job clears locks and writes attempt error", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createClaimedJob(db);
    const failed = failSlicingJob(db, {
      ...activeInput(job.id, claimed.lockOwner),
      errorCode: "WORKER_IO_ERROR",
      errorMessage: "token=secret 13900000000 test@example.com",
    });

    assert.equal(failed?.status, "failed");
    assert.equal(failed?.lockOwner, null);
    assert.equal(failed?.leaseExpiresAtMs, null);
    assert.equal(failed?.lastErrorCode, "WORKER_IO_ERROR");
    assert.doesNotMatch(failed?.lastError || "", /secret|13900000000|test@example.com/);
    assert.equal(getSlicingJobAttemptByLockOwner(db, claimed.lockOwner).status, "failed");
  });
});

test("metrics_cache creates a new row without attempts or artifact paths", async () => {
  await withDb(async ({ db }) => {
    const { job } = createCompletedSourceJob(db);
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a", fileName: "cache-copy.stl", sha: SHA_A });
    const cached = createMetricsCacheReuseJob(db, {
      sourceSlicingJobId: job.id,
      fileSyncJobId: fixture.syncJobId,
      fileId: fixture.fileId,
      nowMs: 9000,
    });

    assert.equal(cached.resultOrigin, "metrics_cache");
    assert.equal(cached.sourceSlicingJobId, job.id);
    assert.equal(cached.attemptCount, 0);
    assert.equal(cached.cacheReusedAtMs, 9000);
    assert.equal(cached.gcodeRelativePath, null);
    assert.equal(cached.stdoutRelativePath, null);
    assert.equal(cached.stderrRelativePath, null);
    assert.equal(cached.sliceDurationMs, null);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM slicing_job_attempts WHERE slicing_job_id = ?").get(cached.id).count,
      0,
    );
  });
});

test("metrics_cache can create a new audit row for the same file_sync_job_id", async () => {
  await withDb(async ({ db }) => {
    const { job, fixture } = createCompletedSourceJob(db);
    const cached = createMetricsCacheReuseJob(db, {
      sourceSlicingJobId: job.id,
      fileSyncJobId: fixture.syncJobId,
      fileId: fixture.fileId,
      nowMs: 9000,
    });

    assert.notEqual(cached.id, job.id);
    assert.equal(cached.fileSyncJobId, job.fileSyncJobId);
    assert.equal(cached.sourceSlicingJobId, job.id);
    assert.equal(cached.resultOrigin, "metrics_cache");
    assert.equal(countRows(db, "slicing_jobs"), 2);
  });
});

test("metrics_cache can reuse partial source metrics but not active source jobs", async () => {
  await withDb(async ({ db }) => {
    const { claimed, job } = createParsingJob(db);
    const partial = completeSlicingJobResult(db, {
      ...activeInput(job.id, claimed.lockOwner),
      actualParserVersion: "phase05-c-parser-v1",
      parseStatus: "partial",
      metricsStatus: "warning",
      parserQuoteReady: false,
      gcodeSha256: SHA_C,
    });
    const partialFixture = createVerifiedSyncFixture(db, {
      workerId: "worker-a",
      fileName: "cache-partial-copy.stl",
      sha: SHA_A,
    });

    assert.equal(partial.status, "partial");
    assert.equal(
      createMetricsCacheReuseJob(db, {
        sourceSlicingJobId: partial.id,
        fileSyncJobId: partialFixture.syncJobId,
        fileId: partialFixture.fileId,
        nowMs: 9000,
      }).status,
      "partial",
    );

    const activeFixture = createVerifiedSyncFixture(db, { workerId: "worker-a", fileName: "active-source.stl" });
    const activeJob = createSlicingJob(db, jobInput(activeFixture));
    const targetFixture = createVerifiedSyncFixture(db, { workerId: "worker-a", fileName: "active-target.stl" });
    assert.throws(
      () =>
        createMetricsCacheReuseJob(db, {
          sourceSlicingJobId: activeJob.id,
          fileSyncJobId: targetFixture.syncJobId,
          fileId: targetFixture.fileId,
        }),
      /not reusable/,
    );
  });
});

test("metrics_cache constraints require source, cache time, terminal status, and null artifacts", async () => {
  await withDb(async ({ db }) => {
    assert.throws(
      () => {
        db.prepare(
          `INSERT INTO slicing_jobs (
            file_id, file_sync_job_id, input_worker_id, status, slicer_name,
            required_slicer_package_version, profile_key, profile_version, profile_sha256,
            slice_params_json, slice_params_sha256, slice_cache_key_sha256,
            input_filename, input_relative_path, input_size_bytes, input_sha256,
            result_origin, required_parser_version
          ) VALUES (1, 1, 'worker-a', 'pending', 'PrusaSlicer', '2.7',
            'p1s', 'v1', ?, '{}', ?, ?, 'a.stl', 'a.stl', 1, ?, 'metrics_cache', 'parser')`,
        ).run(SHA_A, SHA_B, SHA_C, SHA_D);
      },
      /CHECK constraint failed/,
    );
  });
});

test("metrics_cache rows reject negative cache_reused_at_ms", async () => {
  await withDb(async ({ db }) => {
    const { job } = createCompletedSourceJob(db);
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a", fileName: "cache-negative.stl", sha: SHA_A });
    const cached = createMetricsCacheReuseJob(db, {
      sourceSlicingJobId: job.id,
      fileSyncJobId: fixture.syncJobId,
      fileId: fixture.fileId,
      nowMs: 9000,
    });

    assert.throws(() => db.prepare("UPDATE slicing_jobs SET cache_reused_at_ms = -1 WHERE id = ?").run(cached.id), /CHECK/);
  });
});

test("Unix millisecond CHECK constraints reject negative values", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const job = createSlicingJob(db, jobInput(fixture));
    assert.throws(() => db.prepare("UPDATE slicing_jobs SET locked_at_ms = -1 WHERE id = ?").run(job.id), /CHECK/);
  });
});

test("cache key field order is stable and value changes alter SHA", () => {
  const first = computeSliceCacheKey({
    inputSha256: SHA_A,
    profileSha256: SHA_B,
    sliceParamsSha256: SHA_C,
    slicerName: "PrusaSlicer",
    slicerPackageVersion: "2.7.2",
  });
  const reordered = computeSliceCacheKey({
    slicerPackageVersion: "2.7.2",
    slicerName: "PrusaSlicer",
    sliceParamsSha256: SHA_C,
    profileSha256: SHA_B,
    inputSha256: SHA_A,
  });
  const changed = computeSliceCacheKey({
    inputSha256: SHA_A,
    profileSha256: SHA_B,
    sliceParamsSha256: SHA_D,
    slicerName: "PrusaSlicer",
    slicerPackageVersion: "2.7.2",
  });

  assert.equal(first, reordered);
  assert.notEqual(first, changed);

  const parseFirst = computeParseCacheKey({ gcodeSha256: SHA_C, parserVersion: "p1" });
  const parseReordered = computeParseCacheKey({ parserVersion: "p1", gcodeSha256: SHA_C });
  const parseChanged = computeParseCacheKey({ gcodeSha256: SHA_D, parserVersion: "p1" });
  assert.equal(parseFirst, parseReordered);
  assert.notEqual(parseFirst, parseChanged);
});

test("foreign keys use RESTRICT for slicing tables", async () => {
  await withDb(async ({ db }) => {
    const slicingFks = db.prepare("PRAGMA foreign_key_list(slicing_jobs)").all();
    const attemptFks = db.prepare("PRAGMA foreign_key_list(slicing_job_attempts)").all();
    assert.equal(slicingFks.every((fk) => fk.on_delete === "RESTRICT"), true);
    assert.equal(attemptFks.every((fk) => fk.on_delete === "RESTRICT"), true);
  });
});

test("file_sync ordinary index exists and old unique index is absent", async () => {
  await withDb(async ({ db }) => {
    const indexes = db.prepare("PRAGMA index_list(slicing_jobs)").all();
    const fileSyncIndex = indexes.find((index) => index.name === "idx_slicing_jobs_file_sync");
    const oldUniqueIndex = indexes.find((index) => index.name === "idx_slicing_jobs_file_sync_unique");
    const activeIdentityIndex = indexes.find((index) => index.name === "idx_slicing_jobs_active_identity_unique");

    assert.ok(fileSyncIndex);
    assert.equal(fileSyncIndex.unique, 0);
    assert.equal(oldUniqueIndex, undefined);
    assert.ok(activeIdentityIndex);
    assert.equal(activeIdentityIndex.unique, 1);
    assert.equal(activeIdentityIndex.partial, 1);
  });
});

test("slicing_jobs has no price fields and does not modify orders or payments", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const beforeOrder = db.prepare("SELECT estimated_price AS estimatedPrice, payment_status AS paymentStatus FROM orders WHERE id = ?").get(fixture.orderId);
    const beforePaymentCount = tableExists(db, "order_payments") ? countRows(db, "order_payments") : 0;

    createSlicingJob(db, jobInput(fixture));

    const afterOrder = db.prepare("SELECT estimated_price AS estimatedPrice, payment_status AS paymentStatus FROM orders WHERE id = ?").get(fixture.orderId);
    const afterPaymentCount = tableExists(db, "order_payments") ? countRows(db, "order_payments") : 0;
    const columns = columnNames(db, "slicing_jobs");

    assert.deepEqual(afterOrder, beforeOrder);
    assert.equal(afterPaymentCount, beforePaymentCount);
    assert.equal(columns.some((column) => /price|fee|payment/i.test(column)), false);
  });
});

test("wechat payment tables are not touched by slicing helpers", async () => {
  await withDb(async ({ db }) => {
    const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
    const before = tableExists(db, "wechat_refunds") ? countRows(db, "wechat_refunds") : 0;
    createSlicingJob(db, jobInput(fixture));
    const after = tableExists(db, "wechat_refunds") ? countRows(db, "wechat_refunds") : 0;
    assert.equal(after, before);
  });
});

async function withDb(run) {
  const root = await mkdtemp(join(tmpdir(), "make3d-worker-slicing-jobs-"));
  const dbPath = join(root, "make3d.db");
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `file:${dbPath}`;
  const db = initDatabase(dbPath);

  try {
    await run({ db, dbPath, root });
  } finally {
    db.close();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function createVerifiedSyncFixture(db, options = {}) {
  const fileName = options.fileName || "model.stl";
  const order = createOrderWithFile(db, {
    customerId: null,
    customerName: "Slicing Test",
    phone: "13900000000",
    wechat: "slicing-test",
    material: "PLA",
    color: "black",
    quantity: 1,
    estimatedPrice: 88,
    file: {
      filename: fileName,
      filepath: join("uploads", fileName),
      filesize: 123,
    },
  });
  const file = db.prepare("SELECT id FROM files WHERE order_id = ? ORDER BY id DESC LIMIT 1").get(order.id);
  const sync = db.prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = ?").get(file.id);
  db.prepare(
    `UPDATE local_file_sync_jobs
     SET sync_status = ?,
         worker_id = ?,
         relative_path = ?,
         local_path = ?,
         local_sha256 = ?,
         local_synced_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(
    options.syncStatus || "verified",
    options.workerId || "worker-a",
    `files/${order.orderNo}/${file.id}-${fileName}`,
    `/srv/make3d-worker/files/${order.orderNo}/${file.id}-${fileName}`,
    options.sha || SHA_A,
    sync.id,
  );

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    fileId: file.id,
    syncJobId: sync.id,
  };
}

function jobInput(fixture) {
  return {
    fileSyncJobId: fixture.syncJobId,
    fileId: fixture.fileId,
    profileKey: "bambu-p1s",
    profileVersion: "phase05-b",
    profileSha256: SHA_B,
    sliceParams: {
      material: "PLA",
      printer_model: "Bambu Lab P1S",
      nozzle_diameter_microns: 400,
      layer_height_microns: 200,
      fill_density_percent: 50,
      support_mode: "none",
      brim_width_microns: 0,
    },
    requiredSlicerPackageVersion: "2.7.2+dfsg-1build2",
    requiredParserVersion: "phase05-c-parser-v1",
  };
}

function createSlicingJob(db, input) {
  return createSlicingJobForVerifiedFile(db, input).job;
}

function createClaimedJob(db, options = {}) {
  const fixture = createVerifiedSyncFixture(db, { workerId: "worker-a" });
  const job = createSlicingJob(db, jobInput(fixture));
  const claimed = claimSlicingJob(db, {
    id: job.id,
    requestWorkerId: "worker-a",
    nowMs: options.nowMs ?? 1000,
    leaseDurationMs: options.leaseDurationMs,
  });
  assert.ok(claimed);
  return { fixture, job, claimed };
}

function createParsingJob(db) {
  const { claimed, job, fixture } = createClaimedJob(db);
  markSlicingJobSlicing(db, activeInput(job.id, claimed.lockOwner));
  markSlicingJobSliced(db, {
    ...activeInput(job.id, claimed.lockOwner),
    actualSlicerPackageVersion: "2.7.2+dfsg-1build2",
    gcodeRelativePath: "results/job/output.gcode",
    gcodeSizeBytes: 123,
    gcodeSha256: SHA_C,
    sliceDurationMs: 55,
    exitCode: 0,
  });
  markSlicingJobParsing(db, activeInput(job.id, claimed.lockOwner));
  return { claimed, job, fixture };
}

function createCompletedSourceJob(db) {
  const { claimed, job, fixture } = createParsingJob(db);
  const completed = completeSlicingJobResult(db, {
    ...activeInput(job.id, claimed.lockOwner),
    actualParserVersion: "phase05-c-parser-v1",
    parseStatus: "parsed",
    metricsStatus: "valid",
    parserQuoteReady: true,
    gcodeSha256: SHA_C,
    printTimeSeconds: 100,
    metricSourcesJson: "{}",
    metricValidationJson: "{}",
    missingFieldsJson: "[]",
    warningsJson: "[]",
  });
  assert.ok(completed);
  return { job: completed, claimed, fixture };
}

function createInsertRaceDb(db) {
  let raced = false;
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!raced && sql.includes("INSERT INTO slicing_jobs")) {
        return {
          run(...args) {
            raced = true;
            statement.run(...args);
            return statement.run(...args);
          },
        };
      }

      return statement;
    },
    exec(sql) {
      return db.exec(sql);
    },
  };
}

function activeInput(id, lockOwner) {
  return {
    id,
    workerId: "worker-a",
    lockOwner,
    nowMs: 2000,
  };
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function columnNames(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function countRows(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}
