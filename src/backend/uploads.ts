import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { basename, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { inspectModelFile, type ModelSourceFormat, type StepPart21Metadata } from "./modelFileValidation.ts";

const MODEL_EXTENSIONS = [".stl", ".step", ".stp"];
const REQUEST_ATTACHMENT_EXTENSIONS = [
  ...MODEL_EXTENSIONS,
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".dxf",
  ".dwg",
  ".zip",
  ".rar",
  ".7z",
];

const ALLOWED_EXTENSIONS = new Set(MODEL_EXTENSIONS);
const ALLOWED_REQUEST_ATTACHMENT_EXTENSIONS = new Set(REQUEST_ATTACHMENT_EXTENSIONS);

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type UploadLike = {
  name: string;
  size: number;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type SavedUpload = {
  originalFilename?: string;
  filename: string;
  filepath: string;
  filesize: number;
  sourceFormat?: ModelSourceFormat;
  sourceSha256?: string;
  validationStatus?: "valid";
  validationDetail?: string;
  stepMetadata?: StepPart21Metadata;
};

export type DeletedUploadArtifacts = {
  deletedCount: number;
  skipped: string[];
  failed: string[];
};

export function getUploadDir() {
  return process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
}

export function getGcodeDir() {
  return process.env.GCODE_DIR || join(process.cwd(), "gcode");
}

export function getUploadCleanupFailureLogPath() {
  return process.env.UPLOAD_CLEANUP_LOG_PATH || join(process.cwd(), "data", "upload-cleanup-failures.jsonl");
}

export function isAllowedUploadFilename(filename: string) {
  return ALLOWED_EXTENSIONS.has(extname(filename).toLowerCase());
}

export async function saveUploadFile(file: UploadLike, uploadDir = getUploadDir()): Promise<SavedUpload> {
  if (!isAllowedUploadFilename(file.name)) {
    throw new Error("仅支持 STL、STEP、STP 文件");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("文件大小不能超过 50MB");
  }

  await mkdir(uploadDir, { recursive: true });

  const extension = extname(file.name).toLowerCase();
  const safeBaseName = file.name
    .slice(0, -extension.length)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 80);
  const filename = `${Date.now()}-${randomUUID()}-${safeBaseName || "model"}${extension}`;
  const filepath = join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) {
    throw new Error("模型文件大小校验失败");
  }
  const inspection = inspectModelFile(file.name, buffer, file.type);

  await writeFile(filepath, buffer);

  return {
    originalFilename: file.name,
    filename,
    filepath,
    filesize: file.size,
    sourceFormat: inspection.sourceFormat,
    sourceSha256: inspection.sourceSha256,
    validationStatus: inspection.validationStatus,
    validationDetail: inspection.validationDetail,
    stepMetadata: inspection.stepMetadata,
  };
}

export async function validateSavedUploadReference(
  upload: SavedUpload,
  uploadDir = getUploadDir(),
) {
  if (!isAllowedUploadFilename(upload.filename)) {
    throw new Error("文件格式暂不支持");
  }

  if (!upload.filename || basename(upload.filename) !== upload.filename) {
    throw new Error("文件信息无效");
  }

  if (!upload.filepath || basename(upload.filepath) !== upload.filename) {
    throw new Error("文件信息无效");
  }

  const resolvedUploadDir = resolve(uploadDir);
  const resolvedFilePath = resolve(upload.filepath);

  if (
    resolvedFilePath !== join(resolvedUploadDir, upload.filename) ||
    !resolvedFilePath.startsWith(`${resolvedUploadDir}${sep}`)
  ) {
    throw new Error("文件信息无效");
  }

  const fileStat = await stat(resolvedFilePath);

  if (!fileStat.isFile() || fileStat.size !== upload.filesize) {
    throw new Error("文件信息无效或已失效，请重新上传");
  }

  const buffer = await readFile(resolvedFilePath);
  const inspection = inspectModelFile(upload.filename, buffer);
  return { ...upload, ...inspection };
}

export async function deleteSavedUploadArtifacts(upload: Pick<SavedUpload, "filename" | "filepath">) {
  const result: DeletedUploadArtifacts = {
    deletedCount: 0,
    skipped: [],
    failed: [],
  };

  if (!upload.filename || basename(upload.filename) !== upload.filename) {
    result.skipped.push("invalid-filename");
    return result;
  }

  const uploadPath = resolve(upload.filepath || "");
  const expectedUploadPath = resolve(join(getUploadDir(), upload.filename));
  const gcodePath = resolve(join(getGcodeDir(), `quote-${upload.filename}.gcode`));

  for (const item of [
    { path: uploadPath, root: getUploadDir(), label: "model" },
    { path: gcodePath, root: getGcodeDir(), label: "gcode" },
  ]) {
    if (item.label === "model" && uploadPath !== expectedUploadPath) {
      result.skipped.push(item.label);
      continue;
    }

    const deleted = await deleteFileInsideRoot(item.path, item.root, item.label);

    if (deleted === "deleted") {
      result.deletedCount += 1;
    } else if (deleted === "skipped") {
      result.skipped.push(item.label);
    } else {
      result.failed.push(item.label);
    }
  }

  if (result.failed.length > 0) {
    await recordUploadCleanupFailure({
      filename: upload.filename,
      failed: result.failed,
      skipped: result.skipped,
    });
  }

  return result;
}

export function isAllowedRequestAttachmentFilename(filename: string) {
  return ALLOWED_REQUEST_ATTACHMENT_EXTENSIONS.has(extname(filename).toLowerCase());
}

export async function saveRequestAttachmentFile(
  file: UploadLike,
  uploadDir = getUploadDir(),
): Promise<SavedUpload> {
  if (!isAllowedRequestAttachmentFilename(file.name)) {
    throw new Error("仅支持 STL、STEP、STP、PDF、JPG、PNG、DXF、DWG、ZIP 文件");
  }

  return saveFile(file, uploadDir);
}

async function saveFile(file: UploadLike, uploadDir: string): Promise<SavedUpload> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("文件大小不能超过 50MB");
  }

  await mkdir(uploadDir, { recursive: true });

  const extension = extname(file.name).toLowerCase();
  const safeBaseName = file.name
    .slice(0, -extension.length)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 80);
  const filename = `${Date.now()}-${randomUUID()}-${safeBaseName || "attachment"}${extension}`;
  const filepath = join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(filepath, buffer);

  return {
    filename,
    filepath,
    filesize: file.size,
  };
}

async function deleteFileInsideRoot(filePath: string, rootDir: string, label: string) {
  const resolvedRoot = resolve(rootDir);
  const resolvedPath = resolve(filePath);
  const relativePath = relative(resolvedRoot, resolvedPath);

  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    relativePath.includes(`..${sep}`) ||
    resolve(resolvedRoot, relativePath) !== resolvedPath
  ) {
    console.warn("Skipped unsafe upload artifact deletion", { label });
    return "skipped" as const;
  }

  try {
    const fileStat = await stat(resolvedPath).catch(() => null);

    if (!fileStat?.isFile()) {
      return "skipped" as const;
    }

    await rm(resolvedPath, { force: true });
    return "deleted" as const;
  } catch (error) {
    console.error("Failed to delete upload artifact", {
      label,
      error: error instanceof Error ? error.message : "unknown",
    });
    return "failed" as const;
  }
}

async function recordUploadCleanupFailure(record: {
  filename: string;
  failed: string[];
  skipped: string[];
}) {
  const logPath = getUploadCleanupFailureLogPath();
  const safeRecord = {
    createdAt: new Date().toISOString(),
    filename: basename(record.filename),
    failed: record.failed,
    skipped: record.skipped,
  };

  try {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify(safeRecord)}\n`, "utf8");
  } catch (error) {
    console.error("Failed to record upload cleanup failure", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
