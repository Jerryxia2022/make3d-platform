#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, appendFile, mkdir, readFile, realpath, rename, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { performance } from "node:perf_hooks";

import {
  PARSER_VERSION,
  parsePrusaSlicerGcode,
  sha256File,
} from "./prusaslicer-result-parser.mjs";

export const SLICING_WORKER_VERSION = "phase05-h-c";
export const DEFAULT_ROOT_DIR = "/srv/make3d-worker/test-integration/phase05-h-a";
export const DEFAULT_ENV_PATH = "/etc/make3d-slicing-worker-test.env";
export const DEFAULT_PRUSASLICER_BIN = "/usr/bin/prusa-slicer";
export const LEASE_INTERVAL_MS = 30_000;
export const LEASE_SAFETY_MARGIN_MS = 2_000;
export const MAX_LEASE_TTL_MS = 10 * 60_000;
export const PHASE05_HC_TEST_ROOT = "/srv/make3d-worker/test-integration/phase05-h-c";
export const PHASE05_HC_FINAL_TEST_ROOT = "/srv/make3d-worker/test-integration/phase05-h-c-final";

const ACTIVE_CHILDREN = new Set();
const ACTIVE_LEASE_CONTROLLERS = new Set();
let shutdownHandlersInstalled = false;
let shutdownInProgress = false;

const ALLOWED_ENV_KEYS = new Set([
  "SERVER_URL",
  "WORKER_TOKEN",
  "WORKER_ID",
  "ROOT_DIR",
  "PRUSASLICER_BIN",
  "MAKE3D_WORKER_INTEGRATION_TEST_MODE",
  "LEASE_INTERVAL_MS",
  "MAKE3D_WORKER_PARSER_DELAY_MS",
  "MAKE3D_WORKER_REQUEST_LOG_PATH",
]);

const PROFILE_WHITELIST = {
  "bambu-p1s": {
    path: "/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini",
  },
};

export function parseWorkerEnv(content) {
  const values = {};
  for (const line of String(content || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) throw new Error("invalid env line");
    const key = trimmed.slice(0, separator).trim();
    if (!ALLOWED_ENV_KEYS.has(key)) throw new Error(`disallowed env key: ${key}`);
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export async function loadSlicingWorkerConfig(options = {}) {
  let fileEnv = {};
  const envPath = options.envPath || DEFAULT_ENV_PATH;
  try {
    fileEnv = parseWorkerEnv(await readFile(envPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const merged = {
    ...fileEnv,
    SERVER_URL: process.env.SERVER_URL || fileEnv.SERVER_URL,
    WORKER_TOKEN: process.env.WORKER_TOKEN || fileEnv.WORKER_TOKEN,
    WORKER_ID: process.env.WORKER_ID || fileEnv.WORKER_ID,
    ROOT_DIR: process.env.ROOT_DIR || fileEnv.ROOT_DIR,
    PRUSASLICER_BIN: process.env.PRUSASLICER_BIN || fileEnv.PRUSASLICER_BIN,
    MAKE3D_WORKER_INTEGRATION_TEST_MODE: process.env.MAKE3D_WORKER_INTEGRATION_TEST_MODE || fileEnv.MAKE3D_WORKER_INTEGRATION_TEST_MODE,
    LEASE_INTERVAL_MS: process.env.LEASE_INTERVAL_MS || fileEnv.LEASE_INTERVAL_MS,
    MAKE3D_WORKER_PARSER_DELAY_MS: process.env.MAKE3D_WORKER_PARSER_DELAY_MS || fileEnv.MAKE3D_WORKER_PARSER_DELAY_MS,
    MAKE3D_WORKER_REQUEST_LOG_PATH: process.env.MAKE3D_WORKER_REQUEST_LOG_PATH || fileEnv.MAKE3D_WORKER_REQUEST_LOG_PATH,
  };

  const serverUrl = normalizeServerUrl(merged.SERVER_URL);
  const workerToken = String(merged.WORKER_TOKEN || "").trim();
  if (!serverUrl) throw new Error("SERVER_URL is required");
  if (!workerToken || workerToken === "replace-with-test-token") throw new Error("WORKER_TOKEN is required");

  const config = {
    serverUrl,
    workerToken,
    workerId: sanitizeWorkerId(merged.WORKER_ID || "wsl-worker-01"),
    rootDir: resolve(String(merged.ROOT_DIR || options.rootDir || DEFAULT_ROOT_DIR)),
    prusaSlicerBin: String(merged.PRUSASLICER_BIN || options.prusaSlicerBin || DEFAULT_PRUSASLICER_BIN),
    integrationTestMode: merged.MAKE3D_WORKER_INTEGRATION_TEST_MODE === "1",
    leaseIntervalMs: normalizeLeaseInterval(merged.LEASE_INTERVAL_MS || options.leaseIntervalMs || LEASE_INTERVAL_MS),
    parserDelayMs: normalizeParserDelay(merged.MAKE3D_WORKER_PARSER_DELAY_MS || options.parserDelayMs || 0, {
      integrationTestMode: merged.MAKE3D_WORKER_INTEGRATION_TEST_MODE === "1",
      serverUrl,
    }),
    requestLogPath: normalizeRequestLogPath(merged.MAKE3D_WORKER_REQUEST_LOG_PATH || options.requestLogPath || "", {
      integrationTestMode: merged.MAKE3D_WORKER_INTEGRATION_TEST_MODE === "1",
      serverUrl,
    }),
    fetchImpl: options.fetchImpl || fetch,
    execFileImpl: options.execFileImpl || execFile,
    spawnImpl: options.spawnImpl || spawn,
  };
  await validateSlicerBinary(config);
  return config;
}

export async function runOnce(config) {
  await ensureIntegrationDirectories(config.rootDir);
  const pending = await apiRequest(config, "/api/worker/slicing/jobs/pending");
  const job = selectPendingJob(pending);
  if (!job) return { exitCode: 0, status: "no-task" };

  let lock = null;
  let heartbeat = null;
  try {
    lock = await lockJob(config, job.job_id);
    const context = { job, lock, currentStage: "locked" };
    heartbeat = startLeaseHeartbeat(config, context, config.leaseIntervalMs || LEASE_INTERVAL_MS);
    const input = await verifyLocalInput(config, job);
    assertLeaseOwnership(heartbeat);
    const profile = await verifyProfile(job, config.profileWhitelist);
    assertLeaseOwnership(heartbeat);
    const actualSlicerPackageVersion = await getPrusaSlicerPackageVersion(config);
    validateRequiredVersions(job, actualSlicerPackageVersion, PARSER_VERSION);
    assertLeaseOwnership(heartbeat);

    let sliceResult;
    const resumedFrom = lock.resume_from || job.resume_from || null;
    if (resumedFrom === "sliced" || resumedFrom === "parsing") {
      sliceResult = await verifyExistingGcodeArtifact(config, job, lock, actualSlicerPackageVersion);
    } else {
      await postSlicing(config, context, {
        actualSlicerPackageVersion,
        inputSha256: input.sha256,
        profileSha256: profile.sha256,
      });
      context.currentStage = "slicing";

      sliceResult = await runPrusaSlicer(config, context, input, profile, actualSlicerPackageVersion, heartbeat);
      assertLeaseOwnership(heartbeat);

      await postSliced(config, context, actualSlicerPackageVersion, sliceResult);
      context.currentStage = "sliced";
      assertLeaseOwnership(heartbeat);
    }

    await postParsing(config, context, sliceResult.gcodeSha256);
    context.currentStage = "parsing";
    assertLeaseOwnership(heartbeat);

    await delayForIntegrationParser(config, heartbeat);
    const parsed = await parsePrusaSlicerGcode(sliceResult.gcodePath, {
      allowedRoots: [resolve(config.rootDir, "results")],
      parserVersion: job.required_parser_version,
      sliceParams: job.slice_params,
      input: {
        file_id: job.file_id,
        filename: job.input_filename || "synthetic-test.stl",
        path: input.path,
        sha256: input.sha256,
        size_bytes: input.sizeBytes,
      },
      slicer: {
        name: "PrusaSlicer",
        package_version: actualSlicerPackageVersion,
        binary_path: DEFAULT_PRUSASLICER_BIN,
        profile_path: profile.profileKey,
        profile_sha256: profile.sha256,
      },
      slice: {
        started_at: sliceResult.startedAt,
        finished_at: sliceResult.finishedAt,
        duration_ms: sliceResult.durationMs,
        exit_code: sliceResult.exitCode,
      },
    });
    assertLeaseOwnership(heartbeat);

    const result = await postResult(config, context, parsed);
    stopLeaseHeartbeat(heartbeat);
    heartbeat = null;
    return {
      exitCode: 0,
      status: result.status,
      jobId: job.job_id,
      attemptNo: lock.attempt_no,
      lockedAtMs: lock.locked_at_ms,
      lockExpiresAtMs: lock.lock_expires_at_ms,
      leaseRenewedAtMs: lock.lease_renewed_at_ms,
      initialLeaseExpiresAtMs: lock.lease_expires_at_ms,
      initialLeaseDeltaMs:
        Number.isFinite(lock.lease_expires_at_ms) && Number.isFinite(lock.lease_renewed_at_ms)
          ? lock.lease_expires_at_ms - lock.lease_renewed_at_ms
          : null,
      initialLockDeltaMs:
        Number.isFinite(lock.lock_expires_at_ms) && Number.isFinite(lock.locked_at_ms)
          ? lock.lock_expires_at_ms - lock.locked_at_ms
          : null,
      resumedFrom,
      gcodeSizeBytes: sliceResult.gcodeSizeBytes,
      gcodeSha256: sliceResult.gcodeSha256,
      prusaSlicerRan: !resumedFrom,
      parserQuoteReady: result.parser_quote_ready,
    };
  } catch (error) {
    if (heartbeat?.ownershipLost || shutdownInProgress) {
      stopLeaseHeartbeat(heartbeat);
      return { exitCode: 0, status: "ownership-lost", jobId: job?.job_id, error: sanitizeError(error?.message || String(error)) };
    }
    if (lock && job) {
      await postFailed(config, { job, lock }, mapWorkerError(error), sanitizeError(error?.message || String(error)));
    }
    stopLeaseHeartbeat(heartbeat);
    return { exitCode: isRetryableWorkerError(error) ? 0 : 1, status: "failed", jobId: job?.job_id, error: sanitizeError(error?.message || String(error)) };
  }
}

export function selectPendingJob(pendingPayload) {
  const jobs = Array.isArray(pendingPayload?.jobs) ? pendingPayload.jobs : [];
  return jobs[0] || null;
}

export async function lockJob(config, jobId, monotonic = performance) {
  const requestStartedMonotonicMs = monotonic.now();
  const lock = await apiRequest(config, `/api/worker/slicing/jobs/${encodeURIComponent(jobId)}/lock`, { method: "POST", rawBody: "" });
  return {
    ...lock,
    request_started_monotonic_ms: requestStartedMonotonicMs,
  };
}

export async function postSlicing(config, context, input) {
  return apiRequest(config, `/api/worker/slicing/jobs/${context.job.job_id}/slicing`, {
    method: "POST",
    body: {
      lock_owner: context.lock.lock_owner,
      actual_slicer_package_version: input.actualSlicerPackageVersion,
      actual_parser_version: context.job.required_parser_version,
      input_sha256: input.inputSha256,
      profile_sha256: input.profileSha256,
      slice_params_sha256: computeStableSha256(context.job.slice_params),
    },
  });
}

export async function postSliced(config, context, actualSlicerPackageVersion, sliceResult) {
  return apiRequest(config, `/api/worker/slicing/jobs/${context.job.job_id}/sliced`, {
    method: "POST",
    body: {
      lock_owner: context.lock.lock_owner,
      actual_slicer_package_version: actualSlicerPackageVersion,
      slicer_banner_version: sliceResult.slicerBannerVersion,
      slice_duration_ms: sliceResult.durationMs,
      exit_code: 0,
      gcode_relative_path: sliceResult.apiPaths.gcode,
      gcode_size_bytes: sliceResult.gcodeSizeBytes,
      gcode_sha256: sliceResult.gcodeSha256,
      stdout_relative_path: sliceResult.apiPaths.stdout,
      stderr_relative_path: sliceResult.apiPaths.stderr,
    },
  });
}

export async function postParsing(config, context, gcodeSha256) {
  return apiRequest(config, `/api/worker/slicing/jobs/${context.job.job_id}/parsing`, {
    method: "POST",
    body: {
      lock_owner: context.lock.lock_owner,
      actual_parser_version: context.job.required_parser_version,
      gcode_sha256: gcodeSha256,
    },
  });
}

export async function postResult(config, context, parsed) {
  return apiRequest(config, `/api/worker/slicing/jobs/${context.job.job_id}/result`, {
    method: "POST",
    body: buildResultPayload(context.lock.lock_owner, context.job, parsed),
  });
}

export async function postFailed(config, context, errorCode, errorMessage) {
  const stage = normalizeFailureStage(context.currentStage || context.job.status || "locked");
  return apiRequest(config, `/api/worker/slicing/jobs/${context.job.job_id}/failed`, {
    method: "POST",
    body: {
      lock_owner: context.lock.lock_owner,
      stage,
      error_code: errorCode,
      error_message: sanitizeError(errorMessage),
    },
  });
}

export function buildResultPayload(lockOwner, job, parsed) {
  return {
    lock_owner: lockOwner,
    gcode_sha256: parsed.result.gcode_sha256,
    parse_cache_key_version: "1.0",
    parse_cache_key_sha256: computeParseCacheKey(parsed.result.gcode_sha256, job.required_parser_version),
    parse_status: parsed.parse.status,
    metrics_status: parsed.validation.metrics_status,
    parser_quote_ready: parsed.validation.quote_ready,
    metrics: pickParserMetrics(parsed.result),
    metric_sources: pickParserMetricSources(parsed.metric_sources),
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

function pickParserMetrics(result) {
  return Object.fromEntries(RESULT_METRIC_KEYS.map((key) => [key, result[key] ?? null]));
}

function pickParserMetricSources(sources) {
  return Object.fromEntries(RESULT_SOURCE_KEYS.map((key) => [key, sources[key] || "missing"]));
}

export async function verifyLocalInput(config, job) {
  const sourcePath = mapInputPath(config.rootDir, job, {
    integrationTestMode: config.integrationTestMode,
    serverUrl: config.serverUrl,
  });
  try {
    await access(sourcePath);
  } catch {
    throwWorkerIo("input file is missing");
  }
  const info = await stat(sourcePath);
  if (!info.isFile()) throwWorkerIo("input is not a file");
  if (info.size <= 0) throwWorkerIo("input file is empty");
  const expectedSize = Number(job.input_size_bytes);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) throwWorkerIo("input_size_bytes is invalid");
  if (info.size !== expectedSize) throwWorkerIo("input file size mismatch");
  const sha256 = await sha256File(sourcePath);
  if (sha256 !== String(job.input_sha256 || "").toLowerCase()) throwWorkerIo("input SHA mismatch");
  return { path: sourcePath, sizeBytes: info.size, sha256 };
}

export async function verifyProfile(job, whitelist = PROFILE_WHITELIST) {
  const profile = whitelist[job.profile_key];
  if (!profile) throw new Error("profile key is not whitelisted");
  const profilePath = await safeRealpath(profile.path);
  const sha256 = await sha256File(profilePath);
  if (sha256 !== String(job.profile_sha256 || "").toLowerCase()) throw new Error("profile SHA mismatch");
  return { profileKey: job.profile_key, path: profilePath, sha256 };
}

export async function runPrusaSlicer(config, context, input, profile, actualSlicerPackageVersion, leaseController = null) {
  await validateSlicerBinary(config);
  await mkdir(resolve(config.rootDir, "processing"), { recursive: true, mode: 0o750 });
  await mkdir(resolve(config.rootDir, "results"), { recursive: true, mode: 0o750 });
  await assertAtomicPublishFilesystem(config.rootDir, config.statImpl || stat);
  const paths = resolveArtifactPaths(config.rootDir, context.job.job_id, context.lock.attempt_no);
  await mkdir(dirname(paths.processingGcodePartPath), { recursive: true });
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const args = buildPrusaSlicerArgs(context.job.slice_params, profile.path, paths.processingGcodePartPath, input.path);
  const result = await spawnPrusaSlicer(config, args, paths.processingStdoutPartPath, paths.processingStderrPartPath, leaseController);
  const finished = Date.now();
  const finishedAt = new Date(finished).toISOString();
  assertLeaseOwnership(leaseController);

  if (result.exitCode !== 0) {
    const message = result.exitCode === 75 && config.globalSliceLockPath
      ? "Another local slicing operation is already running."
      : `PrusaSlicer exited with code ${result.exitCode}`;
    const error = new Error(message);
    error.workerErrorCode = "SLICER_NON_ZERO_EXIT";
    throw error;
  }

  const partInfo = await stat(paths.processingGcodePartPath);
  if (!partInfo.isFile()) throw new Error("G-code output missing");
  if (partInfo.size <= 0) {
    const error = new Error("G-code output empty");
    error.workerErrorCode = "SLICER_OUTPUT_EMPTY";
    throw error;
  }
  const partSha256 = await sha256File(paths.processingGcodePartPath);
  assertLeaseOwnership(leaseController);
  await mkdir(dirname(paths.gcodePath), { recursive: true });
  await rename(paths.processingGcodePartPath, paths.gcodePath);
  await rename(paths.processingStdoutPartPath, paths.stdoutPath);
  await rename(paths.processingStderrPartPath, paths.stderrPath);
  assertLeaseOwnership(leaseController);

  const gcodeInfo = await stat(paths.gcodePath);
  if (!gcodeInfo.isFile()) throw new Error("G-code output missing");
  if (gcodeInfo.size <= 0) {
    const error = new Error("G-code output empty");
    error.workerErrorCode = "SLICER_OUTPUT_EMPTY";
    throw error;
  }
  const gcodeSha256 = await sha256File(paths.gcodePath);
  if (gcodeInfo.size !== partInfo.size || gcodeSha256 !== partSha256) {
    const error = new Error("G-code output changed after publish");
    error.workerErrorCode = "SLICER_GCODE_SHA_MISMATCH";
    throw error;
  }
  return {
    ...paths,
    args,
    actualSlicerPackageVersion,
    slicerBannerVersion: `PrusaSlicer-${actualSlicerPackageVersion}`,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finished - started),
    exitCode: result.exitCode,
    gcodeSizeBytes: gcodeInfo.size,
    gcodeSha256,
  };
}

export async function verifyExistingGcodeArtifact(config, job, lock, actualSlicerPackageVersion) {
  const relativePath = lock.gcode_relative_path || job.gcode_relative_path;
  const expectedSize = lock.gcode_size_bytes ?? job.gcode_size_bytes;
  const expectedSha = lock.gcode_sha256 || job.gcode_sha256;
  if (!relativePath || !expectedSize || !expectedSha) {
    const error = new Error("resume artifact metadata missing");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }

  const gcodePath = assertInsideRoot(config.rootDir, join(config.rootDir, String(relativePath)));
  assertResumeArtifactPath(job.job_id, relativePath);
  let info;
  try {
    info = await stat(gcodePath);
  } catch {
    const error = new Error("resume G-code output missing");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }
  if (!info.isFile()) {
    const error = new Error("resume G-code path is not a file");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }
  if (info.size !== Number(expectedSize)) {
    const error = new Error("resume G-code size mismatch");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }
  const gcodeSha256 = await sha256File(gcodePath);
  if (gcodeSha256 !== String(expectedSha).toLowerCase()) {
    const error = new Error("resume G-code SHA mismatch");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }

  return {
    apiPaths: {
      gcode: String(relativePath),
      stdout: lock.stdout_relative_path || job.stdout_relative_path || null,
      stderr: lock.stderr_relative_path || job.stderr_relative_path || null,
    },
    gcodePath,
    stdoutPath: lock.stdout_relative_path ? assertInsideRoot(config.rootDir, join(config.rootDir, String(lock.stdout_relative_path))) : null,
    stderrPath: lock.stderr_relative_path ? assertInsideRoot(config.rootDir, join(config.rootDir, String(lock.stderr_relative_path))) : null,
    args: [],
    actualSlicerPackageVersion,
    slicerBannerVersion: `PrusaSlicer-${actualSlicerPackageVersion}`,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    exitCode: 0,
    gcodeSizeBytes: info.size,
    gcodeSha256,
  };
}

export function buildPrusaSlicerArgs(sliceParams, profilePath, outputPath, inputPath) {
  const params = validateSliceParams(sliceParams);
  return [
    "--export-gcode",
    "--load",
    profilePath,
    "--output",
    outputPath,
    "--filament-type",
    params.material,
    "--layer-height",
    String(params.layer_height_microns / 1000),
    "--fill-density",
    `${params.fill_density_percent}%`,
    inputPath,
  ];
}

export function validateSliceParams(sliceParams) {
  const params = sliceParams && typeof sliceParams === "object" ? sliceParams : {};
  const material = requireOneOf(params.material, ["PLA"], "material");
  return {
    material,
    printer_model: requireOneOf(params.printer_model, ["Bambu Lab P1S"], "printer_model"),
    nozzle_diameter_microns: requireIntegerRange(params.nozzle_diameter_microns, 400, 400, "nozzle_diameter_microns"),
    layer_height_microns: requireIntegerRange(params.layer_height_microns, 50, 400, "layer_height_microns"),
    fill_density_percent: requireIntegerRange(params.fill_density_percent, 0, 100, "fill_density_percent"),
    support_mode: requireOneOf(params.support_mode, ["none", "build_plate", "everywhere"], "support_mode"),
    brim_width_microns: requireIntegerRange(params.brim_width_microns, 0, 20_000, "brim_width_microns"),
  };
}

export function resolveArtifactPaths(rootDir, jobId, attemptNo) {
  const normalizedJobId = requirePositiveInteger(jobId, "job_id");
  const normalizedAttemptNo = requirePositiveInteger(attemptNo, "attempt_no");
  const processingApiBase = `processing/prusaslicer/${normalizedJobId}/attempt-${normalizedAttemptNo}`;
  const resultApiBase = `results/prusaslicer/${normalizedJobId}/attempt-${normalizedAttemptNo}`;
  const failedApiBase = `failed/prusaslicer/${normalizedJobId}/attempt-${normalizedAttemptNo}`;
  const processingDir = assertInsideRoot(rootDir, join(rootDir, processingApiBase));
  const resultDir = assertInsideRoot(rootDir, join(rootDir, resultApiBase));
  const failedDir = assertInsideRoot(rootDir, join(rootDir, failedApiBase));
  return {
    apiPaths: {
      gcode: `${resultApiBase}/output.gcode`,
      stdout: `${resultApiBase}/stdout.log`,
      stderr: `${resultApiBase}/stderr.log`,
    },
    processingDir,
    resultDir,
    failedDir,
    processingGcodePartPath: assertInsideRoot(rootDir, join(processingDir, "output.gcode.part")),
    processingStdoutPartPath: assertInsideRoot(rootDir, join(processingDir, "stdout.part")),
    processingStderrPartPath: assertInsideRoot(rootDir, join(processingDir, "stderr.part")),
    gcodePath: assertInsideRoot(rootDir, join(resultDir, "output.gcode")),
    stdoutPath: assertInsideRoot(rootDir, join(resultDir, "stdout.log")),
    stderrPath: assertInsideRoot(rootDir, join(resultDir, "stderr.log")),
  };
}

export function mapInputPath(rootDir, job, options = {}) {
  const relativePath = normalizeInputRelativePath(job.input_relative_path, job, options);
  return assertInsideRoot(rootDir, join(rootDir, relativePath));
}

function normalizeInputRelativePath(value, job, options) {
  let candidate = String(value || "").trim();
  if (!candidate) {
    if (!isLocalIntegrationFallbackAllowed(options)) {
      throwWorkerIo("input_relative_path is required");
    }
    candidate = `files/${requirePositiveInteger(job.file_id, "file_id")}-synthetic-cube.stl`;
  }

  if (candidate.includes("\0")) throwWorkerIo("input_relative_path contains null bytes");
  if (candidate.includes("\\")) throwWorkerIo("input_relative_path contains backslashes");
  if (candidate.includes("%")) throwWorkerIo("input_relative_path contains URL encoding");
  if (candidate.startsWith("/") || candidate.startsWith("//") || /^[A-Za-z]:[\\/]/.test(candidate) || isAbsolute(candidate)) {
    throwWorkerIo("input_relative_path must be relative");
  }
  const parts = candidate.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throwWorkerIo("input_relative_path contains unsafe path segments");
  }
  return candidate;
}

function isLocalIntegrationFallbackAllowed(options) {
  if (!options?.integrationTestMode) return false;
  try {
    const url = new URL(String(options.serverUrl || ""));
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function throwWorkerIo(message) {
  const error = new Error(message);
  error.workerErrorCode = "WORKER_IO_ERROR";
  throw error;
}

export function startLeaseHeartbeat(config, context, intervalMs = LEASE_INTERVAL_MS, monotonic = performance) {
  const controller = createLeaseController(config, context, monotonic);
  ACTIVE_LEASE_CONTROLLERS.add(controller);
  const timer = setInterval(() => {
    const requestStartedMonotonicMs = controller.now();
    apiRequest(config, `/api/worker/slicing/jobs/${context.job.job_id}/lease`, {
      method: "POST",
      body: { lock_owner: context.lock.lock_owner },
    })
      .then((payload) => controller.updateFromServer(payload, requestStartedMonotonicMs))
      .catch((error) => controller.handleLeaseError(error));
  }, intervalMs);
  timer.unref?.();
  controller.timer = timer;
  return controller;
}

export function stopLeaseHeartbeat(controller) {
  if (controller?.timer) clearInterval(controller.timer);
  if (controller) {
    controller.stopped = true;
    ACTIVE_LEASE_CONTROLLERS.delete(controller);
  }
}

export async function apiRequest(config, path, options = {}) {
  const headers = {
    Authorization: `Bearer ${config.workerToken}`,
  };
  let body;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  } else if (options.rawBody !== undefined) {
    body = options.rawBody;
  }
  const response = await config.fetchImpl(new URL(path, config.serverUrl), {
    method: options.method || "GET",
    headers,
    body,
  });
  await logWorkerRequest(config, options.method || "GET", path, response.status);
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`API returned non-JSON status ${response.status}`);
    }
  }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `API request failed: ${response.status}`);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

export async function getPrusaSlicerPackageVersion(config) {
  const { stdout } = await execFilePromise(config.execFileImpl, "dpkg-query", ["-W", "-f=${Version}", "prusa-slicer"], { timeout: 15_000 });
  const version = stdout.trim();
  if (!version) throw new Error("PrusaSlicer package version not found");
  return version;
}

export async function spawnPrusaSlicer(config, args, stdoutPath, stderrPath, leaseController = null) {
  await mkdir(dirname(stdoutPath), { recursive: true });
  await mkdir(dirname(stderrPath), { recursive: true });
  const stdout = createWriteStream(stdoutPath, { flags: "w", mode: 0o600 });
  const stderr = createWriteStream(stderrPath, { flags: "w", mode: 0o600 });
  return new Promise((resolvePromise, reject) => {
    const child = config.spawnImpl(config.prusaSlicerBin || DEFAULT_PRUSASLICER_BIN, args, {
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: process.env.PATH || process.env.Path || "",
        HOME: process.env.HOME || process.env.USERPROFILE || "",
        TMPDIR: process.env.TMPDIR || process.env.TEMP || process.env.TMP || "/tmp",
        LANG: "en_US.UTF-8",
        LANGUAGE: "en_US:en",
        LC_ALL: "en_US.UTF-8",
      },
    });
    trackSlicerChildForCleanup(child);
    const ownershipTimer = leaseControllerWatch(child, reject, leaseController);
    child.on("error", (error) => {
      ACTIVE_CHILDREN.delete(child);
      reject(error);
    });
    pipeline(child.stdout, stdout).catch(reject);
    pipeline(child.stderr, stderr).catch(reject);
    child.on("close", (code, signal) => {
      ACTIVE_CHILDREN.delete(child);
      if (ownershipTimer) clearInterval(ownershipTimer);
      resolvePromise({ exitCode: code ?? (signal ? 1 : 0), signal });
    });
  });
}

export function createLeaseController(config, context, monotonic = performance) {
  const now = () => monotonic.now();
  const controller = {
    timer: null,
    stopped: false,
    ownershipLost: false,
    localDeadlineMs: 0,
    lastLeaseTtlMs: 0,
    lastRequestStartedMonotonicMs: null,
    lastLeaseSafetyMarginMs: LEASE_SAFETY_MARGIN_MS,
    now,
    updateFromServer(payload, requestStartedMonotonicMs = now()) {
      const ttl = computeLeaseTtlMs(payload);
      const safetyMargin = computeLeaseSafetyMarginMs(ttl);
      this.lastLeaseTtlMs = ttl;
      this.lastRequestStartedMonotonicMs = requestStartedMonotonicMs;
      this.lastLeaseSafetyMarginMs = safetyMargin;
      this.localDeadlineMs = requestStartedMonotonicMs + ttl - safetyMargin;
      return this.localDeadlineMs;
    },
    handleLeaseError(error) {
      if ([401, 403, 404, 409].includes(Number(error?.status))) {
        this.ownershipLost = true;
        return;
      }
      if (this.localDeadlineMs && now() >= this.localDeadlineMs) {
        this.ownershipLost = true;
      }
    },
  };
  controller.updateFromServer({
    lease_expires_at_ms: context.lock.lease_expires_at_ms,
    lease_renewed_at_ms: context.lock.lease_renewed_at_ms,
  }, Number.isFinite(context.lock.request_started_monotonic_ms) ? context.lock.request_started_monotonic_ms : now());
  return controller;
}

export function computeLeaseTtlMs(payload) {
  const expires = Number(payload?.lease_expires_at_ms);
  const renewed = Number(payload?.lease_renewed_at_ms);
  const ttl = expires - renewed;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > MAX_LEASE_TTL_MS) {
    const error = new Error("invalid server lease ttl");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }
  return ttl;
}

export function computeLeaseSafetyMarginMs(leaseTtlMs) {
  const ttl = Number(leaseTtlMs);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error("invalid server lease ttl");
  }
  if (LEASE_SAFETY_MARGIN_MS <= 0 || LEASE_SAFETY_MARGIN_MS >= ttl) {
    const error = new Error("invalid lease safety margin");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }
  return LEASE_SAFETY_MARGIN_MS;
}

export function assertLeaseOwnership(controller) {
  if (!controller) return;
  if (controller.ownershipLost || (controller.localDeadlineMs && controller.now() >= controller.localDeadlineMs)) {
    controller.ownershipLost = true;
    const error = new Error("slicing lease ownership lost");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }
}

function leaseControllerWatch(child, reject, controller) {
  if (!controller) return null;
  const timer = setInterval(() => {
    if (!controller.ownershipLost && (!controller.localDeadlineMs || controller.now() < controller.localDeadlineMs)) return;
    controller.ownershipLost = true;
    terminateProcessGroup(child);
    const error = new Error("slicing lease ownership lost");
    error.workerErrorCode = "WORKER_IO_ERROR";
    reject(error);
  }, 250);
  timer.unref?.();
  return timer;
}

export function terminateProcessGroup(child) {
  if (!child || child.exitCode != null || child.killed) return { sentSigterm: false, sentSigkill: false, reason: "not-running" };
  const pid = Number(child.pid);
  try {
    if (Number.isInteger(pid) && pid > 0 && process.platform !== "win32") {
      process.kill(-pid, "SIGTERM");
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // Process group already exited.
        }
      }, 1500);
      return { sentSigterm: true, sentSigkill: true, pid: -pid, mode: "process-group" };
    }
    child.kill?.("SIGTERM");
    return { sentSigterm: true, sentSigkill: false, pid, mode: "direct-child" };
  } catch {
    try {
      child.kill?.("SIGKILL");
      return { sentSigterm: false, sentSigkill: true, pid, mode: "direct-child" };
    } catch {
      // Best effort cleanup only.
    }
  }
  return { sentSigterm: false, sentSigkill: false, pid, reason: "failed" };
}

export function installShutdownHandlers() {
  if (shutdownHandlersInstalled) return;
  shutdownHandlersInstalled = true;
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      shutdownInProgress = true;
      for (const controller of ACTIVE_LEASE_CONTROLLERS) controller.ownershipLost = true;
      cleanupActiveWorkerResources();
      const exitCode = signal === "SIGINT" ? 130 : 143;
      setTimeout(() => process.exit(exitCode), 1800).unref?.();
    });
  }
}

export function cleanupActiveWorkerResources() {
  const results = [];
  for (const controller of [...ACTIVE_LEASE_CONTROLLERS]) stopLeaseHeartbeat(controller);
  for (const child of [...ACTIVE_CHILDREN]) {
    results.push(terminateProcessGroup(child));
    ACTIVE_CHILDREN.delete(child);
  }
  return results;
}

export function trackSlicerChildForCleanup(child) {
  ACTIVE_CHILDREN.add(child);
  return child;
}

export function getActiveSlicerChildCountForTest() {
  return ACTIVE_CHILDREN.size;
}

export async function assertAtomicPublishFilesystem(rootDir, statImpl = stat) {
  const processingRoot = assertInsideRoot(rootDir, join(rootDir, "processing"));
  const resultsRoot = assertInsideRoot(rootDir, join(rootDir, "results"));
  const [processingStat, resultsStat] = await Promise.all([statImpl(processingRoot), statImpl(resultsRoot)]);
  if (processingStat.dev !== resultsStat.dev) {
    const error = new Error("processing and results directories are on different filesystems");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }
  return {
    processingDev: processingStat.dev,
    resultsDev: resultsStat.dev,
  };
}

export async function execFilePromise(execFileImpl, command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    execFileImpl(command, args, options, (error, stdout, stderr) => {
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

export async function ensureIntegrationDirectories(rootDir) {
  for (const name of ["files", "processing", "results", "failed", "logs", "db"]) {
    await mkdir(assertInsideRoot(rootDir, join(rootDir, name)), { recursive: true, mode: 0o750 });
  }
}

export function validateRequiredVersions(job, actualSlicerPackageVersion, actualParserVersion) {
  if (actualSlicerPackageVersion !== job.required_slicer_package_version) throw new Error("required slicer package version mismatch");
  if (actualParserVersion !== job.required_parser_version) throw new Error("required parser version mismatch");
}

export function computeParseCacheKey(gcodeSha256, parserVersion) {
  return sha256String(stableJson({
    schema_version: "1.0",
    gcode_sha256: normalizeSha256(gcodeSha256),
    parser_version: String(parserVersion || "").trim(),
  }, ["schema_version", "gcode_sha256", "parser_version"]));
}

export function computeStableSha256(value) {
  return sha256String(stableJson(value));
}

export function stableJson(value, orderedKeys) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = orderedKeys || Object.keys(value).sort();
    return `{${keys
      .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sanitizeError(value) {
  return String(value || "worker slicing error")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/[A-Z]:[\\/][^\s]+/g, "[redacted-path]")
    .replace(/\/(?:srv|app|home|root|var|tmp)\/[^\s]+/g, "[redacted-path]")
    .replace(/1[3-9]\d{9}/g, "[redacted-phone]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .slice(0, 500);
}

export function mapWorkerError(error) {
  if (error?.workerErrorCode) return error.workerErrorCode;
  if (/timeout/i.test(error?.message || "")) return "SLICER_TIMEOUT";
  if (/G-code output empty/i.test(error?.message || "")) return "SLICER_OUTPUT_EMPTY";
  if (/G-code output missing/i.test(error?.message || "")) return "SLICER_OUTPUT_MISSING";
  if (/parser/i.test(error?.message || "")) return "PARSER_FAILED";
  return "WORKER_IO_ERROR";
}

export function isRetryableWorkerError(error) {
  return ["WORKER_IO_ERROR", "SLICER_TIMEOUT", "SLICER_OUTPUT_MISSING"].includes(mapWorkerError(error));
}

function normalizeFailureStage(status) {
  if (["locked", "slicing", "sliced", "parsing"].includes(status)) return status;
  return "locked";
}

function normalizeServerUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parsed = new URL(text);
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

async function validateSlicerBinary(config) {
  const slicerBin = String(config.prusaSlicerBin || "");
  if (slicerBin === DEFAULT_PRUSASLICER_BIN) return;

  const serverUrl = new URL(config.serverUrl);
  const isLocalApi = ["127.0.0.1", "localhost"].includes(serverUrl.hostname);
  if (!config.integrationTestMode || !isLocalApi) {
    throw new Error("custom slicer binary is allowed only in local integration test mode");
  }

  const actual = await safeRealpath(slicerBin);
  const allowedRoots = [PHASE05_HC_TEST_ROOT, PHASE05_HC_FINAL_TEST_ROOT];
  if (!allowedRoots.some((root) => {
    try {
      assertInsideRoot(root, actual);
      return true;
    } catch {
      return false;
    }
  })) {
    throw new Error("custom slicer binary escapes local integration test root");
  }
}

function normalizeParserDelay(value, options) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 60_000) {
    throw new Error("MAKE3D_WORKER_PARSER_DELAY_MS is invalid");
  }
  if (number === 0) return 0;
  const serverUrl = new URL(options.serverUrl);
  const isLocalApi = ["127.0.0.1", "localhost"].includes(serverUrl.hostname);
  if (!options.integrationTestMode || !isLocalApi) {
    throw new Error("parser delay is allowed only in local integration test mode");
  }
  return number;
}

function normalizeRequestLogPath(value, options) {
  const text = String(value || "").trim();
  if (!text) return "";
  const serverUrl = new URL(options.serverUrl);
  const isLocalApi = ["127.0.0.1", "localhost"].includes(serverUrl.hostname);
  if (!options.integrationTestMode || !isLocalApi) {
    throw new Error("request log path is allowed only in local integration test mode");
  }
  const resolved = resolve(text);
  const allowedRoots = [PHASE05_HC_TEST_ROOT, PHASE05_HC_FINAL_TEST_ROOT];
  if (!allowedRoots.some((root) => {
    try {
      assertInsideRoot(root, resolved);
      return true;
    } catch {
      return false;
    }
  })) {
    throw new Error("request log path escapes local integration test root");
  }
  return resolved;
}

async function logWorkerRequest(config, method, path, status) {
  if (!config.requestLogPath) return;
  const line = JSON.stringify({
    at: new Date().toISOString(),
    method,
    path,
    status,
  });
  await appendFile(config.requestLogPath, `${line}\n`, { mode: 0o600 });
}

async function delayForIntegrationParser(config, leaseController) {
  const delayMs = Number(config.parserDelayMs || 0);
  if (!delayMs) return;
  const deadline = Date.now() + delayMs;
  while (Date.now() < deadline) {
    assertLeaseOwnership(leaseController);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(250, Math.max(1, deadline - Date.now()))));
  }
  assertLeaseOwnership(leaseController);
}

function requirePositiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return number;
}

export function assertResumeArtifactPath(jobId, relativePath) {
  const normalizedJobId = requirePositiveInteger(jobId, "job_id");
  const text = String(relativePath || "");
  if (!new RegExp(`^results/prusaslicer/${normalizedJobId}/attempt-[1-9][0-9]*/output\\.gcode$`).test(text)) {
    const error = new Error("resume artifact path is not job attempt scoped");
    error.workerErrorCode = "WORKER_IO_ERROR";
    throw error;
  }
  return text;
}

function sanitizeWorkerId(value) {
  const text = String(value || "").trim();
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(text)) throw new Error("WORKER_ID is invalid");
  return text;
}

function normalizeLeaseInterval(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 100 || number > LEASE_INTERVAL_MS) {
    throw new Error("LEASE_INTERVAL_MS is invalid");
  }
  return number;
}

function requireOneOf(value, allowed, fieldName) {
  if (!allowed.includes(value)) throw new Error(`${fieldName} is not allowed`);
  return value;
}

function requireIntegerRange(value, min, max, fieldName) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${fieldName} is outside allowed range`);
  return value;
}

function normalizeSha256(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("invalid sha256");
  return normalized;
}

function sha256String(value) {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

export function assertInsideRoot(rootDir, targetPath) {
  const root = resolve(rootDir);
  const target = resolve(targetPath);
  const diff = relative(root, target);
  if (diff === "" || (!diff.startsWith("..") && !isAbsolute(diff))) return target;
  throw new Error("path escapes test integration root");
}

async function safeRealpath(path) {
  const actual = await realpath(path);
  return actual;
}

async function main() {
  const once = process.argv.includes("--once");
  if (!once) {
    console.error("Only --once mode is supported in Phase05-H-A");
    process.exit(2);
  }
  try {
    installShutdownHandlers();
    const config = await loadSlicingWorkerConfig();
    const result = await runOnce(config);
    console.log(JSON.stringify({ ...result, token: undefined }));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(sanitizeError(error?.message || String(error)));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
