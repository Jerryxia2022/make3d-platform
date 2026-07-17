import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, relative, resolve } from "node:path";

import {
  DEFAULT_PRUSASLICER_BIN,
  getPrusaSlicerPackageVersion,
  runPrusaSlicer,
  verifyProfile,
} from "../../make3d-slicing-worker.mjs";
import {
  PARSER_VERSION,
  parsePrusaSlicerGcode,
  sha256File,
} from "../../prusaslicer-result-parser.mjs";
import { resolveInsideRoot, verifyLocalFileSha256 } from "./localFiles.mjs";
import {
  createLocalSliceResult,
  updateLocalReview,
  updateLocalSliceResult,
} from "./localDb.mjs";

export const DEFAULT_WORKER_ROOT = "/srv/make3d-worker";
export const DEFAULT_PROFILE_KEY = "bambu-p1s";
export const DEFAULT_PROFILE_NAME = "Bambu P1S 0.4mm / 0.2mm / 50%";
export const DEFAULT_PROFILE_PATH = "/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini";
export const REQUIRED_LOCALE = "en_US.UTF-8";
export const ALLOWED_MODEL_EXTENSIONS = new Set([".stl", ".3mf"]);

const execFileAsync = promisify(execFile);
let activeLocalSlice = false;

export async function runLocalOneShotSlice({ db, order, file, config, options = {} }) {
  if (activeLocalSlice) throw new Error("another local slicing process is already active");
  activeLocalSlice = true;
  let sliceRow = null;
  try {
    const input = await verifySliceInputFile(file, {
      filesRoot: config.localFilesRoot,
      workerRoot: config.workerRoot,
    });
    await assertPrusaSlicerLocale({
      execFileImpl: options.execFileImpl || execFile,
      requiredLocale: config.requiredLocale || REQUIRED_LOCALE,
    });
    await assertNoExistingPrusaSlicerProcess({ execFileImpl: options.execFileImpl || execFile });

    updateLocalReview(db, order, {
      state: "SLICING",
      selected_file_id: file.file_id,
      selected_sync_job_id: file.local_file_sync_job_id,
    });

    const profilePath = config.profilePath || DEFAULT_PROFILE_PATH;
    const profileSha256 = await sha256File(profilePath);
    const profileKey = config.profileKey || DEFAULT_PROFILE_KEY;
    const profileName = config.profileName || DEFAULT_PROFILE_NAME;
    const startedAt = new Date().toISOString();
    sliceRow = createLocalSliceResult(db, {
      order_id: order.id,
      order_no: order.order_no,
      file_id: file.file_id,
      sync_job_id: file.local_file_sync_job_id,
      input_relative_path: input.workerRelativePath,
      input_sha256: input.sha256,
      input_size_bytes: input.size,
      profile_key: profileKey,
      profile_name: profileName,
      profile_sha256: profileSha256,
      parser_version: PARSER_VERSION,
      status: "slicing",
      started_at: startedAt,
    });

    const workerRoot = resolve(config.workerRoot || DEFAULT_WORKER_ROOT);
    const job = buildLocalSlicingJob({
      order,
      file,
      input,
      sliceResultId: sliceRow.id,
      profileKey,
      profileSha256,
      sliceParams: buildSliceParams(order),
    });
    const workerConfig = {
      rootDir: workerRoot,
      prusaSlicerBin: config.prusaSlicerBin || DEFAULT_PRUSASLICER_BIN,
      execFileImpl: options.execFileImpl || execFile,
      spawnImpl: options.spawnImpl,
      profileWhitelist: {
        [profileKey]: { path: profilePath },
      },
    };
    const profile = await verifyProfile(job, workerConfig.profileWhitelist);
    const slicerVersion = await getPrusaSlicerPackageVersion(workerConfig);
    const sliceResult = await runPrusaSlicer(
      workerConfig,
      {
        job,
        lock: {
          attempt_no: 1,
          lock_owner: `local-workbench-${sliceRow.id}`,
        },
      },
      {
        path: input.path,
        sizeBytes: input.size,
        sha256: input.sha256,
      },
      profile,
      slicerVersion,
      null,
    );

    const parsed = await parsePrusaSlicerGcode(sliceResult.gcodePath, {
      allowedRoots: [resolve(workerRoot, "results")],
      parserVersion: PARSER_VERSION,
      sliceParams: job.slice_params,
      input: {
        file_id: file.file_id,
        filename: file.masked_filename || "local-file",
        path: null,
        sha256: input.sha256,
        size_bytes: input.size,
      },
      slicer: {
        name: "PrusaSlicer",
        package_version: slicerVersion,
        binary_path: null,
        profile_path: profileKey,
        profile_sha256: profileSha256,
      },
      slice: {
        started_at: sliceResult.startedAt,
        finished_at: sliceResult.finishedAt,
        duration_ms: sliceResult.durationMs,
        exit_code: sliceResult.exitCode,
      },
    });

    const finalStatus = parsed.validation.quote_ready ? "parsed" : "partial";
    const updatedSlice = updateLocalSliceResult(db, sliceRow.id, {
      status: finalStatus,
      slicer_version: slicerVersion,
      parse_status: parsed.parse.status,
      metrics_status: parsed.validation.metrics_status,
      parser_quote_ready: parsed.validation.quote_ready,
      completed_at: sliceResult.finishedAt,
      duration_seconds: Math.round(sliceResult.durationMs / 1000),
      print_time_seconds: parsed.result.print_time_seconds,
      material_weight_grams: parsed.result.filament_weight_mg == null ? null : parsed.result.filament_weight_mg / 1000,
      dimensions_x: null,
      dimensions_y: null,
      dimensions_z: parsed.result.max_layer_z_microns == null ? null : parsed.result.max_layer_z_microns / 1000,
      gcode_relative_path: toWorkerRelative(workerRoot, sliceResult.gcodePath),
      gcode_size_bytes: sliceResult.gcodeSizeBytes,
      gcode_sha256: sliceResult.gcodeSha256,
      stdout_relative_path: toWorkerRelative(workerRoot, sliceResult.stdoutPath),
      stderr_relative_path: toWorkerRelative(workerRoot, sliceResult.stderrPath),
      warnings_json: JSON.stringify(parsed.parse.warnings || []),
      metrics_json: JSON.stringify({
        result: parsed.result,
        metric_sources: parsed.metric_sources,
        validation: parsed.validation,
        slice_params: parsed.slice_params,
      }),
    });

    updateLocalReview(db, order, {
      state: "SLICE_REVIEWED",
      selected_file_id: file.file_id,
      selected_sync_job_id: file.local_file_sync_job_id,
      slice_result_id: updatedSlice.id,
    });

    return { ok: true, slice: updatedSlice, parsed };
  } catch (error) {
    const summary = sanitizeFailure(error);
    if (sliceRow?.id) {
      updateLocalSliceResult(db, sliceRow.id, { status: "failed", failure_summary: summary, completed_at: new Date().toISOString() });
    }
    const fileProblem = /sync-not-verified|file-not-verified|extension-not-supported|size|SHA|path|missing|not-found|root/i.test(summary);
    updateLocalReview(db, order, {
      state: fileProblem ? "FILE_PROBLEM" : "SLICE_NEEDS_FIX",
      selected_file_id: file?.file_id,
      selected_sync_job_id: file?.local_file_sync_job_id,
      slice_result_id: sliceRow?.id || null,
    });
    return { ok: false, error: summary, slice: sliceRow?.id ? updateLocalSliceResult(db, sliceRow.id, { status: "failed", failure_summary: summary }) : null };
  } finally {
    activeLocalSlice = false;
  }
}

export async function verifySliceInputFile(file, options = {}) {
  if (file?.sync_status !== "verified" && file?.sync_status !== "local_synced") {
    throw new Error("sync-not-verified");
  }
  const relativePath = String(file?.relative_path || "");
  const extension = getLowerExtension(relativePath || file?.masked_filename || "");
  if (!ALLOWED_MODEL_EXTENSIONS.has(extension)) {
    throw new Error("extension-not-supported");
  }
  const verified = await verifyLocalFileSha256(file, { rootDir: options.filesRoot });
  if (!verified.exists || !verified.size_matches || !verified.sha_matches || !verified.path) {
    throw new Error(verified.error || "file-not-verified");
  }
  const workerRoot = resolve(options.workerRoot || DEFAULT_WORKER_ROOT);
  const filesRoot = resolve(options.filesRoot || join(workerRoot, "files"));
  const resolved = resolveInsideRoot(filesRoot, relativePath);
  if (!resolved.ok || resolved.path !== verified.path) {
    throw new Error("path-verification-failed");
  }
  const workerRelativePath = toWorkerRelative(workerRoot, verified.path);
  if (!workerRelativePath.startsWith("files/")) {
    throw new Error("input-not-under-worker-files");
  }
  return {
    path: verified.path,
    size: verified.size,
    sha256: verified.sha256,
    workerRelativePath,
  };
}

export async function assertPrusaSlicerLocale(options = {}) {
  const execFileImpl = options.execFileImpl || execFile;
  const requiredLocale = options.requiredLocale || REQUIRED_LOCALE;
  const localeList = await execFileText(execFileImpl, "locale", ["-a"]);
  const normalized = localeList.toLowerCase().split(/\s+/);
  if (!normalized.includes(requiredLocale.toLowerCase()) && !normalized.includes(requiredLocale.toLowerCase().replace("-", ""))) {
    throw new Error("PrusaSlicer requires en_US.UTF-8 locale.");
  }
  return { ok: true, requiredLocale };
}

export async function assertNoExistingPrusaSlicerProcess(options = {}) {
  const execFileImpl = options.execFileImpl || execFile;
  try {
    const output = await execFileText(execFileImpl, "pgrep", ["-af", "prusa-slicer"]);
    const active = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.includes("pgrep -af prusa-slicer"));
    if (active.length) throw new Error("another PrusaSlicer process is already running");
  } catch (error) {
    if (error?.code === 1 || error?.signal === null && /Command failed/.test(String(error.message))) return { ok: true };
    if (/already running/.test(String(error.message))) throw error;
  }
  return { ok: true };
}

export function buildSliceParams(order) {
  return {
    material: String(order?.material || "PLA").toUpperCase(),
    printer_model: "Bambu Lab P1S",
    nozzle_diameter_microns: 400,
    layer_height_microns: 200,
    fill_density_percent: 50,
    support_mode: "none",
    brim_width_microns: 0,
  };
}

export function buildLocalSlicingJob({ order, file, input, sliceResultId, profileKey, profileSha256, sliceParams }) {
  return {
    job_id: sliceResultId,
    file_id: file.file_id,
    order_id: order.id,
    order_no: order.order_no,
    input_filename: file.masked_filename || "local-file",
    input_relative_path: input.workerRelativePath,
    input_size_bytes: input.size,
    input_sha256: input.sha256,
    profile_key: profileKey,
    profile_sha256: profileSha256,
    required_parser_version: PARSER_VERSION,
    required_slicer_package_version: null,
    slice_params: sliceParams,
  };
}

export function getLocalSliceChildEnv(env = process.env) {
  return {
    ...env,
    LANG: REQUIRED_LOCALE,
    LANGUAGE: "en_US:en",
    LC_ALL: REQUIRED_LOCALE,
  };
}

function getLowerExtension(value) {
  const filename = String(value || "").split("/").pop() || "";
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

function toWorkerRelative(workerRoot, absolutePath) {
  const rel = relative(resolve(workerRoot), resolve(absolutePath)).replace(/\\/g, "/");
  if (!rel || rel.startsWith("../") || rel === "..") throw new Error("path escapes worker root");
  return rel;
}

function execFileText(execFileImpl, command, args) {
  if (execFileImpl === execFile) {
    return execFileAsync(command, args, { timeout: 15_000 }).then((result) => result.stdout || "");
  }
  return new Promise((resolvePromise, reject) => {
    execFileImpl(command, args, { timeout: 15_000 }, (error, stdout) => {
      if (error) {
        error.stdout = stdout;
        reject(error);
        return;
      }
      resolvePromise(stdout || "");
    });
  });
}

function sanitizeFailure(error) {
  return String(error?.message || error || "local slicing failed")
    .replace(/Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(token|secret|api[_-]?v?3?[_-]?key|private[_-]?key)\s*[:=]\s*["']?[^"',\s]+["']?/gi, "$1=[REDACTED]")
    .replace(/\b1[3-9]\d{9}\b/g, "[REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED]")
    .slice(0, 1000);
}
