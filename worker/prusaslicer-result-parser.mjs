import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";

export const PARSER_VERSION = "phase05-c-parser-v1";

export const DEFAULT_ALLOWED_ROOTS = ["/srv/make3d-worker/test-slicer/output"];
export const DEFAULT_MAX_FILE_SIZE_BYTES = 256 * 1024 * 1024;
export const TAIL_WINDOWS_BYTES = [1, 2, 4, 8].map((size) => size * 1024 * 1024);
export const MAX_COMMENT_LINE_BYTES = 16 * 1024;

const SLICE_PARAM_ORDER = [
  "material",
  "printer_model",
  "nozzle_diameter_microns",
  "layer_height_microns",
  "fill_density_percent",
  "support_mode",
  "brim_width_microns",
];

const SOURCE = {
  gcodeTailStat: "gcode_tail_stat",
  gcodeDirect: "gcode_direct",
  calculatedFromLengthDensity: "calculated_from_length_density",
  gcodeConfig: "gcode_config",
  gcodeBounds: "gcode_bounds",
  cloudFileGeometry: "cloud_file_geometry",
  derivedLayerMarkers: "derived_layer_markers",
  derivedZMarkers: "derived_z_markers",
  missing: "missing",
  unavailable: "unavailable",
};

const WARNING_SEVERITY = {
  nonBlocking: "NON_BLOCKING",
  manualReviewRequired: "MANUAL_REVIEW_REQUIRED",
  blocking: "BLOCKING",
};

const MAX_REASONABLE_FILAMENT_WEIGHT_G = 1_000_000;
const MATERIAL_DENSITY_G_CM3 = {
  PLA: 1.24,
  PETG: 1.27,
  ABS: 1.04,
  TPU: 1.21,
};

export function normalizeSliceParams(params = {}) {
  const normalized = {
    material: normalizeString(params.material, "PLA").toUpperCase(),
    printer_model: normalizeString(params.printer_model, "Bambu Lab P1S"),
    nozzle_diameter_microns: normalizeInteger(params.nozzle_diameter_microns, 400),
    layer_height_microns: normalizeInteger(params.layer_height_microns, 200),
    fill_density_percent: normalizeInteger(params.fill_density_percent, 50),
    support_mode: normalizeString(params.support_mode, "none"),
    brim_width_microns: normalizeInteger(params.brim_width_microns, 0),
  };

  return Object.fromEntries(SLICE_PARAM_ORDER.map((key) => [key, normalized[key]]));
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function canonicalSliceParamsJson(value) {
  const normalized = normalizeSliceParams(value);
  return `{${SLICE_PARAM_ORDER.map((key) => `${JSON.stringify(key)}:${canonicalJson(normalized[key])}`).join(",")}}`;
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createSliceParamsFingerprint(params = {}) {
  const sliceParams = normalizeSliceParams(params);
  const sliceParamsJson = canonicalSliceParamsJson(sliceParams);

  return {
    slice_params: sliceParams,
    slice_params_json: sliceParamsJson,
    slice_params_sha256: sha256Hex(sliceParamsJson),
  };
}

export function parseDurationToSeconds(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { seconds: null, warning: "duration is empty" };
  }

  const normalized = value.trim().toLowerCase();
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)];
  const consumed = matches.map((match) => match[0]).join("").replace(/\s+/g, "");
  const compact = normalized.replace(/\s+/g, "");

  if (!matches.length || consumed !== compact) {
    return { seconds: null, warning: `unknown duration format: ${value}` };
  }

  let seconds = 0;
  for (const match of matches) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      return { seconds: null, warning: `invalid duration value: ${value}` };
    }

    if (match[2] === "d") seconds += amount * 86400;
    if (match[2] === "h") seconds += amount * 3600;
    if (match[2] === "m") seconds += amount * 60;
    if (match[2] === "s") seconds += amount;
  }

  if (seconds > 30 * 86400) {
    return { seconds: Math.round(seconds), warning: `duration unusually large: ${value}` };
  }

  return { seconds: Math.round(seconds), warning: null };
}

export async function parsePrusaSlicerGcode(filePath, options = {}) {
  const allowedRoots = options.allowedRoots || DEFAULT_ALLOWED_ROOTS;
  const maxFileSizeBytes = options.maxFileSizeBytes || DEFAULT_MAX_FILE_SIZE_BYTES;
  const tailWindowsBytes = options.tailWindowsBytes || TAIL_WINDOWS_BYTES;
  const resolvedPath = await assertAllowedFile(filePath, allowedRoots);
  const fileStat = await stat(resolvedPath);

  if (!fileStat.isFile()) {
    throw new Error("G-code path is not a file");
  }

  if (fileStat.size === 0) {
    throw new Error("G-code file is empty");
  }

  if (fileStat.size > maxFileSizeBytes) {
    throw new Error(`G-code file exceeds max size: ${fileStat.size}`);
  }

  const inputContext = options.input || {};
  const slicerContext = options.slicer || {};
  const sliceContext = options.slice || {};
  const paramsFingerprint = createSliceParamsFingerprint(options.sliceParams || {});
  const gcodeSha256 = await sha256File(resolvedPath);
  const header = await readHead(resolvedPath, Math.min(fileStat.size, 64 * 1024));

  rejectHtmlLikeContent(header);

  const parseWarnings = [];
  const tailData = await readRecognizableTail(resolvedPath, fileStat.size, tailWindowsBytes);
  rejectHtmlLikeContent(tailData.text);

  const tailFields = parseTailFields(tailData.text, parseWarnings);
  const structural = await scanStructuralMarkers(resolvedPath, parseWarnings);
  const result = buildResult(tailFields, structural, inputContext, slicerContext, paramsFingerprint.slice_params, fileStat.size, gcodeSha256, parseWarnings);
  const validation = validateMetrics(result.values, parseWarnings);
  const parseStatus = "parsed";
  const missingFields = collectMissingFields(result.values);

  return {
    schema_version: "1.0",
    slicer: {
      name: slicerContext.name || "PrusaSlicer",
      package_version: slicerContext.package_version || null,
      banner_version: slicerContext.banner_version || tailFields.banner_version || null,
      binary_path: slicerContext.binary_path || null,
      profile_path: slicerContext.profile_path || null,
      profile_sha256: slicerContext.profile_sha256 || null,
    },
    slice_params: paramsFingerprint.slice_params,
    slice_params_json: paramsFingerprint.slice_params_json,
    slice_params_sha256: paramsFingerprint.slice_params_sha256,
    input: {
      file_id: inputContext.file_id ?? null,
      filename: inputContext.filename || basename(resolvedPath),
      path: inputContext.path || null,
      sha256: inputContext.sha256 || null,
      size_bytes: inputContext.size_bytes ?? null,
      dimensions: result.values.dimensions,
    },
    slice: {
      started_at: sliceContext.started_at || null,
      finished_at: sliceContext.finished_at || null,
      duration_ms: sliceContext.duration_ms ?? null,
      exit_code: sliceContext.exit_code ?? null,
    },
    result: result.values,
    metric_sources: result.sources,
    metric_sources_json: canonicalJson(result.sources),
    validation,
    metric_validation_json: canonicalJson(validation),
    parse: {
      status: parseStatus,
      parser_version: options.parserVersion || PARSER_VERSION,
      missing_fields: missingFields,
      warnings: [...new Set([...parseWarnings, ...validation.warnings])],
      tail_window_bytes: tailData.windowBytes,
    },
  };
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");

  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });

  return hash.digest("hex");
}

async function assertAllowedFile(filePath, allowedRoots) {
  const actualPath = await realpath(filePath);
  const actualRoots = await Promise.all(
    allowedRoots.map(async (root) => {
      try {
        return await realpath(root);
      } catch {
        return resolve(root);
      }
    }),
  );

  if (!actualRoots.some((root) => isInsideRoot(root, actualPath))) {
    throw new Error("G-code path escapes allowed roots");
  }

  return actualPath;
}

function isInsideRoot(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep) && !isAbsolute(rel));
}

async function readHead(filePath, bytesToRead) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function readRecognizableTail(filePath, fileSize, windows) {
  let latest = { text: "", windowBytes: 0 };

  for (const windowBytes of windows) {
    const bytesToRead = Math.min(windowBytes, fileSize);
    const start = Math.max(0, fileSize - bytesToRead);
    const handle = await open(filePath, "r");
    try {
      const buffer = Buffer.alloc(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, start);
      const text = buffer.subarray(0, bytesRead).toString("utf8");
      latest = { text, windowBytes: bytesToRead };
      if (/filament used \[mm\]|estimated printing time|prusaslicer_config = end/i.test(text)) {
        return latest;
      }
    } finally {
      await handle.close();
    }
  }

  return latest;
}

function rejectHtmlLikeContent(text) {
  const prefix = text.slice(0, 4096).toLowerCase();
  if (/<html|<!doctype|bad gateway|<body|<\/html>/.test(prefix)) {
    throw new Error("G-code file looks like HTML or an error page");
  }
}

function parseTailFields(text, warnings) {
  const fields = {
    config: {},
    stats: {},
    banner_version: null,
    duplicateKeys: new Set(),
  };
  const seenKeys = new Set();
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    if (Buffer.byteLength(rawLine, "utf8") > MAX_COMMENT_LINE_BYTES) {
      warnings.push("very long comment line skipped");
      continue;
    }

    const line = rawLine.trim();
    if (!line.startsWith(";")) continue;

    const bannerMatch = line.match(/^;\s*generated by\s+(PrusaSlicer\s+[^\s]+).*/i);
    if (bannerMatch) {
      fields.banner_version = bannerMatch[1];
    }

    const keyValueMatch = line.match(/^;\s*([^=]+?)\s*=\s*(.*)$/);
    if (!keyValueMatch) continue;

    const key = keyValueMatch[1].trim();
    const normalizedKey = key.toLowerCase();
    const value = keyValueMatch[2].trim();

    if (seenKeys.has(normalizedKey)) {
      fields.duplicateKeys.add(normalizedKey);
    }
    seenKeys.add(normalizedKey);

    if (normalizedKey === "filament used [mm]") {
      fields.stats.filamentLengthMmValues = parseDecimalList(value, key, warnings);
      fields.stats.filamentLengthMm = sumDecimalList(fields.stats.filamentLengthMmValues);
    } else if (normalizedKey === "filament used [cm3]") {
      fields.stats.filamentVolumeCm3Values = parseDecimalList(value, key, warnings);
      fields.stats.filamentVolumeCm3 = sumDecimalList(fields.stats.filamentVolumeCm3Values);
    } else if (normalizedKey === "filament used [g]" || normalizedKey === "total filament used [g]") {
      fields.stats.filamentWeightGValues = parseDecimalList(value, key, warnings);
      fields.stats.filamentWeightG = sumDecimalList(fields.stats.filamentWeightGValues);
      fields.stats.filamentWeightKey = normalizedKey;
    }
    else if (normalizedKey === "estimated printing time (normal mode)") {
      fields.stats.printTimeSeconds = parseDurationWithWarning(value, key, warnings);
    } else if (normalizedKey === "estimated printing time (silent mode)") {
      fields.stats.silentPrintTimeSeconds = parseDurationWithWarning(value, key, warnings);
    } else if ([
      "filament_type",
      "printer_model",
      "nozzle_diameter",
      "layer_height",
      "fill_density",
      "filament_density",
      "filament_diameter",
    ].includes(normalizedKey)) {
      fields.config[normalizedKey] = value;
    }
  }

  if (fields.duplicateKeys.size) {
    warnings.push(`duplicate fields encountered: ${[...fields.duplicateKeys].sort().join(", ")}`);
  }

  return fields;
}

function parseDecimal(value, key, warnings) {
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
    warnings.push(`invalid decimal for ${key}: ${value}`);
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    warnings.push(`non-finite decimal for ${key}: ${value}`);
    return null;
  }

  return parsed;
}

function parseDecimalList(value, key, warnings) {
  const parts = String(value || "").split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    warnings.push(`invalid decimal for ${key}: ${value}`);
    return [];
  }
  return parts
    .map((part) => parseDecimal(part, key, warnings))
    .filter((parsed) => parsed != null);
}

function sumDecimalList(values) {
  if (!Array.isArray(values) || !values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function parseDurationWithWarning(value, key, warnings) {
  const parsed = parseDurationToSeconds(value);
  if (parsed.warning) {
    warnings.push(`${key}: ${parsed.warning}`);
  }
  return parsed.seconds;
}

async function scanStructuralMarkers(filePath, warnings) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let layerCount = 0;
  let maxLayerZMicrons = null;
  const bounds = {
    x_min: null,
    x_max: null,
    y_min: null,
    y_max: null,
    z_min: null,
    z_max: null,
  };

  try {
    for await (const line of reader) {
      if (line.startsWith(";LAYER_CHANGE")) {
        layerCount += 1;
        continue;
      }

      if (line.startsWith(";Z:")) {
        const value = line.slice(3).trim();
        const parsed = parseDecimal(value, "Z marker", warnings);
        if (parsed != null) {
          const microns = decimalToInteger(parsed, 1000);
          maxLayerZMicrons = maxLayerZMicrons == null ? microns : Math.max(maxLayerZMicrons, microns);
        }
      }

      updateGcodeBounds(bounds, line, warnings);
    }
  } finally {
    reader.close();
  }

  return {
    layer_count: layerCount || null,
    max_layer_z_microns: maxLayerZMicrons,
    gcode_bounds: buildDimensionsFromBounds(bounds),
  };
}

function updateGcodeBounds(bounds, line, warnings) {
  if (!/^(?:G0|G1)\b/i.test(line)) return;
  const stripped = line.split(";")[0];
  for (const axis of ["X", "Y", "Z"]) {
    const match = new RegExp(`\\b${axis}([+-]?\\d+(?:\\.\\d+)?)`, "i").exec(stripped);
    if (!match) continue;
    const parsed = parseDecimal(match[1], `${axis} move`, warnings);
    if (parsed == null || Math.abs(parsed) > 1_000_000) continue;
    const minKey = `${axis.toLowerCase()}_min`;
    const maxKey = `${axis.toLowerCase()}_max`;
    bounds[minKey] = bounds[minKey] == null ? parsed : Math.min(bounds[minKey], parsed);
    bounds[maxKey] = bounds[maxKey] == null ? parsed : Math.max(bounds[maxKey], parsed);
  }
}

function buildDimensionsFromBounds(bounds) {
  const x = finiteDimension(bounds.x_min, bounds.x_max);
  const y = finiteDimension(bounds.y_min, bounds.y_max);
  const z = Number.isFinite(bounds.z_max) && bounds.z_max >= 0 ? roundMm(bounds.z_max) : null;
  if (x == null && y == null && z == null) return null;
  return { x_mm: x, y_mm: y, z_mm: z, source: SOURCE.gcodeBounds };
}

function finiteDimension(min, max) {
  if (min == null || max == null) return null;
  const value = max - min;
  if (!Number.isFinite(value) || value < 0) return null;
  return roundMm(value);
}

function buildResult(fields, structural, inputContext, slicerContext, sliceParams, gcodeSizeBytes, gcodeSha256, warnings) {
  const weight = resolveFilamentWeight(fields, sliceParams, warnings);
  const dimensions = resolveDimensions(structural, inputContext);
  const values = {
    print_time_seconds: fields.stats.printTimeSeconds ?? null,
    silent_print_time_seconds: fields.stats.silentPrintTimeSeconds ?? null,
    filament_length_microns: convertMetric(fields.stats.filamentLengthMm, 1000),
    filament_volume_mm3: convertMetric(fields.stats.filamentVolumeCm3, 1000),
    filament_weight_mg: weight.mg,
    layer_count: structural.layer_count,
    max_layer_z_microns: structural.max_layer_z_microns,
    dimensions,
    filament_type: fields.config.filament_type || null,
    printer_model: fields.config.printer_model || null,
    nozzle_diameter_microns: convertMetric(
      parseConfigDecimal(fields.config.nozzle_diameter, "nozzle_diameter", warnings),
      1000,
    ),
    layer_height_microns: convertMetric(parseConfigDecimal(fields.config.layer_height, "layer_height", warnings), 1000),
    gcode_size_bytes: gcodeSizeBytes,
    gcode_sha256: gcodeSha256,
  };

  const sources = {
    print_time_source: sourceFor(values.print_time_seconds, SOURCE.gcodeTailStat),
    filament_length_source: sourceFor(values.filament_length_microns, SOURCE.gcodeTailStat),
    filament_volume_source: sourceFor(values.filament_volume_mm3, SOURCE.gcodeTailStat),
    filament_weight_source: weight.source,
    layer_count_source: sourceFor(values.layer_count, SOURCE.derivedLayerMarkers),
    max_layer_z_source: sourceFor(values.max_layer_z_microns, SOURCE.derivedZMarkers),
    dimensions_source: dimensions?.source || SOURCE.unavailable,
    filament_type_source: fields.config.filament_type ? SOURCE.gcodeConfig : SOURCE.missing,
    printer_model_source: fields.config.printer_model ? SOURCE.gcodeConfig : SOURCE.missing,
    nozzle_diameter_source: fields.config.nozzle_diameter ? SOURCE.gcodeConfig : SOURCE.missing,
    layer_height_source: fields.config.layer_height ? SOURCE.gcodeConfig : SOURCE.missing,
    profile_identity_source: slicerContext.profile_sha256 ? "profile_sha256" : SOURCE.missing,
  };

  if (values.layer_count != null) {
    warnings.push("layer_count derived from LAYER_CHANGE markers");
  }
  if (values.max_layer_z_microns != null) {
    warnings.push("max_layer_z_microns derived from Z markers");
  }

  return { values, sources };
}

function resolveFilamentWeight(fields, sliceParams, warnings) {
  const direct = sanitizeWeightGrams(fields.stats.filamentWeightG);
  if (direct.ok && direct.grams > 0) {
    return { mg: decimalToInteger(direct.grams, 1000), source: SOURCE.gcodeDirect };
  }
  if (fields.stats.filamentWeightG != null) {
    warnings.push(
      fields.stats.filamentWeightG === 0
        ? "explicit filament weight is zero; attempting length/density calculation"
        : "explicit filament weight is invalid; attempting length/density calculation",
    );
  }

  const calculated = calculateWeightFromLengthDensity(fields, sliceParams, warnings);
  if (calculated != null) {
    return { mg: decimalToInteger(calculated, 1000), source: SOURCE.calculatedFromLengthDensity };
  }
  return { mg: null, source: SOURCE.unavailable };
}

function sanitizeWeightGrams(value) {
  if (value == null || !Number.isFinite(value) || value <= 0 || value > MAX_REASONABLE_FILAMENT_WEIGHT_G) {
    return { ok: false, grams: null };
  }
  return { ok: true, grams: value };
}

function calculateWeightFromLengthDensity(fields, sliceParams, warnings) {
  const lengths = fields.stats.filamentLengthMmValues || [];
  if (!lengths.length) return null;
  const diameters = parseConfigDecimalList(fields.config.filament_diameter, "filament_diameter", warnings);
  const densities = resolveDensityValues(fields, sliceParams, warnings);
  if (!diameters.length || !densities.length) return null;

  let grams = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const lengthMm = lengths[index];
    const diameterMm = pickIndexedValue(diameters, index);
    const densityGcm3 = pickIndexedValue(densities, index);
    if (!Number.isFinite(lengthMm) || lengthMm < 0 || !Number.isFinite(diameterMm) || diameterMm <= 0 || !Number.isFinite(densityGcm3) || densityGcm3 <= 0) {
      return null;
    }
    const radiusMm = diameterMm / 2;
    const volumeMm3 = Math.PI * radiusMm * radiusMm * lengthMm;
    grams += (volumeMm3 / 1000) * densityGcm3;
  }

  if (!Number.isFinite(grams) || grams <= 0 || grams > MAX_REASONABLE_FILAMENT_WEIGHT_G) {
    warnings.push("calculated filament weight is outside the allowed range");
    return null;
  }
  return grams;
}

function resolveDensityValues(fields, sliceParams, warnings) {
  const parsed = parseConfigDecimalList(fields.config.filament_density, "filament_density", warnings).filter((value) => value > 0);
  if (parsed.length) return parsed;
  const material = String(sliceParams?.material || fields.config.filament_type || "").split(",")[0].trim().toUpperCase();
  const fallback = MATERIAL_DENSITY_G_CM3[material];
  if (fallback) {
    warnings.push(`filament_density unavailable; used material default density for ${material}`);
    return [fallback];
  }
  return [];
}

function parseConfigDecimalList(value, key, warnings) {
  if (value == null) return [];
  return parseDecimalList(value, key, warnings);
}

function pickIndexedValue(values, index) {
  return values[index] ?? values[0];
}

function resolveDimensions(structural, inputContext = {}) {
  const gcode = structural.gcode_bounds;
  const cloud = normalizeCloudDimensions(inputContext.dimensions || inputContext);
  if (hasCompleteDimensions(gcode)) return normalizeDimensions(gcode, SOURCE.gcodeBounds);
  if (hasAnyDimension(cloud)) return normalizeDimensions(cloud, SOURCE.cloudFileGeometry);
  if (hasAnyDimension(gcode)) return normalizeDimensions(gcode, SOURCE.gcodeBounds);
  return { x_mm: null, y_mm: null, z_mm: null, source: SOURCE.unavailable };
}

function normalizeCloudDimensions(value = {}) {
  return {
    x_mm: firstFiniteNumber(value.x_mm, value.x, value.bounding_box_x, value.boundingBoxX),
    y_mm: firstFiniteNumber(value.y_mm, value.y, value.bounding_box_y, value.boundingBoxY),
    z_mm: firstFiniteNumber(value.z_mm, value.z, value.bounding_box_z, value.boundingBoxZ),
  };
}

function normalizeDimensions(value, source) {
  return {
    x_mm: roundMm(value.x_mm),
    y_mm: roundMm(value.y_mm),
    z_mm: roundMm(value.z_mm),
    source,
  };
}

function hasAnyDimension(value) {
  return Boolean(value && [value.x_mm, value.y_mm, value.z_mm].some((item) => Number.isFinite(item) && item > 0));
}

function hasCompleteDimensions(value) {
  return Boolean(value && [value.x_mm, value.y_mm, value.z_mm].every((item) => Number.isFinite(item) && item > 0));
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function roundMm(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1000) / 1000;
}

function convertMetric(value, multiplier) {
  if (value == null) return null;
  return decimalToInteger(value, multiplier);
}

function parseConfigDecimal(value, key, warnings) {
  if (value == null) return null;
  return parseDecimal(value, key, warnings);
}

function decimalToInteger(value, multiplier) {
  return Math.round(value * multiplier);
}

function sourceFor(value, presentSource) {
  return value == null ? SOURCE.missing : presentSource;
}

function validateMetrics(values, parseWarnings) {
  const invalidFields = [];
  const warningDetails = [];

  if (values.print_time_seconds == null || values.print_time_seconds <= 0) {
    invalidFields.push("print_time_seconds");
    warningDetails.push(createWarning("MISSING_PRINT_TIME", WARNING_SEVERITY.blocking, "print_time_seconds is required"));
  }

  if (values.gcode_size_bytes == null || values.gcode_size_bytes <= 0) {
    invalidFields.push("gcode_size_bytes");
    warningDetails.push(createWarning("MISSING_GCODE_SIZE", WARNING_SEVERITY.blocking, "gcode_size_bytes is required"));
  }

  if (!/^[a-f0-9]{64}$/.test(String(values.gcode_sha256 || ""))) {
    invalidFields.push("gcode_sha256");
    warningDetails.push(createWarning("INVALID_GCODE_SHA", WARNING_SEVERITY.blocking, "gcode_sha256 is required"));
  }

  if (values.filament_weight_mg == null || values.filament_weight_mg <= 0) {
    invalidFields.push("filament_weight_mg");
    warningDetails.push(createWarning("MISSING_FILAMENT_WEIGHT", WARNING_SEVERITY.blocking, "material weight is required"));
  } else if (values.filament_weight_mg > MAX_REASONABLE_FILAMENT_WEIGHT_G * 1000) {
    invalidFields.push("filament_weight_mg");
    warningDetails.push(createWarning("FILAMENT_WEIGHT_OUT_OF_RANGE", WARNING_SEVERITY.blocking, "material weight is outside allowed range"));
  }

  if (!hasAnyDimension(values.dimensions)) {
    warningDetails.push(createWarning("DIMENSIONS_UNAVAILABLE", WARNING_SEVERITY.manualReviewRequired, "model dimensions are unavailable"));
  } else if (values.dimensions?.source === SOURCE.cloudFileGeometry) {
    warningDetails.push(createWarning("DIMENSIONS_FROM_UPLOAD_GEOMETRY", WARNING_SEVERITY.manualReviewRequired, "dimensions come from upload geometry, not G-code bounds"));
  }

  for (const warning of parseWarnings) {
    warningDetails.push(createWarning("PARSER_NOTE", WARNING_SEVERITY.nonBlocking, warning));
  }

  const dedupedDetails = dedupeWarnings(warningDetails);
  const metricsStatus = invalidFields.length
    ? "error"
    : dedupedDetails.some((warning) => warning.severity !== WARNING_SEVERITY.nonBlocking)
      ? "warning"
      : "ok";

  return {
    metrics_status: metricsStatus,
    quote_ready: invalidFields.length === 0,
    invalid_fields: [...new Set(invalidFields)],
    warnings: dedupedDetails.map((warning) => `${warning.severity}:${warning.code}:${warning.message}`),
    warning_details: dedupedDetails,
  };
}

function createWarning(code, severity, message) {
  return { code, severity, message };
}

function dedupeWarnings(warnings) {
  const seen = new Set();
  return warnings.filter((warning) => {
    const key = `${warning.severity}:${warning.code}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectMissingFields(values) {
  return Object.entries(values)
    .filter(([, value]) => value == null)
    .map(([key]) => key);
}

function normalizeString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}
