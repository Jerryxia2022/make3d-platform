import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

export const SLICE_CACHE_KEY_VERSION = "1.0";
export const PARSE_CACHE_KEY_VERSION = "1.0";
export const DEFAULT_SLICING_JOB_MAX_ATTEMPTS = 3;
export const WORKER_SLICING_LEASE_DURATION_MS = 120_000;

const SLICE_IDENTITY_KEYS = [
  "schema_version",
  "input_sha256",
  "profile_sha256",
  "slice_params_sha256",
  "slicer_name",
  "slicer_package_version",
] as const;

const PARSE_IDENTITY_KEYS = ["schema_version", "gcode_sha256", "parser_version"] as const;
export type SlicingJobStatus =
  | "pending"
  | "locked"
  | "slicing"
  | "sliced"
  | "parsing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type SliceCacheIdentity = {
  schema_version: "1.0";
  input_sha256: string;
  profile_sha256: string;
  slice_params_sha256: string;
  slicer_name: string;
  slicer_package_version: string;
};

export type ParseCacheIdentity = {
  schema_version: "1.0";
  gcode_sha256: string;
  parser_version: string;
};

export type SlicingJobRecord = {
  id: number;
  fileId: number;
  fileSyncJobId: number;
  sourceSlicingJobId: number | null;
  inputWorkerId: string;
  artifactWorkerId: string | null;
  workerId: string | null;
  status: SlicingJobStatus;
  attemptCount: number;
  maxAttempts: number;
  lockOwner: string | null;
  lockedAtMs: number | null;
  lockExpiresAtMs: number | null;
  leaseExpiresAtMs: number | null;
  leaseRenewedAtMs: number | null;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  failedAtMs: number | null;
  slicerName: string;
  requiredSlicerPackageVersion: string;
  actualSlicerPackageVersion: string | null;
  profileKey: string;
  profileVersion: string;
  profileSha256: string;
  sliceParamsJson: string;
  sliceParamsSha256: string;
  sliceCacheKeySha256: string;
  orderNoSnapshot: string | null;
  inputRelativePath: string;
  inputSizeBytes: number;
  inputSha256: string;
  resultOrigin: "executed" | "metrics_cache";
  cacheReusedAtMs: number | null;
  gcodeRelativePath: string | null;
  stdoutRelativePath: string | null;
  stderrRelativePath: string | null;
  gcodeSizeBytes: number | null;
  gcodeSha256: string | null;
  sliceDurationMs: number | null;
  exitCode: number | null;
  requiredParserVersion: string;
  actualParserVersion: string | null;
  parseCacheKeySha256: string | null;
  parseStatus: string | null;
  metricsStatus: string | null;
  parserQuoteReady: boolean;
  printTimeSeconds: number | null;
  silentPrintTimeSeconds: number | null;
  filamentLengthMicrons: number | null;
  filamentVolumeMm3: number | null;
  filamentWeightMg: number | null;
  layerCount: number | null;
  maxLayerZMicrons: number | null;
  filamentType: string | null;
  printerModel: string | null;
  nozzleDiameterMicrons: number | null;
  layerHeightMicrons: number | null;
  metricSourcesJson: string | null;
  metricValidationJson: string | null;
  missingFieldsJson: string | null;
  warningsJson: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
};

export type SlicingJobAttemptRecord = {
  id: number;
  slicingJobId: number;
  attemptNo: number;
  workerId: string;
  lockOwner: string;
  status: string;
  leaseExpiresAtMs: number | null;
  leaseRenewedAtMs: number | null;
};

export type WorkerErrorCode =
  | "SLICER_TIMEOUT"
  | "SLICER_NON_ZERO_EXIT"
  | "SLICER_OUTPUT_MISSING"
  | "SLICER_OUTPUT_EMPTY"
  | "SLICER_GCODE_SHA_MISMATCH"
  | "PARSER_TEMPORARY"
  | "PARSER_FAILED"
  | "PARSER_RESULT_INVALID"
  | "WORKER_DISK_FULL"
  | "WORKER_IO_ERROR"
  | "WORKER_LEASE_EXPIRED_LOCKED"
  | "WORKER_LEASE_EXPIRED_SLICING"
  | "WORKER_LEASE_EXPIRED_SLICED"
  | "WORKER_LEASE_EXPIRED_PARSING"
  | "SLICER_VERSION_MISMATCH"
  | "PARSER_VERSION_MISMATCH"
  | "INPUT_SHA_MISMATCH"
  | "PROFILE_SHA_MISMATCH"
  | "SLICE_PARAMS_MISMATCH"
  | "PARSE_CACHE_KEY_MISMATCH"
  | "PARSER_VALIDATION_INCONSISTENT";

export type WorkerErrorPolicy = {
  errorCode: WorkerErrorCode;
  allowedStages: SlicingJobStatus[];
  retryable: boolean;
  publicMessage: string;
  source: "worker" | "server";
};

export const WORKER_ERROR_POLICIES: Record<WorkerErrorCode, WorkerErrorPolicy> = {
  SLICER_TIMEOUT: {
    errorCode: "SLICER_TIMEOUT",
    allowedStages: ["slicing"],
    retryable: true,
    publicMessage: "Slicer timed out",
    source: "worker",
  },
  SLICER_NON_ZERO_EXIT: {
    errorCode: "SLICER_NON_ZERO_EXIT",
    allowedStages: ["slicing"],
    retryable: false,
    publicMessage: "Slicer exited unsuccessfully",
    source: "worker",
  },
  SLICER_OUTPUT_MISSING: {
    errorCode: "SLICER_OUTPUT_MISSING",
    allowedStages: ["slicing"],
    retryable: true,
    publicMessage: "Slicer output was not found",
    source: "worker",
  },
  SLICER_OUTPUT_EMPTY: {
    errorCode: "SLICER_OUTPUT_EMPTY",
    allowedStages: ["slicing"],
    retryable: false,
    publicMessage: "Slicer output was empty",
    source: "worker",
  },
  SLICER_GCODE_SHA_MISMATCH: {
    errorCode: "SLICER_GCODE_SHA_MISMATCH",
    allowedStages: ["slicing"],
    retryable: false,
    publicMessage: "Slicer output hash mismatch",
    source: "worker",
  },
  PARSER_TEMPORARY: {
    errorCode: "PARSER_TEMPORARY",
    allowedStages: ["parsing"],
    retryable: true,
    publicMessage: "Parser temporary failure",
    source: "worker",
  },
  PARSER_FAILED: {
    errorCode: "PARSER_FAILED",
    allowedStages: ["parsing"],
    retryable: false,
    publicMessage: "Parser failed",
    source: "worker",
  },
  PARSER_RESULT_INVALID: {
    errorCode: "PARSER_RESULT_INVALID",
    allowedStages: ["parsing"],
    retryable: false,
    publicMessage: "Parser result was invalid",
    source: "worker",
  },
  WORKER_DISK_FULL: {
    errorCode: "WORKER_DISK_FULL",
    allowedStages: ["locked", "slicing", "sliced", "parsing"],
    retryable: true,
    publicMessage: "Worker disk is full",
    source: "worker",
  },
  WORKER_IO_ERROR: {
    errorCode: "WORKER_IO_ERROR",
    allowedStages: ["locked", "slicing", "sliced", "parsing"],
    retryable: true,
    publicMessage: "Worker file IO failed",
    source: "worker",
  },
  WORKER_LEASE_EXPIRED_LOCKED: {
    errorCode: "WORKER_LEASE_EXPIRED_LOCKED",
    allowedStages: ["locked"],
    retryable: true,
    publicMessage: "Worker lease expired while locked",
    source: "server",
  },
  WORKER_LEASE_EXPIRED_SLICING: {
    errorCode: "WORKER_LEASE_EXPIRED_SLICING",
    allowedStages: ["slicing"],
    retryable: true,
    publicMessage: "Worker lease expired while slicing",
    source: "server",
  },
  WORKER_LEASE_EXPIRED_SLICED: {
    errorCode: "WORKER_LEASE_EXPIRED_SLICED",
    allowedStages: ["sliced"],
    retryable: true,
    publicMessage: "Worker lease expired after slicing",
    source: "server",
  },
  WORKER_LEASE_EXPIRED_PARSING: {
    errorCode: "WORKER_LEASE_EXPIRED_PARSING",
    allowedStages: ["parsing"],
    retryable: true,
    publicMessage: "Worker lease expired while parsing",
    source: "server",
  },
  SLICER_VERSION_MISMATCH: {
    errorCode: "SLICER_VERSION_MISMATCH",
    allowedStages: ["slicing"],
    retryable: false,
    publicMessage: "Slicer version mismatch",
    source: "server",
  },
  PARSER_VERSION_MISMATCH: {
    errorCode: "PARSER_VERSION_MISMATCH",
    allowedStages: ["slicing"],
    retryable: false,
    publicMessage: "Parser version mismatch",
    source: "server",
  },
  INPUT_SHA_MISMATCH: {
    errorCode: "INPUT_SHA_MISMATCH",
    allowedStages: ["slicing"],
    retryable: false,
    publicMessage: "Input hash mismatch",
    source: "server",
  },
  PROFILE_SHA_MISMATCH: {
    errorCode: "PROFILE_SHA_MISMATCH",
    allowedStages: ["slicing"],
    retryable: false,
    publicMessage: "Profile hash mismatch",
    source: "server",
  },
  SLICE_PARAMS_MISMATCH: {
    errorCode: "SLICE_PARAMS_MISMATCH",
    allowedStages: ["slicing"],
    retryable: false,
    publicMessage: "Slice parameters hash mismatch",
    source: "server",
  },
  PARSE_CACHE_KEY_MISMATCH: {
    errorCode: "PARSE_CACHE_KEY_MISMATCH",
    allowedStages: ["parsing"],
    retryable: false,
    publicMessage: "Parse cache key mismatch",
    source: "server",
  },
  PARSER_VALIDATION_INCONSISTENT: {
    errorCode: "PARSER_VALIDATION_INCONSISTENT",
    allowedStages: ["parsing"],
    retryable: false,
    publicMessage: "Parser result consistency failed",
    source: "server",
  },
};

export function getWorkerErrorPolicy(errorCode: string) {
  return WORKER_ERROR_POLICIES[errorCode as WorkerErrorCode] || null;
}

export function isRetryableSlicingError(errorCode: string | null) {
  return Boolean(errorCode && getWorkerErrorPolicy(errorCode)?.retryable);
}

export type SlicingJobCreationResult = {
  job: SlicingJobRecord;
  created: boolean;
};

export function buildSliceCacheIdentity(input: {
  inputSha256: string;
  profileSha256: string;
  sliceParamsSha256: string;
  slicerName: string;
  slicerPackageVersion: string;
}): SliceCacheIdentity {
  return {
    schema_version: SLICE_CACHE_KEY_VERSION,
    input_sha256: normalizeSha256(input.inputSha256, "input_sha256"),
    profile_sha256: normalizeSha256(input.profileSha256, "profile_sha256"),
    slice_params_sha256: normalizeSha256(input.sliceParamsSha256, "slice_params_sha256"),
    slicer_name: normalizeRequiredText(input.slicerName, "slicer_name"),
    slicer_package_version: normalizeRequiredText(input.slicerPackageVersion, "slicer_package_version"),
  };
}

export function computeSliceCacheKey(input: Parameters<typeof buildSliceCacheIdentity>[0] | SliceCacheIdentity) {
  const identity = "schema_version" in input ? input : buildSliceCacheIdentity(input);
  return sha256Hex(stableJson(identity, SLICE_IDENTITY_KEYS));
}

export function buildParseCacheIdentity(input: {
  gcodeSha256: string;
  parserVersion: string;
}): ParseCacheIdentity {
  return {
    schema_version: PARSE_CACHE_KEY_VERSION,
    gcode_sha256: normalizeSha256(input.gcodeSha256, "gcode_sha256"),
    parser_version: normalizeRequiredText(input.parserVersion, "parser_version"),
  };
}

export function computeParseCacheKey(input: Parameters<typeof buildParseCacheIdentity>[0] | ParseCacheIdentity) {
  const identity = "schema_version" in input ? input : buildParseCacheIdentity(input);
  return sha256Hex(stableJson(identity, PARSE_IDENTITY_KEYS));
}

export function canonicalSliceParamsJson(value: unknown) {
  return stableJson(value);
}

export function computeSliceParamsSha256(value: unknown) {
  return sha256Hex(canonicalSliceParamsJson(value));
}

export function createSlicingJobForVerifiedFile(
  db: DatabaseSync,
  input: {
    fileSyncJobId: number;
    fileId: number;
    profileKey: string;
    profileVersion: string;
    profileSha256: string;
    sliceParams: unknown;
    slicerName?: string;
    requiredSlicerPackageVersion: string;
    requiredParserVersion: string;
    maxAttempts?: number;
    nowMs?: number;
  },
): SlicingJobCreationResult {
  const syncJob = getVerifiedSyncJob(db, input.fileSyncJobId, input.fileId);
  const slicerName = normalizeRequiredText(input.slicerName || "PrusaSlicer", "slicer_name");
  const sliceParamsJson = canonicalSliceParamsJson(input.sliceParams);
  const sliceParamsSha256 = computeSliceParamsSha256(input.sliceParams);
  const sliceCacheKeySha256 = computeSliceCacheKey({
    inputSha256: syncJob.localSha256,
    profileSha256: input.profileSha256,
    sliceParamsSha256,
    slicerName,
    slicerPackageVersion: input.requiredSlicerPackageVersion,
  });
  const requiredParserVersion = normalizeRequiredText(input.requiredParserVersion, "required_parser_version");
  const inputRelativePath = normalizeWorkerInputRelativePath(syncJob.relativePath);
  const identity = {
    fileSyncJobId: syncJob.id,
    sliceCacheKeySha256,
    requiredParserVersion,
  };
  const existingActive = findActiveSlicingJobByIdentity(db, identity);

  if (existingActive) {
    return { job: existingActive, created: false };
  }

  const timestamp = timestampText();

  try {
    const result = db.prepare(
      `INSERT INTO slicing_jobs (
        file_id,
        file_sync_job_id,
        customer_id_snapshot,
        order_id_snapshot,
        order_no_snapshot,
        input_worker_id,
        status,
        max_attempts,
        slicer_name,
        required_slicer_package_version,
        profile_key,
        profile_version,
        profile_sha256,
        slice_params_json,
        slice_params_sha256,
        slice_cache_key_sha256,
        input_filename,
        input_relative_path,
        input_size_bytes,
        input_sha256,
        required_parser_version,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      syncJob.fileId,
      syncJob.id,
      syncJob.customerId,
      syncJob.orderId,
      syncJob.orderNo,
      syncJob.workerId,
      Math.max(1, input.maxAttempts ?? DEFAULT_SLICING_JOB_MAX_ATTEMPTS),
      slicerName,
      normalizeRequiredText(input.requiredSlicerPackageVersion, "required_slicer_package_version"),
      normalizeRequiredText(input.profileKey, "profile_key"),
      normalizeRequiredText(input.profileVersion, "profile_version"),
      normalizeSha256(input.profileSha256, "profile_sha256"),
      sliceParamsJson,
      sliceParamsSha256,
      sliceCacheKeySha256,
      syncJob.storedFilename,
      inputRelativePath,
      syncJob.fileSizeBytes,
      syncJob.localSha256,
      requiredParserVersion,
      timestamp,
      timestamp,
    );

    return { job: getSlicingJobById(db, Number(result.lastInsertRowid)), created: true };
  } catch (error) {
    if (isActiveIdentityUniqueConflict(error)) {
      const active = findActiveSlicingJobByIdentity(db, identity);
      if (active) {
        return { job: active, created: false };
      }
    }
    throw error;
  }
}

export function listPendingSlicingJobsForWorker(db: DatabaseSync, workerId: string) {
  const retryableCodes = Object.values(WORKER_ERROR_POLICIES)
    .filter((policy) => policy.retryable)
    .map((policy) => policy.errorCode);
  const placeholders = retryableCodes.map(() => "?").join(", ");
  return db
    .prepare(
      `${slicingJobSelectSql()}
       WHERE input_worker_id = ?
         AND EXISTS (
           SELECT 1
           FROM local_file_sync_jobs
           WHERE local_file_sync_jobs.id = slicing_jobs.file_sync_job_id
             AND local_file_sync_jobs.file_id = slicing_jobs.file_id
             AND local_file_sync_jobs.sync_status = 'verified'
             AND local_file_sync_jobs.worker_id = slicing_jobs.input_worker_id
             AND local_file_sync_jobs.worker_id = ?
             AND (
               local_file_sync_jobs.relative_path = slicing_jobs.input_relative_path
               OR local_file_sync_jobs.local_path LIKE '%' || slicing_jobs.input_relative_path
             )
             AND local_file_sync_jobs.file_size_bytes = slicing_jobs.input_size_bytes
             AND local_file_sync_jobs.local_sha256 = slicing_jobs.input_sha256
         )
         AND (
           status = 'pending'
           OR (
             status = 'failed'
             AND attempt_count < max_attempts
             AND last_error_code IN (${placeholders})
           )
         )
       ORDER BY created_at, id`,
    )
    .all(normalizeRequiredText(workerId, "worker_id"), normalizeRequiredText(workerId, "worker_id"), ...retryableCodes)
    .map(normalizeSlicingJobRecord)
    .filter((job) => isWorkerInputRelativePathSafe(job.inputRelativePath)) as SlicingJobRecord[];
}

export function toPendingSlicingJobPayload(job: SlicingJobRecord) {
  const inputRelativePath = normalizeWorkerInputRelativePath(job.inputRelativePath);
  return {
    job_id: job.id,
    file_id: job.fileId,
    file_sync_job_id: job.fileSyncJobId,
    order_no: job.orderNoSnapshot,
    input_worker_id: job.inputWorkerId,
    input_relative_path: inputRelativePath,
    input_sha256: job.inputSha256,
    input_size_bytes: job.inputSizeBytes,
    profile_key: job.profileKey,
    profile_version: job.profileVersion,
    profile_sha256: job.profileSha256,
    slice_params: JSON.parse(job.sliceParamsJson),
    slice_params_sha256: job.sliceParamsSha256,
    slice_cache_key_sha256: job.sliceCacheKeySha256,
    required_slicer_package_version: job.requiredSlicerPackageVersion,
    required_parser_version: job.requiredParserVersion,
    resume_from: getResumeFromSlicingJob(job, job.inputWorkerId),
  };
}

export function getResumeFromSlicingJob(job: SlicingJobRecord, workerId: string): null | "sliced" | "parsing" {
  if (job.artifactWorkerId !== workerId) return null;
  if (!job.gcodeRelativePath || !job.gcodeSha256 || !job.gcodeSizeBytes) return null;
  if (!getResumeArtifactAttemptNo(job)) return null;
  if (job.lastErrorCode === "WORKER_LEASE_EXPIRED_SLICED") return "sliced";
  if (job.lastErrorCode === "WORKER_LEASE_EXPIRED_PARSING") return "parsing";
  return null;
}

function getResumeArtifactAttemptNo(job: SlicingJobRecord) {
  const match = String(job.gcodeRelativePath || "").match(new RegExp(`^results/prusaslicer/${job.id}/attempt-([1-9][0-9]*)/output\\.gcode$`));
  if (!match) return null;
  const attemptNo = Number(match[1]);
  if (!Number.isSafeInteger(attemptNo) || attemptNo <= 0 || attemptNo > job.attemptCount) return null;
  const stdoutOk = !job.stdoutRelativePath || job.stdoutRelativePath === `results/prusaslicer/${job.id}/attempt-${attemptNo}/stdout.log`;
  const stderrOk = !job.stderrRelativePath || job.stderrRelativePath === `results/prusaslicer/${job.id}/attempt-${attemptNo}/stderr.log`;
  return stdoutOk && stderrOk ? attemptNo : null;
}

function isResumeArtifactAttemptRecorded(db: DatabaseSync, job: SlicingJobRecord, workerId: string) {
  const attemptNo = getResumeArtifactAttemptNo(job);
  if (!attemptNo) return false;
  const row = db
    .prepare(
      `SELECT 1
       FROM slicing_job_attempts
       WHERE slicing_job_id = ?
         AND attempt_no = ?
         AND worker_id = ?
         AND gcode_relative_path = ?
         AND gcode_size_bytes = ?
         AND gcode_sha256 = ?
       LIMIT 1`,
    )
    .get(job.id, attemptNo, workerId, job.gcodeRelativePath, job.gcodeSizeBytes, job.gcodeSha256);
  return Boolean(row);
}

function findActiveSlicingJobByIdentity(
  db: DatabaseSync,
  input: {
    fileSyncJobId: number;
    sliceCacheKeySha256: string;
    requiredParserVersion: string;
  },
) {
  const row = db
    .prepare(
      `${slicingJobSelectSql()}
       WHERE file_sync_job_id = ?
         AND slice_cache_key_sha256 = ?
         AND required_parser_version = ?
         AND status IN ('pending', 'locked', 'slicing', 'sliced', 'parsing')
       ORDER BY created_at ASC, id ASC
       LIMIT 1`,
    )
    .get(input.fileSyncJobId, input.sliceCacheKeySha256, input.requiredParserVersion);

  return row ? normalizeSlicingJobRecord(row) : null;
}

function isActiveIdentityUniqueConflict(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  const message = error.message;
  return (
    (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "ERR_SQLITE_ERROR") &&
    (message.includes("idx_slicing_jobs_active_identity_unique") ||
      (message.includes("slicing_jobs.file_sync_job_id") &&
        message.includes("slicing_jobs.slice_cache_key_sha256") &&
        message.includes("slicing_jobs.required_parser_version")))
  );
}

export function validateSlicingJobRequiredVersions(
  db: DatabaseSync,
  id: number,
  input: {
    actualSlicerPackageVersion: string;
    actualParserVersion: string;
  },
) {
  const job = getSlicingJobById(db, id);

  if (input.actualSlicerPackageVersion !== job.requiredSlicerPackageVersion) {
    return { ok: false, errorCode: "SLICER_VERSION_MISMATCH" };
  }

  if (input.actualParserVersion !== job.requiredParserVersion) {
    return { ok: false, errorCode: "PARSER_VERSION_MISMATCH" };
  }

  return { ok: true, errorCode: null };
}

export function claimSlicingJob(
  db: DatabaseSync,
  input: {
    id: number;
    requestWorkerId: string;
    nowMs?: number;
    leaseDurationMs?: number;
    lockDurationMs?: number;
    lockOwner?: string;
  },
) {
  const nowMs = normalizeNonNegativeInteger(input.nowMs ?? Date.now(), "now_ms");
  const leaseDurationMs = Math.max(1, input.leaseDurationMs ?? WORKER_SLICING_LEASE_DURATION_MS);
  const lockDurationMs = Math.max(1, input.lockDurationMs ?? WORKER_SLICING_LEASE_DURATION_MS);
  const lockOwner = input.lockOwner || createLockOwner();
  const workerId = normalizeRequiredText(input.requestWorkerId, "worker_id");
  const timestamp = timestampText();

  db.exec("BEGIN IMMEDIATE");
  try {
    reconcileExpiredSlicingJobInTransaction(db, input.id, workerId, nowMs, timestamp);

    const replay = db
      .prepare(
        `${slicingJobSelectSql()}
         WHERE id = ?
           AND input_worker_id = ?
           AND worker_id = ?
           AND status = 'locked'
           AND lease_expires_at_ms > ?`,
      )
      .get(input.id, workerId, workerId, nowMs);

    if (replay) {
      const replayJob = normalizeSlicingJobRecord(replay);
      const replayAttempt = getSlicingJobAttemptByLockOwner(db, replayJob.lockOwner || "");
      const resumeFrom = isResumeArtifactAttemptRecorded(db, replayJob, workerId) ? getResumeFromSlicingJob(replayJob, workerId) : null;
      db.exec("COMMIT");
      return {
        job: replayJob,
        attempt: replayAttempt,
        lockOwner: replayJob.lockOwner,
        createdAttempt: false,
        resumeFrom,
      };
    }

    const retryableCodes = Object.values(WORKER_ERROR_POLICIES)
      .filter((policy) => policy.retryable)
      .map((policy) => policy.errorCode);
    const retryablePlaceholders = retryableCodes.map(() => "?").join(", ");
    const beforeLock = db.prepare(`${slicingJobSelectSql()} WHERE id = ?`).get(input.id);
    const beforeLockJob = beforeLock ? normalizeSlicingJobRecord(beforeLock) : null;
    const resumeFrom = beforeLockJob && isResumeArtifactAttemptRecorded(db, beforeLockJob, workerId)
      ? getResumeFromSlicingJob(beforeLockJob, workerId)
      : null;
    const result = db.prepare(
      `UPDATE slicing_jobs
       SET status = 'locked',
           worker_id = ?,
           lock_owner = ?,
           attempt_count = attempt_count + 1,
           locked_at_ms = ?,
           lock_expires_at_ms = ?,
           lease_expires_at_ms = ?,
           lease_renewed_at_ms = ?,
           updated_at = ?
       WHERE id = ?
         AND input_worker_id = ?
         AND (
           status = 'pending'
           OR (
             status = 'failed'
             AND attempt_count < max_attempts
             AND last_error_code IN (${retryablePlaceholders})
           )
         )`,
    ).run(
      workerId,
      lockOwner,
      nowMs,
      nowMs + lockDurationMs,
      nowMs + leaseDurationMs,
      nowMs,
      timestamp,
      input.id,
      workerId,
      ...retryableCodes,
    );

    if (result.changes !== 1) {
      db.exec("ROLLBACK");
      return null;
    }

    const attemptNo = getAttemptCount(db, input.id);
    db.prepare(
      `INSERT INTO slicing_job_attempts (
        slicing_job_id,
        attempt_no,
        worker_id,
        lock_owner,
        status,
        started_at_ms,
        lease_expires_at_ms,
        lease_renewed_at_ms,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'locked', ?, ?, ?, ?, ?)`,
    ).run(input.id, attemptNo, workerId, lockOwner, nowMs, nowMs + leaseDurationMs, nowMs, timestamp, timestamp);

    db.exec("COMMIT");
    return {
      job: getSlicingJobById(db, input.id),
      attempt: getSlicingJobAttemptByLockOwner(db, lockOwner),
      lockOwner,
      createdAttempt: true,
      resumeFrom,
    };
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}

export function renewSlicingJobLease(
  db: DatabaseSync,
  input: {
    id: number;
    workerId: string;
    lockOwner: string;
    nowMs?: number;
    leaseDurationMs?: number;
  },
) {
  const nowMs = normalizeNonNegativeInteger(input.nowMs ?? Date.now(), "now_ms");
  const leaseDurationMs = Math.max(1, input.leaseDurationMs ?? WORKER_SLICING_LEASE_DURATION_MS);
  const workerId = normalizeRequiredText(input.workerId, "worker_id");
  const lockOwner = normalizeRequiredText(input.lockOwner, "lock_owner");
  const timestamp = timestampText();

  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db
      .prepare(
        `SELECT lease_expires_at_ms AS leaseExpiresAtMs
         FROM slicing_jobs
         WHERE id = ?
           AND worker_id = ?
           AND lock_owner = ?
           AND status IN ('locked', 'slicing', 'sliced', 'parsing')
           AND lease_expires_at_ms > ?`,
      )
      .get(input.id, workerId, lockOwner, nowMs) as { leaseExpiresAtMs: number } | undefined;

    if (!current) {
      db.exec("ROLLBACK");
      return false;
    }

    const newExpiry = Math.max(Number(current.leaseExpiresAtMs), nowMs + leaseDurationMs);
    const result = db.prepare(
      `UPDATE slicing_jobs
       SET lease_expires_at_ms = ?,
           lease_renewed_at_ms = ?,
           updated_at = ?
       WHERE id = ?
         AND worker_id = ?
         AND lock_owner = ?
         AND status IN ('locked', 'slicing', 'sliced', 'parsing')
         AND lease_expires_at_ms > ?`,
    ).run(newExpiry, nowMs, timestamp, input.id, workerId, lockOwner, nowMs);

    if (result.changes !== 1) {
      db.exec("ROLLBACK");
      return false;
    }

    const attemptResult = db.prepare(
      `UPDATE slicing_job_attempts
       SET lease_expires_at_ms = ?,
           lease_renewed_at_ms = ?,
           updated_at = ?
       WHERE slicing_job_id = ?
         AND worker_id = ?
         AND lock_owner = ?
         AND status IN ('locked', 'slicing', 'sliced', 'parsing')`,
    ).run(newExpiry, nowMs, timestamp, input.id, workerId, lockOwner);

    if (attemptResult.changes !== 1) {
      db.exec("ROLLBACK");
      return false;
    }

    db.exec("COMMIT");
    return true;
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}

export function markSlicingJobSlicing(db: DatabaseSync, input: ActiveTransitionInput) {
  return transitionActiveJob(db, input, {
    fromStatus: "locked",
    toStatus: "slicing",
    mainAssignments: "started_at_ms = COALESCE(started_at_ms, ?)",
    mainValues: [normalizeNonNegativeInteger(input.nowMs ?? Date.now(), "now_ms")],
    attemptAssignments: "status = 'slicing', started_at_ms = COALESCE(started_at_ms, ?)",
    attemptValues: [normalizeNonNegativeInteger(input.nowMs ?? Date.now(), "now_ms")],
  });
}

export function markSlicingJobSliced(
  db: DatabaseSync,
  input: ActiveTransitionInput & {
    actualSlicerPackageVersion?: string | null;
    artifactWorkerId?: string | null;
    gcodeRelativePath?: string | null;
    gcodeSizeBytes?: number | null;
    gcodeSha256?: string | null;
    stdoutRelativePath?: string | null;
    stderrRelativePath?: string | null;
    sliceDurationMs?: number | null;
    exitCode?: number | null;
  },
) {
  const artifactWorkerId = normalizeRequiredText(input.artifactWorkerId || input.workerId, "artifact_worker_id");
  return transitionActiveJob(db, input, {
    fromStatus: "slicing",
    toStatus: "sliced",
    mainAssignments: [
      "artifact_worker_id = ?",
      "actual_slicer_package_version = COALESCE(?, actual_slicer_package_version)",
      "gcode_relative_path = COALESCE(?, gcode_relative_path)",
      "gcode_size_bytes = COALESCE(?, gcode_size_bytes)",
      "gcode_sha256 = COALESCE(?, gcode_sha256)",
      "stdout_relative_path = COALESCE(?, stdout_relative_path)",
      "stderr_relative_path = COALESCE(?, stderr_relative_path)",
      "slice_duration_ms = COALESCE(?, slice_duration_ms)",
      "exit_code = COALESCE(?, exit_code)",
    ].join(", "),
    mainValues: [
      artifactWorkerId,
      input.actualSlicerPackageVersion || null,
      input.gcodeRelativePath || null,
      input.gcodeSizeBytes ?? null,
      input.gcodeSha256 ? normalizeSha256(input.gcodeSha256, "gcode_sha256") : null,
      input.stdoutRelativePath || null,
      input.stderrRelativePath || null,
      input.sliceDurationMs ?? null,
      input.exitCode ?? null,
    ],
    attemptAssignments: [
      "status = 'sliced'",
      "gcode_relative_path = COALESCE(?, gcode_relative_path)",
      "gcode_size_bytes = COALESCE(?, gcode_size_bytes)",
      "gcode_sha256 = COALESCE(?, gcode_sha256)",
      "stdout_relative_path = COALESCE(?, stdout_relative_path)",
      "stderr_relative_path = COALESCE(?, stderr_relative_path)",
      "slice_duration_ms = COALESCE(?, slice_duration_ms)",
      "exit_code = COALESCE(?, exit_code)",
    ].join(", "),
    attemptValues: [
      input.gcodeRelativePath || null,
      input.gcodeSizeBytes ?? null,
      input.gcodeSha256 ? normalizeSha256(input.gcodeSha256, "gcode_sha256") : null,
      input.stdoutRelativePath || null,
      input.stderrRelativePath || null,
      input.sliceDurationMs ?? null,
      input.exitCode ?? null,
    ],
  });
}

export function markSlicingJobParsing(db: DatabaseSync, input: ActiveTransitionInput & { gcodeSha256?: string | null }) {
  const job = getSlicingJobById(db, input.id);
  const workerId = normalizeRequiredText(input.workerId, "worker_id");
  const gcodeSha256 = input.gcodeSha256 ? normalizeSha256(input.gcodeSha256, "gcode_sha256") : null;

  if (job.status === "locked") {
    const resumeFrom = getResumeFromSlicingJob(job, workerId);
    if (!resumeFrom || !gcodeSha256 || job.gcodeSha256 !== gcodeSha256) {
      return null;
    }
    return transitionActiveJob(db, input, {
      fromStatus: "locked",
      toStatus: "parsing",
      mainAssignments: "last_error_code = NULL, last_error = NULL",
      mainValues: [],
      attemptAssignments: "status = 'parsing'",
      attemptValues: [],
    });
  }

  return transitionActiveJob(db, input, {
    fromStatus: "sliced",
    toStatus: "parsing",
    mainAssignments: "",
    mainValues: [],
    attemptAssignments: "status = 'parsing'",
    attemptValues: [],
  });
}

export function completeSlicingJobResult(
  db: DatabaseSync,
  input: ActiveTransitionInput & {
    actualParserVersion: string;
    parseStatus: "parsed" | "partial";
    metricsStatus: "ok" | "warning" | "error" | "valid";
    parserQuoteReady: boolean;
    gcodeSha256: string;
    printTimeSeconds?: number | null;
    silentPrintTimeSeconds?: number | null;
    filamentLengthMicrons?: number | null;
    filamentVolumeMm3?: number | null;
    filamentWeightMg?: number | null;
    layerCount?: number | null;
    maxLayerZMicrons?: number | null;
    filamentType?: string | null;
    printerModel?: string | null;
    nozzleDiameterMicrons?: number | null;
    layerHeightMicrons?: number | null;
    metricSourcesJson?: string | null;
    metricValidationJson?: string | null;
    missingFieldsJson?: string | null;
    warningsJson?: string | null;
  },
) {
  const nowMs = normalizeNonNegativeInteger(input.nowMs ?? Date.now(), "now_ms");
  const workerId = normalizeRequiredText(input.workerId, "worker_id");
  const lockOwner = normalizeRequiredText(input.lockOwner, "lock_owner");
  const finalStatus = input.parseStatus === "parsed" && (input.metricsStatus === "ok" || input.metricsStatus === "valid") && input.parserQuoteReady ? "completed" : "partial";
  const parseCacheKeySha256 = computeParseCacheKey({
    gcodeSha256: input.gcodeSha256,
    parserVersion: input.actualParserVersion,
  });
  const timestamp = timestampText();

  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare(
      `UPDATE slicing_jobs
       SET status = ?,
           actual_parser_version = ?,
           parse_cache_key_version = ?,
           parse_cache_key_sha256 = ?,
           parse_status = ?,
           metrics_status = ?,
           parser_quote_ready = ?,
           print_time_seconds = ?,
           silent_print_time_seconds = ?,
           filament_length_microns = ?,
           filament_volume_mm3 = ?,
           filament_weight_mg = ?,
           layer_count = ?,
           max_layer_z_microns = ?,
           filament_type = ?,
           printer_model = ?,
           nozzle_diameter_microns = ?,
           layer_height_microns = ?,
           metric_sources_json = ?,
           metric_validation_json = ?,
           missing_fields_json = ?,
           warnings_json = ?,
           finished_at_ms = ?,
           lock_owner = NULL,
           locked_at_ms = NULL,
           lock_expires_at_ms = NULL,
           lease_expires_at_ms = NULL,
           updated_at = ?
       WHERE id = ?
         AND worker_id = ?
         AND lock_owner = ?
         AND status = 'parsing'`,
    ).run(
      finalStatus,
      normalizeRequiredText(input.actualParserVersion, "actual_parser_version"),
      PARSE_CACHE_KEY_VERSION,
      parseCacheKeySha256,
      input.parseStatus,
      input.metricsStatus,
      input.parserQuoteReady ? 1 : 0,
      input.printTimeSeconds ?? null,
      input.silentPrintTimeSeconds ?? null,
      input.filamentLengthMicrons ?? null,
      input.filamentVolumeMm3 ?? null,
      input.filamentWeightMg ?? null,
      input.layerCount ?? null,
      input.maxLayerZMicrons ?? null,
      input.filamentType ?? null,
      input.printerModel ?? null,
      input.nozzleDiameterMicrons ?? null,
      input.layerHeightMicrons ?? null,
      input.metricSourcesJson ?? null,
      input.metricValidationJson ?? null,
      input.missingFieldsJson ?? null,
      input.warningsJson ?? null,
      nowMs,
      timestamp,
      input.id,
      workerId,
      lockOwner,
    );

    if (result.changes !== 1) {
      db.exec("ROLLBACK");
      return null;
    }

    const attemptResult = finishAttempt(db, {
      id: input.id,
      workerId,
      lockOwner,
      status: finalStatus,
      finishedAtMs: nowMs,
      timestamp,
    });

    if (attemptResult !== 1) {
      db.exec("ROLLBACK");
      return null;
    }

    db.exec("COMMIT");
    return getSlicingJobById(db, input.id);
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}

export function failSlicingJob(
  db: DatabaseSync,
  input: ActiveTransitionInput & {
    errorCode: string;
    errorMessage: string;
  },
) {
  const nowMs = normalizeNonNegativeInteger(input.nowMs ?? Date.now(), "now_ms");
  const workerId = normalizeRequiredText(input.workerId, "worker_id");
  const lockOwner = normalizeRequiredText(input.lockOwner, "lock_owner");
  const timestamp = timestampText();

  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare(
      `UPDATE slicing_jobs
       SET status = 'failed',
           failed_at_ms = ?,
           last_error_code = ?,
           last_error = ?,
           lock_owner = NULL,
           locked_at_ms = NULL,
           lock_expires_at_ms = NULL,
           lease_expires_at_ms = NULL,
           updated_at = ?
       WHERE id = ?
         AND worker_id = ?
         AND lock_owner = ?
         AND status IN ('locked', 'slicing', 'sliced', 'parsing', 'failed')
         AND status NOT IN ('completed', 'partial', 'cancelled')`,
    ).run(
      nowMs,
      normalizeRequiredText(input.errorCode, "error_code"),
      sanitizeError(input.errorMessage),
      timestamp,
      input.id,
      workerId,
      lockOwner,
    );

    if (result.changes !== 1) {
      db.exec("ROLLBACK");
      return null;
    }

    const attemptResult = finishAttempt(db, {
      id: input.id,
      workerId,
      lockOwner,
      status: "failed",
      finishedAtMs: nowMs,
      timestamp,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });

    if (attemptResult !== 1) {
      db.exec("ROLLBACK");
      return null;
    }

    db.exec("COMMIT");
    return getSlicingJobById(db, input.id);
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}

export function createMetricsCacheReuseJob(
  db: DatabaseSync,
  input: {
    sourceSlicingJobId: number;
    fileSyncJobId: number;
    fileId: number;
    nowMs?: number;
  },
) {
  const source = getSlicingJobById(db, input.sourceSlicingJobId);
  if (!["completed", "partial"].includes(source.status)) {
    throw new Error("source slicing job is not reusable");
  }

  const syncJob = getVerifiedSyncJob(db, input.fileSyncJobId, input.fileId);
  const nowMs = normalizeNonNegativeInteger(input.nowMs ?? Date.now(), "now_ms");
  const timestamp = timestampText();

  const result = db.prepare(
    `INSERT INTO slicing_jobs (
      file_id,
      file_sync_job_id,
      source_slicing_job_id,
      customer_id_snapshot,
      order_id_snapshot,
      order_no_snapshot,
      input_worker_id,
      status,
      attempt_count,
      max_attempts,
      slicer_name,
      required_slicer_package_version,
      actual_slicer_package_version,
      profile_key,
      profile_version,
      profile_sha256,
      slice_params_json,
      slice_params_sha256,
      slice_cache_key_sha256,
      input_filename,
      input_relative_path,
      input_size_bytes,
      input_sha256,
      result_origin,
      cache_reused_at_ms,
      required_parser_version,
      actual_parser_version,
      parse_cache_key_version,
      parse_cache_key_sha256,
      parse_status,
      metrics_status,
      parser_quote_ready,
      print_time_seconds,
      silent_print_time_seconds,
      filament_length_microns,
      filament_volume_mm3,
      filament_weight_mg,
      layer_count,
      max_layer_z_microns,
      filament_type,
      printer_model,
      nozzle_diameter_microns,
      layer_height_microns,
      metric_sources_json,
      metric_validation_json,
      missing_fields_json,
      warnings_json,
      created_at,
      updated_at
    )
    SELECT
      ?,
      ?,
      id,
      ?,
      ?,
      ?,
      ?,
      status,
      0,
      max_attempts,
      slicer_name,
      required_slicer_package_version,
      actual_slicer_package_version,
      profile_key,
      profile_version,
      profile_sha256,
      slice_params_json,
      slice_params_sha256,
      slice_cache_key_sha256,
      ?,
      ?,
      ?,
      ?,
      'metrics_cache',
      ?,
      required_parser_version,
      actual_parser_version,
      parse_cache_key_version,
      parse_cache_key_sha256,
      parse_status,
      metrics_status,
      parser_quote_ready,
      print_time_seconds,
      silent_print_time_seconds,
      filament_length_microns,
      filament_volume_mm3,
      filament_weight_mg,
      layer_count,
      max_layer_z_microns,
      filament_type,
      printer_model,
      nozzle_diameter_microns,
      layer_height_microns,
      metric_sources_json,
      metric_validation_json,
      missing_fields_json,
      warnings_json,
      ?,
      ?
    FROM slicing_jobs
    WHERE id = ?`,
  ).run(
    syncJob.fileId,
    syncJob.id,
    syncJob.customerId,
    syncJob.orderId,
    syncJob.orderNo,
    syncJob.workerId,
    syncJob.storedFilename,
    normalizeWorkerInputRelativePath(syncJob.relativePath),
    syncJob.fileSizeBytes,
    syncJob.localSha256,
    nowMs,
    timestamp,
    timestamp,
    source.id,
  );

  return getSlicingJobById(db, Number(result.lastInsertRowid));
}

export function reconcileExpiredSlicingJobs(db: DatabaseSync, workerId: string, nowMs = Date.now()) {
  const normalizedWorkerId = normalizeRequiredText(workerId, "worker_id");
  const normalizedNowMs = normalizeNonNegativeInteger(nowMs, "now_ms");
  const timestamp = timestampText();
  db.exec("BEGIN IMMEDIATE");
  try {
    const rows = db
      .prepare(
        `${slicingJobSelectSql()}
         WHERE input_worker_id = ?
           AND status IN ('locked', 'slicing', 'sliced', 'parsing')
           AND lease_expires_at_ms IS NOT NULL
           AND lease_expires_at_ms <= ?`,
      )
      .all(normalizedWorkerId, normalizedNowMs)
      .map(normalizeSlicingJobRecord) as SlicingJobRecord[];

    for (const job of rows) {
      reconcileExpiredSlicingJobRecordInTransaction(db, job, normalizedNowMs, timestamp);
    }

    db.exec("COMMIT");
    return rows.length;
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}

export function reconcileExpiredSlicingJob(db: DatabaseSync, id: number, workerId: string, nowMs = Date.now()) {
  const normalizedWorkerId = normalizeRequiredText(workerId, "worker_id");
  const normalizedNowMs = normalizeNonNegativeInteger(nowMs, "now_ms");
  const timestamp = timestampText();
  db.exec("BEGIN IMMEDIATE");
  try {
    const changed = reconcileExpiredSlicingJobInTransaction(db, id, normalizedWorkerId, normalizedNowMs, timestamp);
    db.exec("COMMIT");
    return changed;
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}

export function failSlicingJobValidation(
  db: DatabaseSync,
  input: ActiveTransitionInput & {
    errorCode: WorkerErrorCode;
    errorMessage: string;
  },
) {
  const policy = getWorkerErrorPolicy(input.errorCode);
  if (!policy || policy.retryable || policy.source !== "server") {
    throw new Error("invalid validation failure error code");
  }
  return failSlicingJob(db, input);
}

export function getSlicingJobById(db: DatabaseSync, id: number): SlicingJobRecord {
  const job = db.prepare(`${slicingJobSelectSql()} WHERE id = ?`).get(id);
  if (!job) throw new Error("slicing job not found");
  return normalizeSlicingJobRecord(job);
}

export function getSlicingJobAttemptByLockOwner(db: DatabaseSync, lockOwner: string): SlicingJobAttemptRecord {
  const attempt = db
    .prepare(
      `SELECT
        id,
        slicing_job_id AS slicingJobId,
        attempt_no AS attemptNo,
        worker_id AS workerId,
        lock_owner AS lockOwner,
        status,
        lease_expires_at_ms AS leaseExpiresAtMs,
        lease_renewed_at_ms AS leaseRenewedAtMs
       FROM slicing_job_attempts
       WHERE lock_owner = ?`,
    )
    .get(lockOwner);
  if (!attempt) throw new Error("slicing job attempt not found");
  return attempt as SlicingJobAttemptRecord;
}

export function createLockOwner() {
  return randomUUID();
}

type ActiveTransitionInput = {
  id: number;
  workerId: string;
  lockOwner: string;
  nowMs?: number;
};

type TransitionOptions = {
  fromStatus: SlicingJobStatus;
  toStatus: SlicingJobStatus;
  mainAssignments: string;
  mainValues: SQLInputValue[];
  attemptAssignments: string;
  attemptValues: SQLInputValue[];
};

function transitionActiveJob(db: DatabaseSync, input: ActiveTransitionInput, options: TransitionOptions) {
  const workerId = normalizeRequiredText(input.workerId, "worker_id");
  const lockOwner = normalizeRequiredText(input.lockOwner, "lock_owner");
  const timestamp = timestampText();
  const mainAssignmentSql = options.mainAssignments ? `, ${options.mainAssignments}` : "";

  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare(
      `UPDATE slicing_jobs
       SET status = ?${mainAssignmentSql},
           updated_at = ?
       WHERE id = ?
         AND worker_id = ?
         AND lock_owner = ?
         AND status = ?`,
    ).run(
      options.toStatus,
      ...options.mainValues,
      timestamp,
      input.id,
      workerId,
      lockOwner,
      options.fromStatus,
    );

    if (result.changes !== 1) {
      db.exec("ROLLBACK");
      return null;
    }

    const attemptResult = db.prepare(
      `UPDATE slicing_job_attempts
       SET ${options.attemptAssignments},
           updated_at = ?
       WHERE slicing_job_id = ?
         AND worker_id = ?
         AND lock_owner = ?
         AND status = ?`,
    ).run(...options.attemptValues, timestamp, input.id, workerId, lockOwner, options.fromStatus);

    if (attemptResult.changes !== 1) {
      db.exec("ROLLBACK");
      return null;
    }

    db.exec("COMMIT");
    return getSlicingJobById(db, input.id);
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}

function finishAttempt(
  db: DatabaseSync,
  input: {
    id: number;
    workerId: string;
    lockOwner: string;
    status: "completed" | "partial" | "failed";
    finishedAtMs: number;
    timestamp: string;
    errorCode?: string;
    errorMessage?: string;
  },
) {
  const assignments = [
    "status = ?",
    "finished_at_ms = ?",
    "error_code = COALESCE(?, error_code)",
    "error_message = COALESCE(?, error_message)",
    "updated_at = ?",
  ].join(", ");

  const result = db.prepare(
    `UPDATE slicing_job_attempts
     SET ${assignments}
     WHERE slicing_job_id = ?
       AND worker_id = ?
       AND lock_owner = ?
       AND status IN ('locked', 'slicing', 'sliced', 'parsing')`,
  ).run(
    input.status,
    input.finishedAtMs,
    input.errorCode || null,
    input.errorMessage ? sanitizeError(input.errorMessage) : null,
    input.timestamp,
    input.id,
    input.workerId,
    input.lockOwner,
  );

  return result.changes;
}

function getAttemptCount(db: DatabaseSync, id: number) {
  const record = db.prepare("SELECT attempt_count AS attemptCount FROM slicing_jobs WHERE id = ?").get(id) as
    | { attemptCount: number }
    | undefined;
  if (!record) throw new Error("slicing job not found after claim");
  return Number(record.attemptCount);
}

function reconcileExpiredSlicingJobInTransaction(
  db: DatabaseSync,
  id: number,
  workerId: string,
  nowMs: number,
  timestamp: string,
) {
  const job = db
    .prepare(
      `${slicingJobSelectSql()}
       WHERE id = ?
         AND input_worker_id = ?
         AND status IN ('locked', 'slicing', 'sliced', 'parsing')
         AND lease_expires_at_ms IS NOT NULL
         AND lease_expires_at_ms <= ?`,
    )
    .get(id, workerId, nowMs);

  if (!job) return false;
  return reconcileExpiredSlicingJobRecordInTransaction(db, normalizeSlicingJobRecord(job), nowMs, timestamp);
}

function reconcileExpiredSlicingJobRecordInTransaction(
  db: DatabaseSync,
  job: SlicingJobRecord,
  nowMs: number,
  timestamp: string,
) {
  const errorCode = leaseExpiredErrorCode(job.status);
  if (!errorCode) return false;

  const result = db
    .prepare(
      `UPDATE slicing_jobs
       SET status = 'failed',
           failed_at_ms = ?,
           last_error_code = ?,
           last_error = ?,
           lock_owner = NULL,
           locked_at_ms = NULL,
           lock_expires_at_ms = NULL,
           lease_expires_at_ms = NULL,
           updated_at = ?
       WHERE id = ?
         AND status = ?
         AND lease_expires_at_ms IS NOT NULL
         AND lease_expires_at_ms <= ?`,
    )
    .run(nowMs, errorCode, getWorkerErrorPolicy(errorCode)?.publicMessage || errorCode, timestamp, job.id, job.status, nowMs);

  if (result.changes !== 1) return false;

  db.prepare(
    `UPDATE slicing_job_attempts
     SET status = 'expired',
         finished_at_ms = ?,
         error_code = ?,
         error_message = ?,
         updated_at = ?
     WHERE slicing_job_id = ?
       AND worker_id = ?
       AND lock_owner = ?
       AND status = ?`,
  ).run(
    nowMs,
    errorCode,
    getWorkerErrorPolicy(errorCode)?.publicMessage || errorCode,
    timestamp,
    job.id,
    job.workerId || job.inputWorkerId,
    job.lockOwner || "",
    job.status,
  );

  return true;
}

function leaseExpiredErrorCode(status: SlicingJobStatus): WorkerErrorCode | null {
  if (status === "locked") return "WORKER_LEASE_EXPIRED_LOCKED";
  if (status === "slicing") return "WORKER_LEASE_EXPIRED_SLICING";
  if (status === "sliced") return "WORKER_LEASE_EXPIRED_SLICED";
  if (status === "parsing") return "WORKER_LEASE_EXPIRED_PARSING";
  return null;
}

function getVerifiedSyncJob(db: DatabaseSync, fileSyncJobId: number, fileId: number) {
  const job = db
    .prepare(
      `SELECT
        id,
        file_id AS fileId,
        order_id AS orderId,
        customer_id AS customerId,
        order_no AS orderNo,
        stored_filename AS storedFilename,
        relative_path AS relativePath,
        file_size_bytes AS fileSizeBytes,
        sync_status AS syncStatus,
        worker_id AS workerId,
        local_path AS localPath,
        local_sha256 AS localSha256
       FROM local_file_sync_jobs
       WHERE id = ?`,
    )
    .get(fileSyncJobId) as
    | {
        id: number;
        fileId: number;
        orderId: number;
        customerId: number | null;
        orderNo: string;
        storedFilename: string;
        relativePath: string;
        fileSizeBytes: number;
        syncStatus: string;
        workerId: string | null;
        localPath: string | null;
        localSha256: string | null;
      }
    | undefined;

  if (!job) throw new Error("local file sync job not found");
  if (Number(job.fileId) !== Number(fileId)) throw new Error("file_id does not match sync job");
  if (job.syncStatus !== "verified") throw new Error("local file sync job is not verified");
  if (!job.workerId) throw new Error("verified sync job is missing worker_id");
  if (!job.localPath) throw new Error("verified sync job is missing local_path");
  if (!job.localSha256) throw new Error("verified sync job is missing local_sha256");

  return {
    ...job,
    relativePath: normalizeWorkerInputRelativePathFromSyncJob(job),
    localSha256: normalizeSha256(job.localSha256, "local_sha256"),
    workerId: normalizeRequiredText(job.workerId, "worker_id"),
  };
}

function slicingJobSelectSql() {
  return `SELECT
    id,
    file_id AS fileId,
    file_sync_job_id AS fileSyncJobId,
    source_slicing_job_id AS sourceSlicingJobId,
    order_no_snapshot AS orderNoSnapshot,
    input_worker_id AS inputWorkerId,
    artifact_worker_id AS artifactWorkerId,
    worker_id AS workerId,
    status,
    attempt_count AS attemptCount,
    max_attempts AS maxAttempts,
    lock_owner AS lockOwner,
    locked_at_ms AS lockedAtMs,
    lock_expires_at_ms AS lockExpiresAtMs,
    lease_expires_at_ms AS leaseExpiresAtMs,
    lease_renewed_at_ms AS leaseRenewedAtMs,
    started_at_ms AS startedAtMs,
    finished_at_ms AS finishedAtMs,
    failed_at_ms AS failedAtMs,
    slicer_name AS slicerName,
    required_slicer_package_version AS requiredSlicerPackageVersion,
    actual_slicer_package_version AS actualSlicerPackageVersion,
    profile_key AS profileKey,
    profile_version AS profileVersion,
    profile_sha256 AS profileSha256,
    slice_params_json AS sliceParamsJson,
    slice_params_sha256 AS sliceParamsSha256,
    slice_cache_key_sha256 AS sliceCacheKeySha256,
    input_relative_path AS inputRelativePath,
    input_size_bytes AS inputSizeBytes,
    input_sha256 AS inputSha256,
    result_origin AS resultOrigin,
    cache_reused_at_ms AS cacheReusedAtMs,
    gcode_relative_path AS gcodeRelativePath,
    stdout_relative_path AS stdoutRelativePath,
    stderr_relative_path AS stderrRelativePath,
    gcode_size_bytes AS gcodeSizeBytes,
    gcode_sha256 AS gcodeSha256,
    slice_duration_ms AS sliceDurationMs,
    exit_code AS exitCode,
    required_parser_version AS requiredParserVersion,
    actual_parser_version AS actualParserVersion,
    parse_cache_key_sha256 AS parseCacheKeySha256,
    parse_status AS parseStatus,
    metrics_status AS metricsStatus,
    parser_quote_ready AS parserQuoteReady,
    print_time_seconds AS printTimeSeconds,
    silent_print_time_seconds AS silentPrintTimeSeconds,
    filament_length_microns AS filamentLengthMicrons,
    filament_volume_mm3 AS filamentVolumeMm3,
    filament_weight_mg AS filamentWeightMg,
    layer_count AS layerCount,
    max_layer_z_microns AS maxLayerZMicrons,
    filament_type AS filamentType,
    printer_model AS printerModel,
    nozzle_diameter_microns AS nozzleDiameterMicrons,
    layer_height_microns AS layerHeightMicrons,
    metric_sources_json AS metricSourcesJson,
    metric_validation_json AS metricValidationJson,
    missing_fields_json AS missingFieldsJson,
    warnings_json AS warningsJson,
    last_error_code AS lastErrorCode,
    last_error AS lastError
  FROM slicing_jobs`;
}

function normalizeSlicingJobRecord(job: unknown): SlicingJobRecord {
  const record = job as SlicingJobRecord & { parserQuoteReady?: number | boolean };
  return {
    ...record,
    parserQuoteReady: Boolean(record.parserQuoteReady),
  };
}

function stableJson(value: unknown, orderedKeys?: readonly string[]): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = orderedKeys || Object.keys(record).sort();
    return `{${keys
      .filter((key) => Object.prototype.hasOwnProperty.call(record, key))
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256Hex(value: string) {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

function normalizeSha256(value: string, fieldName: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${fieldName} must be a SHA-256 hex value`);
  }
  return normalized;
}

function normalizeRequiredText(value: string, fieldName: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${fieldName} is required`);
  return normalized;
}

export function isWorkerInputRelativePathSafe(value: unknown) {
  try {
    normalizeWorkerInputRelativePath(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizeWorkerInputRelativePath(value: unknown) {
  const normalized = normalizeRequiredText(String(value || ""), "input_relative_path");
  if (normalized.includes("\0")) throw new Error("input_relative_path must not contain null bytes");
  if (normalized.includes("\\")) throw new Error("input_relative_path must not contain backslashes");
  if (normalized.includes("%")) throw new Error("input_relative_path must not contain URL encoding");
  if (normalized.startsWith("/") || normalized.startsWith("//") || /^[A-Za-z]:[\\/]/.test(normalized)) {
    throw new Error("input_relative_path must be relative");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("input_relative_path contains unsafe path segments");
  }
  return normalized;
}

function normalizeWorkerInputRelativePathFromSyncJob(job: { relativePath: string; localPath: string | null }) {
  if (isWorkerInputRelativePathSafe(job.relativePath) && String(job.relativePath).startsWith("files/")) {
    return normalizeWorkerInputRelativePath(job.relativePath);
  }

  const localPath = String(job.localPath || "").trim().replace(/\\/g, "/");
  const productionRootPrefix = "/srv/make3d-worker/";
  if (localPath.startsWith(productionRootPrefix)) {
    return normalizeWorkerInputRelativePath(localPath.slice(productionRootPrefix.length));
  }

  return normalizeWorkerInputRelativePath(job.relativePath);
}

function normalizeNonNegativeInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value;
}

function sanitizeError(value: string) {
  return String(value || "worker slicing error")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/1[3-9]\d{9}/g, "[redacted-phone]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .slice(0, 500);
}

function timestampText() {
  return new Date().toISOString();
}

function rollbackQuietly(db: DatabaseSync) {
  try {
    db.exec("ROLLBACK");
  } catch {
    // Transaction may have already been closed by SQLite after a hard error.
  }
}
