import { createHash } from "node:crypto";
import { extname } from "node:path";

export type ModelSourceFormat = "STL" | "STEP";

export type ModelFileInspection = {
  sourceFormat: ModelSourceFormat;
  sourceSha256: string;
  validationStatus: "valid";
  validationDetail: string;
  stepMetadata?: StepPart21Metadata;
};

export type StepPart21Metadata = {
  schema: string | null;
  unit: "mm" | "cm" | "m" | "inch" | "unknown";
  entityCount: number;
  solidCount: number;
  closedShellCount: number;
  openShellCount: number;
  surfaceModelCount: number;
  advancedFaceCount: number;
  bSplineSurfaceCount: number;
};

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);
const MIME_TYPES_BY_FORMAT: Record<ModelSourceFormat, Set<string>> = {
  STL: new Set(["application/sla", "application/vnd.ms-pki.stl", "model/stl", "model/x.stl"]),
  STEP: new Set(["application/step", "application/x-step", "model/step", "model/stp"]),
};

export function inspectModelFile(filename: string, buffer: Buffer, mimeType = ""): ModelFileInspection {
  const sourceFormat = getModelSourceFormat(filename);
  if (!sourceFormat) {
    throw new Error("仅支持 STL、STEP、STP 文件");
  }
  if (buffer.length === 0) {
    throw new Error("模型文件为空");
  }

  validateMimeType(sourceFormat, mimeType);
  const validationDetail = sourceFormat === "STEP" ? validateStepPart21(buffer) : validateStlContent(buffer);
  const stepMetadata = sourceFormat === "STEP" ? inspectStepPart21Metadata(buffer) : undefined;

  return {
    sourceFormat,
    sourceSha256: createHash("sha256").update(buffer).digest("hex"),
    validationStatus: "valid",
    validationDetail,
    stepMetadata,
  };
}

export function getModelSourceFormat(filename: string): ModelSourceFormat | null {
  const extension = extname(filename).toLowerCase();
  if (extension === ".stl") return "STL";
  if (extension === ".step" || extension === ".stp") return "STEP";
  return null;
}

export function validateStepPart21(buffer: Buffer) {
  if (buffer.includes(0)) {
    throw new Error("STEP 文件包含无效的二进制空字符");
  }

  const source = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (!/^\s*ISO-10303-21\s*;/i.test(source)) {
    throw new Error("STEP 文件缺少 ISO-10303-21 起始标记");
  }
  if (!/\bHEADER\s*;/i.test(source) || !/\bDATA\s*;/i.test(source)) {
    throw new Error("STEP Part 21 缺少 HEADER 或 DATA 段");
  }
  if (!/#\d+\s*=\s*[A-Z0-9_]+\s*\(/i.test(source)) {
    throw new Error("STEP DATA 段未包含可识别实体");
  }
  if (!/END-ISO-10303-21\s*;\s*$/i.test(source)) {
    throw new Error("STEP 文件缺少 END-ISO-10303-21 结束标记");
  }
  return "STEP_PART21";
}

export function inspectStepPart21Metadata(buffer: Buffer): StepPart21Metadata {
  const source = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const schemaMatch = source.match(/FILE_SCHEMA\s*\(\s*\(\s*['"]([^'"]+)['"]/i);
  return {
    schema: schemaMatch?.[1]?.trim() || null,
    unit: detectStepLengthUnit(source),
    entityCount: countMatches(source, /#\d+\s*=\s*[A-Z0-9_]+\s*\(/gi),
    solidCount:
      countMatches(source, /\bMANIFOLD_SOLID_BREP\s*\(/gi) +
      countMatches(source, /\bBREP_WITH_VOIDS\s*\(/gi),
    closedShellCount: countMatches(source, /\bCLOSED_SHELL\s*\(/gi),
    openShellCount: countMatches(source, /\bOPEN_SHELL\s*\(/gi),
    surfaceModelCount: countMatches(source, /\bSHELL_BASED_SURFACE_MODEL\s*\(/gi),
    advancedFaceCount: countMatches(source, /\bADVANCED_FACE\s*\(/gi),
    bSplineSurfaceCount: countMatches(source, /\bB_SPLINE_SURFACE(?:_WITH_KNOTS)?\s*\(/gi),
  };
}

export function validateStlContent(buffer: Buffer) {
  if (isBinaryStl(buffer)) {
    return "STL_BINARY";
  }

  const source = buffer.toString("utf8").trim();
  if (
    /^solid(?:\s|$)/i.test(source) &&
    /\bfacet\s+normal\b/i.test(source) &&
    /\bouter\s+loop\b/i.test(source) &&
    /\bendfacet\b/i.test(source) &&
    /\bendsolid\b/i.test(source)
  ) {
    return "STL_ASCII";
  }

  throw new Error("STL 文件头或三角网格结构无效");
}

function isBinaryStl(buffer: Buffer) {
  if (buffer.length < 84) return false;
  const triangleCount = buffer.readUInt32LE(80);
  return triangleCount > 0 && 84 + triangleCount * 50 === buffer.length;
}

function validateMimeType(format: ModelSourceFormat, mimeType: string) {
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (GENERIC_MIME_TYPES.has(normalized)) return;
  if (!MIME_TYPES_BY_FORMAT[format].has(normalized)) {
    throw new Error(`${format} 文件扩展名与 MIME 类型不匹配`);
  }
}

function detectStepLengthUnit(source: string): StepPart21Metadata["unit"] {
  if (/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/i.test(source)) return "mm";
  if (/SI_UNIT\s*\(\s*\.CENTI\.\s*,\s*\.METRE\.\s*\)/i.test(source)) return "cm";
  if (/SI_UNIT\s*\(\s*\$\s*,\s*\.METRE\.\s*\)/i.test(source)) return "m";
  if (/CONVERSION_BASED_UNIT\s*\(\s*['"](?:INCH|IN)['"]/i.test(source)) return "inch";
  return "unknown";
}

function countMatches(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].length;
}
