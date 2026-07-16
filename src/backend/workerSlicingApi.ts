import { createHash } from "node:crypto";
import { NextResponse } from "next/server.js";
import {
  computeParseCacheKey,
  PARSE_CACHE_KEY_VERSION,
  type SlicingJobRecord,
  type WorkerErrorCode,
  getWorkerErrorPolicy,
} from "./workerSlicingJobs.ts";
import type { SlicingWorkerAuthFailure } from "./workerSlicingAuth.ts";

export const RESULT_BODY_LIMIT_BYTES = 256 * 1024;
export const STATE_BODY_LIMIT_BYTES = 32 * 1024;

const SHA256_RE = /^[a-f0-9]{64}$/;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const METRIC_KEYS = [
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
] as const;

const METRIC_SOURCE_KEYS = [
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
] as const;

const METRIC_VALIDATION_KEYS = ["metrics_status", "quote_ready", "invalid_fields", "warnings"] as const;
const QUOTE_METRIC_KEYS = ["print_time_seconds", "filament_weight_mg"] as const;

const metricLimits: Record<string, { min: number; max: number; nullable: boolean }> = {
  print_time_seconds: { min: 0, max: 2592000, nullable: true },
  silent_print_time_seconds: { min: 0, max: 2592000, nullable: true },
  filament_length_microns: { min: 0, max: 1000000000000, nullable: true },
  filament_volume_mm3: { min: 0, max: 1000000000000, nullable: true },
  filament_weight_mg: { min: 0, max: 1000000000000, nullable: true },
  layer_count: { min: 0, max: 1000000, nullable: true },
  max_layer_z_microns: { min: 0, max: 1000000000, nullable: true },
  nozzle_diameter_microns: { min: 1, max: 10000, nullable: true },
  layer_height_microns: { min: 1, max: 10000, nullable: true },
  gcode_size_bytes: { min: 1, max: 268435456, nullable: false },
};

const sourceEnums: Record<string, readonly string[]> = {
  print_time_source: ["gcode_tail_stat", "missing"],
  filament_length_source: ["gcode_tail_stat", "missing"],
  filament_volume_source: ["gcode_tail_stat", "missing"],
  filament_weight_source: ["gcode_tail_stat", "missing"],
  layer_count_source: ["derived_layer_markers", "missing"],
  max_layer_z_source: ["derived_z_markers", "missing"],
  filament_type_source: ["gcode_config", "missing"],
  printer_model_source: ["gcode_config", "missing"],
  nozzle_diameter_source: ["gcode_config", "missing"],
  layer_height_source: ["gcode_config", "missing"],
};

export type WorkerApiErrorCode =
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "IDEMPOTENCY_PAYLOAD_CONFLICT"
  | "INVALID_JOB_ID"
  | "INVALID_LOCK_OWNER"
  | "JOB_NOT_FOUND"
  | "LEASE_EXPIRED"
  | "PARSER_VALIDATION_INCONSISTENT"
  | "PARSE_CACHE_KEY_MISMATCH"
  | "REQUEST_BODY_TOO_LARGE"
  | "SERVER_ERROR_CODE_NOT_ALLOWED"
  | "STATE_CONFLICT"
  | "UNEXPECTED_REQUEST_BODY"
  | "UNKNOWN_WORKER_ERROR_CODE"
  | "UNSUPPORTED_CONTENT_ENCODING"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "VALIDATION_ERROR"
  | WorkerErrorCode
  | SlicingWorkerAuthFailure["code"];

export type NormalizedResultPayload = {
  lockOwner: string;
  gcodeSha256: string;
  parseCacheKeyVersion: "1.0";
  parseCacheKeySha256: string;
  serverParseCacheKeySha256: string;
  parseStatus: "parsed" | "partial";
  metricsStatus: "valid" | "warning";
  parserQuoteReady: boolean;
  serverParserQuoteReady: boolean;
  metrics: Record<(typeof METRIC_KEYS)[number], string | number | null>;
  metricSources: Record<(typeof METRIC_SOURCE_KEYS)[number], string>;
  metricValidation: {
    metrics_status: "valid" | "warning";
    quote_ready: boolean;
    invalid_fields: string[];
    warnings: string[];
  };
  missingFields: string[];
  warnings: string[];
  normalizedJson: string;
};

export function jsonOk(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: withBaseHeaders(init.headers),
  });
}

export function jsonOkWithLock(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: withBaseHeaders(init.headers, true),
  });
}

export function jsonError(status: number, code: WorkerApiErrorCode, message: string, retryable = false) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        retryable,
      },
    },
    {
      status,
      headers: withBaseHeaders(),
    },
  );
}

export function authErrorResponse(error: SlicingWorkerAuthFailure) {
  return jsonError(error.status, error.code, error.message);
}

export async function readStrictEmptyBody(request: Request) {
  let body: Uint8Array;
  try {
    body = await readRawBody(request, 1);
  } catch {
    return { ok: false as const, response: jsonError(400, "UNEXPECTED_REQUEST_BODY", "Request body must be empty") };
  }
  if (body.length > 0) {
    return { ok: false as const, response: jsonError(400, "UNEXPECTED_REQUEST_BODY", "Request body must be empty") };
  }
  return { ok: true as const };
}

export async function readLimitedJsonBody(request: Request, limitBytes = STATE_BODY_LIMIT_BYTES) {
  const encoding = (request.headers.get("content-encoding") || "identity").trim().toLowerCase();
  if (encoding && encoding !== "identity") {
    return { ok: false as const, response: jsonError(415, "UNSUPPORTED_CONTENT_ENCODING", "Unsupported content encoding") };
  }

  const contentType = parseMediaType(request.headers.get("content-type") || "");
  if (contentType !== "application/json") {
    return { ok: false as const, response: jsonError(415, "UNSUPPORTED_CONTENT_TYPE", "Content-Type must be application/json") };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > limitBytes) {
    return { ok: false as const, response: jsonError(413, "REQUEST_BODY_TOO_LARGE", "Request body is too large") };
  }

  let raw: Uint8Array;
  try {
    raw = await readRawBody(request, limitBytes);
  } catch {
    return { ok: false as const, response: jsonError(413, "REQUEST_BODY_TOO_LARGE", "Request body is too large") };
  }

  if (raw.length === 0) {
    return { ok: false as const, response: jsonError(400, "BAD_REQUEST", "JSON body is required") };
  }

  try {
    return { ok: true as const, body: JSON.parse(Buffer.from(raw).toString("utf8")) as unknown };
  } catch {
    return { ok: false as const, response: jsonError(400, "BAD_REQUEST", "Invalid JSON body") };
  }
}

export function readJobId(value: string) {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function requireObject(value: unknown, allowedKeys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const extra = Object.keys(record).find((key) => !allowedKeys.includes(key));
  if (extra) throw new ValidationError(`${name}.${extra} is not allowed`);
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new ValidationError(`${name}.${key} is required`);
    }
  }
  return record;
}

export function requireLockOwner(value: unknown) {
  if (typeof value !== "string" || !UUID_V4_RE.test(value)) {
    throw new ValidationError("lock_owner must be a lowercase UUID v4");
  }
  return value;
}

export function requireSha256(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new ValidationError(`${fieldName} must be a lowercase SHA-256 hex value`);
  }
  return value;
}

export function normalizeResultPayload(value: unknown, job: SlicingJobRecord): NormalizedResultPayload {
  const top = requireObject(
    value,
    [
      "lock_owner",
      "gcode_sha256",
      "parse_cache_key_version",
      "parse_cache_key_sha256",
      "parse_status",
      "metrics_status",
      "parser_quote_ready",
      "metrics",
      "metric_sources",
      "metric_validation",
      "missing_fields",
      "warnings",
    ],
    "result",
  );

  const lockOwner = requireLockOwner(top.lock_owner);
  const gcodeSha256 = requireSha256(top.gcode_sha256, "gcode_sha256");
  const parseCacheKeyVersion = requireEnum(top.parse_cache_key_version, ["1.0"], "parse_cache_key_version");
  const parseCacheKeySha256 = requireSha256(top.parse_cache_key_sha256, "parse_cache_key_sha256");
  const parseStatus = requireEnum(top.parse_status, ["parsed", "partial"], "parse_status");
  const metricsStatus = requireEnum(top.metrics_status, ["valid", "warning"], "metrics_status");
  const parserQuoteReady = requireBoolean(top.parser_quote_ready, "parser_quote_ready");
  const metrics = normalizeMetrics(top.metrics);
  const metricSources = normalizeMetricSources(top.metric_sources);
  const metricValidation = normalizeMetricValidation(top.metric_validation);
  const missingFields = normalizeStringArray(top.missing_fields, "missing_fields", 50, 80);
  const warnings = normalizeStringArray(top.warnings, "warnings", 50, 500);
  const serverParseCacheKeySha256 = computeParseCacheKey({
    gcodeSha256,
    parserVersion: job.requiredParserVersion,
  });

  if (parseCacheKeyVersion !== PARSE_CACHE_KEY_VERSION || parseCacheKeySha256 !== serverParseCacheKeySha256) {
    throw new CodedValidationError("PARSE_CACHE_KEY_MISMATCH", "Parse cache key does not match server calculation");
  }

  validateParserResultConsistency({
    gcodeSha256,
    job,
    metrics,
    metricsStatus,
    metricSources,
    metricValidation,
    missingFields,
    parserQuoteReady,
  });

  const serverParserQuoteReady = parserQuoteReady && metricValidation.quote_ready;
  const normalized = {
    gcode_sha256: gcodeSha256,
    parse_cache_key_sha256: serverParseCacheKeySha256,
    parse_status: parseStatus,
    metrics_status: metricsStatus,
    parser_quote_ready: serverParserQuoteReady,
    metrics,
    metric_sources: metricSources,
    metric_validation: metricValidation,
    missing_fields: missingFields,
    warnings,
  };

  return {
    lockOwner,
    gcodeSha256,
    parseCacheKeyVersion,
    parseCacheKeySha256,
    serverParseCacheKeySha256,
    parseStatus,
    metricsStatus,
    parserQuoteReady,
    serverParserQuoteReady,
    metrics,
    metricSources,
    metricValidation,
    missingFields,
    warnings,
    normalizedJson: stableJson(normalized),
  };
}

export function normalizeFailedPayload(value: unknown) {
  const top = requireObject(value, ["lock_owner", "stage", "error_code", "error_message"], "failed");
  const lockOwner = requireLockOwner(top.lock_owner);
  const stage = requireEnum(top.stage, ["locked", "slicing", "sliced", "parsing"], "stage");
  if (typeof top.error_code !== "string" || !top.error_code.trim()) {
    throw new CodedValidationError("UNKNOWN_WORKER_ERROR_CODE", "Unknown Worker error code");
  }
  const errorCode = top.error_code.trim() as WorkerErrorCode;
  const policy = getWorkerErrorPolicy(errorCode);

  if (!policy) {
    throw new CodedValidationError("UNKNOWN_WORKER_ERROR_CODE", "Unknown Worker error code");
  }
  if (policy.source !== "worker") {
    throw new CodedValidationError("SERVER_ERROR_CODE_NOT_ALLOWED", "Server error code cannot be submitted by Worker");
  }
  if (!policy.allowedStages.includes(stage)) {
    throw new CodedValidationError("VALIDATION_ERROR", "Error stage does not match error code");
  }

  const errorMessage = sanitizeWorkerSlicingError(requireString(top.error_message, "error_message", 4096));
  const normalizedJson = stableJson({ stage, error_code: errorCode, error_message: errorMessage });
  return { lockOwner, stage, errorCode, errorMessage, normalizedJson };
}

export function normalizeStringArray(value: unknown, fieldName: string, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) throw new ValidationError(`${fieldName} must be an array`);
  if (value.length > maxItems) throw new ValidationError(`${fieldName} is too large`);
  return [...new Set(value.map((item) => requireString(item, fieldName, maxLength).trim()).filter(Boolean))].sort();
}

export function sanitizeWorkerSlicingError(value: string) {
  return String(value || "worker slicing error")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/[A-Z]:[\\/][^\s]+/g, "[redacted-path]")
    .replace(/\/(?:srv|app|home|root|var|tmp)\/[^\s]+/g, "[redacted-path]")
    .replace(/1[3-9]\d{9}/g, "[redacted-phone]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .slice(0, 500);
}

export function validateSlicedArtifactPaths(jobId: number, attemptNo: number, body: Record<string, unknown>) {
  if (!Number.isSafeInteger(attemptNo) || attemptNo <= 0) {
    throw new ValidationError("attempt_no is invalid");
  }
  const expected = {
    gcode_relative_path: `results/prusaslicer/${jobId}/attempt-${attemptNo}/output.gcode`,
    stdout_relative_path: `results/prusaslicer/${jobId}/attempt-${attemptNo}/stdout.log`,
    stderr_relative_path: `results/prusaslicer/${jobId}/attempt-${attemptNo}/stderr.log`,
  };
  for (const [key, expectedPath] of Object.entries(expected)) {
    if (body[key] !== expectedPath || !isSafeArtifactPath(String(body[key] || ""))) {
      throw new ValidationError(`${key} must equal ${expectedPath}`);
    }
  }
}

export function isSafeArtifactPath(value: string) {
  if (!value || value.includes("\0") || value.includes("\\") || value.includes("..")) return false;
  const lower = value.toLowerCase();
  if (lower.includes("%2e") || lower.includes("%5c") || lower.startsWith("/") || /^[a-z]:/i.test(value)) return false;
  if (value.startsWith("processing/") || value.startsWith("failed/")) return false;
  return /^results\/prusaslicer\/[1-9][0-9]*\/attempt-[1-9][0-9]*\/(?:output\.gcode|stdout\.log|stderr\.log)$/.test(value);
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export class ValidationError extends Error {
  code = "VALIDATION_ERROR" as const;
}

export class CodedValidationError extends Error {
  code: WorkerApiErrorCode;

  constructor(code: WorkerApiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function normalizeMetrics(value: unknown) {
  const record = requireObject(value, METRIC_KEYS, "metrics");
  const output = {} as Record<(typeof METRIC_KEYS)[number], string | number | null>;

  for (const key of METRIC_KEYS) {
    if (key === "gcode_sha256") {
      output[key] = requireSha256(record[key], "metrics.gcode_sha256");
    } else if (key === "filament_type") {
      output[key] = requireNullableString(record[key], "metrics.filament_type", 64);
    } else if (key === "printer_model") {
      output[key] = requireNullableString(record[key], "metrics.printer_model", 128);
    } else {
      output[key] = requireNullableInteger(record[key], `metrics.${key}`, metricLimits[key]);
    }
  }

  return output;
}

function normalizeMetricSources(value: unknown) {
  const record = requireObject(value, METRIC_SOURCE_KEYS, "metric_sources");
  const output = {} as Record<(typeof METRIC_SOURCE_KEYS)[number], string>;
  for (const key of METRIC_SOURCE_KEYS) {
    output[key] = requireEnum(record[key], sourceEnums[key], `metric_sources.${key}`);
  }
  return output;
}

function normalizeMetricValidation(value: unknown) {
  const record = requireObject(value, METRIC_VALIDATION_KEYS, "metric_validation");
  return {
    metrics_status: requireEnum(record.metrics_status, ["valid", "warning"], "metric_validation.metrics_status"),
    quote_ready: requireBoolean(record.quote_ready, "metric_validation.quote_ready"),
    invalid_fields: normalizeStringArray(record.invalid_fields, "metric_validation.invalid_fields", 50, 80),
    warnings: normalizeStringArray(record.warnings, "metric_validation.warnings", 50, 500),
  };
}

function validateParserResultConsistency(input: {
  gcodeSha256: string;
  job: SlicingJobRecord;
  metrics: Record<string, string | number | null>;
  metricsStatus: "valid" | "warning";
  metricSources: Record<string, string>;
  metricValidation: { metrics_status: "valid" | "warning"; quote_ready: boolean; invalid_fields: string[] };
  missingFields: string[];
  parserQuoteReady: boolean;
}) {
  const fail = () => {
    throw new CodedValidationError("PARSER_VALIDATION_INCONSISTENT", "Parser result is inconsistent");
  };

  if (input.metricsStatus !== input.metricValidation.metrics_status) fail();
  if (input.parserQuoteReady !== input.metricValidation.quote_ready) fail();
  if (input.metricValidation.quote_ready && input.metricValidation.invalid_fields.length) fail();
  if (input.parserQuoteReady && input.missingFields.length) fail();
  if (input.metricsStatus === "valid" && input.metricValidation.invalid_fields.length) fail();
  if (input.metrics.gcode_sha256 !== input.gcodeSha256) fail();
  if (input.job.gcodeSha256 && input.job.gcodeSha256 !== input.gcodeSha256) fail();
  if (input.job.gcodeSizeBytes != null && input.metrics.gcode_size_bytes !== input.job.gcodeSizeBytes) fail();

  for (const fieldName of input.missingFields) {
    if (!Object.prototype.hasOwnProperty.call(input.metrics, fieldName)) fail();
    if (input.metrics[fieldName] !== null) fail();
  }

  for (const key of QUOTE_METRIC_KEYS) {
    if (input.metrics[key] == null && input.parserQuoteReady) fail();
  }

  for (const [key, source] of Object.entries(input.metricSources)) {
    if (source !== "missing") continue;
    const metricName = key.replace(/_source$/, "");
    const mapped = metricName === "print_time" ? "print_time_seconds" : `${metricName}_microns`;
    if (Object.prototype.hasOwnProperty.call(input.metrics, mapped) && input.metrics[mapped] !== null) fail();
  }
}

function requireNullableInteger(value: unknown, fieldName: string, limit?: { min: number; max: number; nullable: boolean }) {
  if (value === null && limit?.nullable) return null;
  if (!Number.isSafeInteger(value)) throw new ValidationError(`${fieldName} must be a safe integer`);
  if (limit && (Number(value) < limit.min || Number(value) > limit.max)) {
    throw new ValidationError(`${fieldName} is outside allowed range`);
  }
  return Number(value);
}

function requireNullableString(value: unknown, fieldName: string, maxLength: number) {
  if (value === null) return null;
  return requireString(value, fieldName, maxLength);
}

function requireString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== "string") throw new ValidationError(`${fieldName} must be a string`);
  if (value.length > maxLength) throw new ValidationError(`${fieldName} is too long`);
  return value;
}

function requireBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") throw new ValidationError(`${fieldName} must be a boolean`);
  return value;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], fieldName: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`${fieldName} is invalid`);
  }
  return value as T;
}

function parseMediaType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() || "";
}

async function readRawBody(request: Request, limitBytes: number) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) throw new Error("request body too large");
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function withBaseHeaders(headers?: HeadersInit, lock = false) {
  const output = new Headers(headers);
  output.set("Cache-Control", "no-store");
  if (lock) output.set("Pragma", "no-cache");
  return output;
}

export function sha256StableJson(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}
