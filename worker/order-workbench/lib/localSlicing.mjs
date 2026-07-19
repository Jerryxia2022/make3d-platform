import { execFile, spawn as defaultSpawn } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, join, relative, resolve } from "node:path";

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
export const DEFAULT_GLOBAL_SLICE_LOCK_RELATIVE_PATH = "order-workbench/prusaslicer.lock";
export const DEFAULT_FLOCK_BIN = "/usr/bin/flock";
export const FLOCK_LOCK_CONFLICT_EXIT_CODE = 75;

const execFileAsync = promisify(execFile);
let activeLocalSlice = false;
const localSliceRuntimeStates = new Map();

export function getLocalSliceRuntimeStatus(orderId) {
  return localSliceRuntimeStates.get(Number(orderId)) || null;
}

export function isLocalSliceRunning() {
  return activeLocalSlice;
}

export async function runLocalOneShotSlice({ db, order, file, config, options = {} }) {
  if (activeLocalSlice) throw new Error("another local slicing process is already active");
  activeLocalSlice = true;
  let sliceRow = null;
  setRuntimeStage(order?.id, "VALIDATING", { message: "正在验证 STL 文件、大小和 SHA-256" });
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
    const sliceParams = buildSliceParams(order, options.sliceParams);
    const job = buildLocalSlicingJob({
      order,
      file,
      input,
      sliceResultId: sliceRow.id,
      profileKey,
      profileSha256,
      sliceParams,
    });
    const workerConfig = {
      rootDir: workerRoot,
      prusaSlicerBin: config.prusaSlicerBin || DEFAULT_PRUSASLICER_BIN,
      execFileImpl: options.execFileImpl || execFile,
      spawnImpl: options.disableGlobalSliceLock
        ? options.spawnImpl
        : await createGlobalSliceLockSpawnImpl({
            workerRoot,
            baseSpawnImpl: options.spawnImpl,
            flockBin: options.flockBin,
          }),
      globalSliceLockPath: getGlobalSliceLockPath(workerRoot),
      profileWhitelist: {
        [profileKey]: { path: profilePath },
      },
    };
    const profile = await verifyProfile(job, workerConfig.profileWhitelist);
    const slicerVersion = await getPrusaSlicerPackageVersion(workerConfig);
    setRuntimeStage(order.id, "SLICING", {
      sliceResultId: sliceRow.id,
      message: "正在启动 PrusaSlicer 并生成 G-code",
    });
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

    const published = await publishOrderSliceArtifacts({
      workerRoot,
      orderNo: order.order_no,
      sliceResultId: sliceRow.id,
      sliceResult,
    });
    setRuntimeStage(order.id, "PARSING", {
      sliceResultId: sliceRow.id,
      message: "G-code 已生成，正在解析打印时间和耗材重量",
    });

    const parsed = await parsePrusaSlicerGcode(published.gcodePath, {
      allowedRoots: [resolve(workerRoot, "results")],
      parserVersion: PARSER_VERSION,
      sliceParams: job.slice_params,
      input: {
        file_id: file.file_id,
        filename: file.masked_filename || "local-file",
        path: null,
        sha256: input.sha256,
        size_bytes: input.size,
        dimensions: {
          x_mm: file.bounding_box_x ?? file.boundingBoxX ?? null,
          y_mm: file.bounding_box_y ?? file.boundingBoxY ?? null,
          z_mm: file.bounding_box_z ?? file.boundingBoxZ ?? null,
        },
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

    const hasRequiredMetrics = parsed.result.print_time_seconds > 0
      && parsed.result.filament_weight_mg > 0
      && published.gcodeSizeBytes > 0
      && parsed.validation.quote_ready === true;
    const finalStatus = hasRequiredMetrics ? "parsed" : "partial";
    const dimensions = parsed.result.dimensions || {};
    const updatedSlice = updateLocalSliceResult(db, sliceRow.id, {
      status: finalStatus,
      slicer_version: slicerVersion,
      parse_status: parsed.parse.status,
      metrics_status: parsed.validation.metrics_status,
      parser_quote_ready: parsed.validation.quote_ready,
      completed_at: sliceResult.finishedAt,
      duration_seconds: Math.max(1, Math.ceil(sliceResult.durationMs / 1000)),
      print_time_seconds: parsed.result.print_time_seconds,
      material_weight_grams: parsed.result.filament_weight_mg == null ? null : parsed.result.filament_weight_mg / 1000,
      dimensions_x: dimensions.x_mm ?? null,
      dimensions_y: dimensions.y_mm ?? null,
      dimensions_z: dimensions.z_mm ?? null,
      gcode_relative_path: toWorkerRelative(workerRoot, published.gcodePath),
      gcode_size_bytes: published.gcodeSizeBytes,
      gcode_sha256: published.gcodeSha256,
      stdout_relative_path: toWorkerRelative(workerRoot, published.stdoutPath),
      stderr_relative_path: toWorkerRelative(workerRoot, published.stderrPath),
      warnings_json: JSON.stringify(parsed.parse.warnings || []),
      metrics_json: JSON.stringify({
        result: parsed.result,
        metric_sources: parsed.metric_sources,
        validation: parsed.validation,
        slice_params: parsed.slice_params,
        execution: {
          binary_path: config.prusaSlicerBin || DEFAULT_PRUSASLICER_BIN,
          profile_path: profile.path,
          command: [config.prusaSlicerBin || DEFAULT_PRUSASLICER_BIN, ...sliceResult.args],
          exit_code: sliceResult.exitCode,
          gcode_absolute_path: published.gcodePath,
          stdout_absolute_path: published.stdoutPath,
          stderr_absolute_path: published.stderrPath,
        },
        dimension_sources: {
          upload_model_dimensions: {
            x_mm: file.bounding_box_x ?? file.boundingBoxX ?? null,
            y_mm: file.bounding_box_y ?? file.boundingBoxY ?? null,
            z_mm: file.bounding_box_z ?? file.boundingBoxZ ?? null,
            source: "cloud_file_geometry",
          },
          parser_dimensions: parsed.result.dimensions,
          parser_dimensions_source: parsed.metric_sources.dimensions_source,
        },
      }),
    });

    updateLocalReview(db, order, {
      state: finalStatus === "parsed" ? "SLICE_REVIEWED" : "SLICE_NEEDS_FIX",
      selected_file_id: file.file_id,
      selected_sync_job_id: file.local_file_sync_job_id,
      slice_result_id: updatedSlice.id,
    });

    const stage = finalStatus === "parsed" ? "SUCCESS" : "PARTIAL";
    setRuntimeStage(order.id, stage, {
      sliceResultId: updatedSlice.id,
      message: finalStatus === "parsed"
        ? "切片完成，G-code、打印时间和耗材重量均已验证"
        : "G-code 已生成，但打印时间或耗材重量未完整解析",
    });
    return { ok: finalStatus === "parsed", partial: finalStatus === "partial", slice: updatedSlice, parsed };
  } catch (error) {
    const workerRoot = resolve(config.workerRoot || DEFAULT_WORKER_ROOT);
    const slicerDetails = sliceRow?.id
      ? await readLocalSlicerFailureDetails(workerRoot, sliceRow.id)
      : "";
    const summary = sanitizeFailure(slicerDetails ? `${error?.message || error}；${slicerDetails}` : error);
    if (sliceRow?.id) {
      updateLocalSliceResult(db, sliceRow.id, {
        status: "failed",
        failure_summary: summary,
        completed_at: error?.finishedAt || new Date().toISOString(),
        duration_seconds: error?.durationMs == null ? null : Math.max(1, Math.ceil(error.durationMs / 1000)),
        metrics_json: JSON.stringify({
          execution: {
            binary_path: config.prusaSlicerBin || DEFAULT_PRUSASLICER_BIN,
            profile_path: config.profilePath || DEFAULT_PROFILE_PATH,
            command: Array.isArray(error?.args)
              ? [config.prusaSlicerBin || DEFAULT_PRUSASLICER_BIN, ...error.args]
              : [],
            exit_code: error?.exitCode ?? null,
          },
          failed_stage: runtimeStageFor(order?.id),
        }),
      });
    }
    const fileProblem = /sync-not-verified|file-not-verified|extension-not-supported|size|SHA|path|missing|not-found|root/i.test(summary);
    updateLocalReview(db, order, {
      state: fileProblem ? "FILE_PROBLEM" : "SLICE_NEEDS_FIX",
      selected_file_id: file?.file_id,
      selected_sync_job_id: file?.local_file_sync_job_id,
      slice_result_id: sliceRow?.id || null,
    });
    setRuntimeStage(order?.id, "FAILED", {
      sliceResultId: sliceRow?.id || null,
      message: summary,
    });
    return { ok: false, error: summary, slice: sliceRow?.id ? updateLocalSliceResult(db, sliceRow.id, { status: "failed", failure_summary: summary }) : null };
  } finally {
    activeLocalSlice = false;
  }
}

export async function readLocalSlicerFailureDetails(workerRoot, sliceResultId) {
  const id = Number(sliceResultId);
  if (!Number.isSafeInteger(id) || id <= 0) return "";
  const stderrPath = join(
    resolve(workerRoot || DEFAULT_WORKER_ROOT),
    "processing",
    "prusaslicer",
    String(id),
    "attempt-1",
    "stderr.part",
  );
  const stderr = await readFile(stderrPath, "utf8").catch(() => "");
  const message = String(stderr || "").trim().slice(0, 2_000);
  if (!message) return "";
  if (/exceeds the maximum build volume height/i.test(message)) {
    return "模型高度超过当前打印机配置允许的最大成型高度";
  }
  if (/exceeds the maximum build volume|outside (?:of )?the (?:print|build) volume/i.test(message)) {
    return "模型尺寸超出当前打印机配置允许的成型范围";
  }
  return message.replace(/\b[^\s/\\]+\.(?:stl|3mf)\b/gi, "模型文件");
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

export function buildSliceParams(order, overrides = {}) {
  const layerHeightMicrons = normalizeIntegerOption(overrides.layer_height_microns, 200);
  const fillDensityPercent = normalizeIntegerOption(overrides.fill_density_percent, 50);
  const supportMode = String(overrides.support_mode || "none");
  const brimWidthMicrons = normalizeIntegerOption(overrides.brim_width_microns, 0);
  if (layerHeightMicrons < 50 || layerHeightMicrons > 400) throw new Error("layer height must be between 0.05 and 0.4 mm");
  if (fillDensityPercent < 0 || fillDensityPercent > 100) throw new Error("fill density must be between 0 and 100 percent");
  if (!new Set(["none", "build_plate", "everywhere"]).has(supportMode)) throw new Error("invalid support mode");
  if (brimWidthMicrons < 0 || brimWidthMicrons > 20_000) throw new Error("brim width must be between 0 and 20 mm");
  return {
    material: String(order?.material || "PLA").toUpperCase(),
    printer_model: "Bambu Lab P1S",
    nozzle_diameter_microns: 400,
    layer_height_microns: layerHeightMicrons,
    fill_density_percent: fillDensityPercent,
    support_mode: supportMode,
    brim_width_microns: brimWidthMicrons,
  };
}

export async function publishOrderSliceArtifacts({ workerRoot, orderNo, sliceResultId, sliceResult }) {
  const safeOrderNo = String(orderNo || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeOrderNo) throw new Error("invalid order number for local result path");
  const resultRoot = resolve(workerRoot, "results");
  const safeRelativeDirectory = `orders/${safeOrderNo}/slice-${Number(sliceResultId)}`;
  const resultDir = resolve(resultRoot, safeRelativeDirectory);
  const inside = resolveInsideRoot(resultRoot, safeRelativeDirectory);
  if (!inside.ok || inside.path !== resultDir) throw new Error("order result path escapes worker results root");
  await mkdir(resultDir, { recursive: true, mode: 0o750 });
  const gcodePath = join(resultDir, "output.gcode");
  const stdoutPath = join(resultDir, "stdout.log");
  const stderrPath = join(resultDir, "stderr.log");
  await atomicCopy(sliceResult.gcodePath, gcodePath);
  await atomicCopy(sliceResult.stdoutPath, stdoutPath);
  await atomicCopy(sliceResult.stderrPath, stderrPath);
  const info = await stat(gcodePath);
  const gcodeSha256 = await sha256File(gcodePath);
  if (!info.isFile() || info.size <= 0) throw new Error("published order G-code is missing or empty");
  if (info.size !== sliceResult.gcodeSizeBytes || gcodeSha256 !== sliceResult.gcodeSha256) {
    throw new Error("published order G-code verification failed");
  }
  return { gcodePath, stdoutPath, stderrPath, gcodeSizeBytes: info.size, gcodeSha256 };
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

export function getGlobalSliceLockPath(workerRoot = DEFAULT_WORKER_ROOT) {
  return resolve(workerRoot, DEFAULT_GLOBAL_SLICE_LOCK_RELATIVE_PATH);
}

export async function createGlobalSliceLockSpawnImpl(options = {}) {
  const workerRoot = resolve(options.workerRoot || DEFAULT_WORKER_ROOT);
  const lockPath = getGlobalSliceLockPath(workerRoot);
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o750 });
  const baseSpawnImpl = options.baseSpawnImpl;
  const flockBin = options.flockBin || DEFAULT_FLOCK_BIN;

  return function spawnWithGlobalSliceLock(command, args, spawnOptions) {
    const fixedArgs = [
      "-n",
      "-E",
      String(FLOCK_LOCK_CONFLICT_EXIT_CODE),
      lockPath,
      command,
      ...args,
    ];
    const spawnImpl = baseSpawnImpl || defaultSpawn;
    return spawnImpl(flockBin, fixedArgs, {
      ...spawnOptions,
      shell: false,
    });
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

async function atomicCopy(sourcePath, finalPath) {
  const partPath = `${finalPath}.part`;
  await rm(partPath, { force: true });
  await copyFile(sourcePath, partPath);
  await chmod(partPath, 0o640);
  await rename(partPath, finalPath);
}

function setRuntimeStage(orderId, stage, values = {}) {
  const id = Number(orderId);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  localSliceRuntimeStates.set(id, {
    orderId: id,
    stage,
    terminal: new Set(["SUCCESS", "PARTIAL", "FAILED"]).has(stage),
    updatedAt: new Date().toISOString(),
    ...values,
  });
}

function runtimeStageFor(orderId) {
  return getLocalSliceRuntimeStatus(orderId)?.stage || "VALIDATING";
}

function normalizeIntegerOption(value, fallback) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("slice parameter must be an integer");
  return number;
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
