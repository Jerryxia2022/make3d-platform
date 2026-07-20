import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";

import { inspectModelFile } from "./modelFileValidation.ts";
import { formatPrusaSlicerPath, type PrusaSlicerConfig } from "./slicer.ts";

export type DerivedStlArtifact = {
  filepath: string;
  filename: string;
  filesize: number;
  sha256: string;
  toolName: "PrusaSlicer";
  toolVersion: string;
  diagnostics: StepConversionDiagnostics;
};

export type PrusaModelInfo = {
  dimensions: { x: number; y: number; z: number };
  triangleCount: number;
  partCount: number;
  manifold: boolean | null;
  openEdgeCount: number;
  degenerateFacetCount: number;
  removedFacetCount: number;
  volumeMm3: number | null;
};

export type StepConversionDiagnostics = {
  reusedExisting: boolean;
  command: string;
  arguments: string[];
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  sourceInfo: PrusaModelInfo;
  preHealingInfo: PrusaModelInfo;
  derivedInfo: PrusaModelInfo;
  dimensionRatios: { x: number; y: number; z: number };
  healing: (ProcessResult & { arguments: string[] }) | null;
};

type ProcessResult = {
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
};

export function getDerivedModelDir() {
  return process.env.DERIVED_MODEL_DIR || join(process.cwd(), "derived-models");
}

export async function convertStepToStl(input: {
  sourceFilepath: string;
  sourceSha256: string;
  config: PrusaSlicerConfig;
  derivedDir?: string;
  toolVersion?: string;
}): Promise<DerivedStlArtifact> {
  if (![".step", ".stp"].includes(extname(input.sourceFilepath).toLowerCase())) {
    throw new Error("STEP conversion source must use .step or .stp");
  }
  if (!/^[a-f0-9]{64}$/i.test(input.sourceSha256)) {
    throw new Error("STEP conversion source SHA-256 is invalid");
  }

  const root = resolve(input.derivedDir || getDerivedModelDir());
  await mkdir(root, { recursive: true, mode: 0o750 });
  const filename = `${input.sourceSha256.toLowerCase()}.preview.stl`;
  const filepath = resolve(root, filename);
  if (filepath !== join(root, filename) || basename(filepath) !== filename) {
    throw new Error("Derived STL path is outside the configured root");
  }

  const startedAt = Date.now();
  const deadline = startedAt + input.config.timeoutSeconds * 1000;
  const sourcePath = formatPrusaSlicerPath(input.sourceFilepath, input.config.pathMode);
  const sourceInfo = await inspectModelWithPrusaSlicer(input.config, sourcePath, remainingTimeout(deadline));
  validatePrintableSource(sourceInfo);

  const existing = await inspectDerivedStl(filepath).catch(() => null);
  if (existing) {
    const derivedPath = formatPrusaSlicerPath(filepath, input.config.pathMode);
    const prepared = await inspectAndHealDerived({
      config: input.config,
      sourceInfo,
      filepath,
      formattedFilepath: derivedPath,
      root,
      sourceSha256: input.sourceSha256,
      deadline,
    });
    const derivedInfo = prepared.derivedInfo;
    const dimensionRatios = validateStepConversionGeometry(sourceInfo, derivedInfo);
    return {
      ...prepared.artifact,
      toolName: "PrusaSlicer",
      toolVersion: input.toolVersion || "unknown",
      diagnostics: {
        reusedExisting: true,
        command: input.config.bin,
        arguments: ["--info", derivedPath],
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: "",
        sourceInfo,
        preHealingInfo: prepared.preHealingInfo,
        derivedInfo,
        dimensionRatios,
        healing: prepared.healing,
      },
    };
  }

  const temporaryPath = join(root, `${input.sourceSha256}.${randomUUID()}.part.stl`);
  const convertedPath = formatPrusaSlicerPath(temporaryPath, input.config.pathMode);
  const conversionArgs = [
    ...input.config.commandPrefixArgs,
    ...buildStepToStlArgs(sourcePath, convertedPath),
  ];
  try {
    const conversion = await spawnWithTimeout(
      input.config.bin,
      conversionArgs,
      remainingTimeout(deadline),
    );
    await inspectDerivedStl(temporaryPath);
    const prepared = await inspectAndHealDerived({
      config: input.config,
      sourceInfo,
      filepath: temporaryPath,
      formattedFilepath: convertedPath,
      root,
      sourceSha256: input.sourceSha256,
      deadline,
    });
    const derivedInfo = prepared.derivedInfo;
    const dimensionRatios = validateStepConversionGeometry(sourceInfo, derivedInfo);
    await chmod(temporaryPath, 0o640);
    await rename(temporaryPath, filepath);
    return {
      ...prepared.artifact,
      filepath,
      filename,
      toolName: "PrusaSlicer",
      toolVersion: input.toolVersion || "unknown",
      diagnostics: {
        reusedExisting: false,
        command: input.config.bin,
        arguments: conversionArgs,
        exitCode: conversion.exitCode,
        durationMs: Date.now() - startedAt,
        stdout: conversion.stdout,
        stderr: conversion.stderr,
        sourceInfo,
        preHealingInfo: prepared.preHealingInfo,
        derivedInfo,
        dimensionRatios,
        healing: prepared.healing,
      },
    };
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function buildStepToStlArgs(sourceFilepath: string, outputFilepath: string) {
  return ["--export-stl", "--output", outputFilepath, sourceFilepath];
}

export function parsePrusaSlicerModelInfo(source: string): PrusaModelInfo {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([a-z_]+)\s*=\s*(.*?)\s*$/i);
    if (match) values.set(match[1].toLowerCase(), match[2]);
  }

  const dimensions = {
    x: readRequiredNumber(values, "size_x"),
    y: readRequiredNumber(values, "size_y"),
    z: readRequiredNumber(values, "size_z"),
  };
  return {
    dimensions,
    triangleCount: readRequiredInteger(values, "number_of_facets"),
    partCount: readRequiredInteger(values, "number_of_parts"),
    manifold: values.has("manifold") ? values.get("manifold")?.toLowerCase() === "yes" : null,
    openEdgeCount: readOptionalInteger(values, "open_edges"),
    degenerateFacetCount: readOptionalInteger(values, "degenerate_facets"),
    removedFacetCount: readOptionalInteger(values, "facets_removed"),
    volumeMm3: readOptionalNumber(values, "volume"),
  };
}

export function validateStepConversionGeometry(source: PrusaModelInfo, derived: PrusaModelInfo) {
  if (derived.partCount < source.partCount) {
    throw new StepConversionError("STEP_ENTITY_LOSS", "STEP 转换后实体数量减少，已停止自动报价。");
  }
  if (derived.triangleCount <= 0) {
    throw new StepConversionError("STEP_EMPTY_MESH", "STEP 文件中未检测到可打印实体。");
  }

  const dimensionRatios = {
    x: dimensionRatio(source.dimensions.x, derived.dimensions.x),
    y: dimensionRatio(source.dimensions.y, derived.dimensions.y),
    z: dimensionRatio(source.dimensions.z, derived.dimensions.z),
  };
  if (Object.values(dimensionRatios).some((ratio) => Math.abs(ratio - 1) > 0.001)) {
    throw new StepConversionError(
      "STEP_DIMENSION_MISMATCH",
      "模型转换后尺寸异常，请确认导出单位。",
    );
  }
  return dimensionRatios;
}

async function inspectAndHealDerived(input: {
  config: PrusaSlicerConfig;
  sourceInfo: PrusaModelInfo;
  filepath: string;
  formattedFilepath: string;
  root: string;
  sourceSha256: string;
  deadline: number;
}) {
  const preHealingInfo = await inspectModelWithPrusaSlicer(
    input.config,
    input.formattedFilepath,
    remainingTimeout(input.deadline),
  );
  validateStepConversionGeometry(input.sourceInfo, preHealingInfo);
  if (!requiresMeshHealing(preHealingInfo)) {
    return {
      artifact: await inspectDerivedStl(input.filepath),
      preHealingInfo,
      derivedInfo: preHealingInfo,
      healing: null,
    };
  }

  const healingPath = join(input.root, `${input.sourceSha256}.${randomUUID()}.healing.part.stl`);
  const formattedHealingPath = formatPrusaSlicerPath(healingPath, input.config.pathMode);
  const healingArgs = [
    ...input.config.commandPrefixArgs,
    ...buildStepToStlArgs(input.formattedFilepath, formattedHealingPath),
  ];
  try {
    const healingResult = await spawnWithTimeout(
      input.config.bin,
      healingArgs,
      remainingTimeout(input.deadline),
    );
    await inspectDerivedStl(healingPath);
    const derivedInfo = await inspectModelWithPrusaSlicer(
      input.config,
      formattedHealingPath,
      remainingTimeout(input.deadline),
    );
    validateStepConversionGeometry(input.sourceInfo, derivedInfo);
    if (requiresMeshHealing(derivedInfo)) {
      throw new StepConversionError(
        "STEP_TOPOLOGY_UNREPAIRABLE",
        "STEP 几何存在无法自动修复的拓扑错误。",
      );
    }
    await chmod(healingPath, 0o640);
    await rename(healingPath, input.filepath);
    return {
      artifact: await inspectDerivedStl(input.filepath),
      preHealingInfo,
      derivedInfo,
      healing: { ...healingResult, arguments: healingArgs },
    };
  } finally {
    await rm(healingPath, { force: true });
  }
}

export async function validateDerivedStlArtifact(input: {
  filepath: string;
  filesize: number | null;
  sha256: string | null;
  derivedDir?: string;
}) {
  const root = resolve(input.derivedDir || getDerivedModelDir());
  const filepath = resolve(input.filepath);
  const relativePath = relative(root, filepath);
  if (!relativePath || relativePath.startsWith("..") || resolve(root, relativePath) !== filepath) {
    throw new Error("Derived STL path is outside the configured root");
  }
  const artifact = await inspectDerivedStl(filepath);
  if (input.filesize != null && artifact.filesize !== input.filesize) {
    throw new Error("Derived STL size verification failed");
  }
  if (input.sha256 && artifact.sha256 !== input.sha256.toLowerCase()) {
    throw new Error("Derived STL SHA-256 verification failed");
  }
  return artifact;
}

async function inspectDerivedStl(filepath: string) {
  const fileStat = await stat(filepath);
  if (!fileStat.isFile() || fileStat.size <= 0) throw new Error("Derived STL is missing or empty");
  const buffer = await readFile(filepath);
  const inspection = inspectModelFile(filepath, buffer);
  if (inspection.sourceFormat !== "STL") throw new Error("Derived model is not STL");
  return {
    filepath,
    filename: basename(filepath),
    filesize: fileStat.size,
    sha256: inspection.sourceSha256,
  };
}

async function inspectModelWithPrusaSlicer(config: PrusaSlicerConfig, filepath: string, timeoutMs: number) {
  const result = await spawnWithTimeout(
    config.bin,
    [...config.commandPrefixArgs, "--info", filepath],
    timeoutMs,
  );
  try {
    return parsePrusaSlicerModelInfo(`${result.stdout}\n${result.stderr}`);
  } catch (error) {
    throw new StepConversionError(
      "STEP_MODEL_INFO_INVALID",
      error instanceof Error ? error.message : "PrusaSlicer 模型信息无法解析。",
    );
  }
}

function spawnWithTimeout(command: string, args: string[], timeoutMs: number) {
  return new Promise<ProcessResult>((resolvePromise, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise({
        exitCode: 0,
        durationMs: Date.now() - startedAt,
        stdout: sanitizeProcessOutput(stdout),
        stderr: sanitizeProcessOutput(stderr),
      });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new StepConversionError("STEP_CONVERSION_TIMEOUT", `模型过于复杂，自动处理超过 ${timeoutMs}ms。`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 16_384) stdout += decodeProcessChunk(chunk).slice(0, 16_384 - stdout.length);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += decodeProcessChunk(chunk).slice(0, 16_384 - stderr.length);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      finish(code === 0
        ? undefined
        : new StepConversionError(
            "STEP_CONVERSION_PROCESS_FAILED",
            `STEP 转换进程失败（退出码 ${code}）：${sanitizeProcessOutput(stderr)}`,
          ));
    });
  });
}

function validatePrintableSource(info: PrusaModelInfo) {
  if (info.partCount <= 0 || info.triangleCount <= 0 || (info.volumeMm3 != null && info.volumeMm3 <= 0)) {
    throw new StepConversionError("STEP_NO_PRINTABLE_SOLID", "STEP 文件中未检测到可打印实体。");
  }
}

function requiresMeshHealing(info: PrusaModelInfo) {
  return info.manifold === false || info.openEdgeCount > 0 || info.degenerateFacetCount > 0 || info.removedFacetCount > 0;
}

function dimensionRatio(source: number, derived: number) {
  if (![source, derived].every((value) => Number.isFinite(value) && value > 0)) {
    throw new StepConversionError("STEP_DIMENSION_MISSING", "模型转换前后尺寸无法完整识别。");
  }
  return Math.round((derived / source) * 1_000_000) / 1_000_000;
}

function remainingTimeout(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new StepConversionError("STEP_CONVERSION_TIMEOUT", "模型过于复杂，自动处理超时。");
  }
  return remaining;
}

function readRequiredNumber(values: Map<string, string>, key: string) {
  const value = Number(values.get(key));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`PrusaSlicer info missing ${key}`);
  return value;
}

function readRequiredInteger(values: Map<string, string>, key: string) {
  const value = Number(values.get(key));
  if (!Number.isInteger(value) || value < 0) throw new Error(`PrusaSlicer info missing ${key}`);
  return value;
}

function readOptionalInteger(values: Map<string, string>, key: string) {
  const value = Number(values.get(key) || 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function readOptionalNumber(values: Map<string, string>, key: string) {
  if (!values.has(key)) return null;
  const value = Number(values.get(key));
  return Number.isFinite(value) ? value : null;
}

function sanitizeProcessOutput(value: string) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 2_000);
}

function decodeProcessChunk(chunk: Buffer) {
  if (chunk.length >= 4) {
    let zeroOddBytes = 0;
    for (let index = 1; index < chunk.length; index += 2) {
      if (chunk[index] === 0) zeroOddBytes += 1;
    }
    if (zeroOddBytes >= Math.floor(chunk.length / 4)) return chunk.toString("utf16le");
  }
  return chunk.toString("utf8");
}

export class StepConversionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StepConversionError";
    this.code = code;
  }
}
