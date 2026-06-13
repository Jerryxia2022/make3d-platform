import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

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
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type SavedUpload = {
  filename: string;
  filepath: string;
  filesize: number;
};

export function getUploadDir() {
  return process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
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

  await writeFile(filepath, buffer);

  return {
    filename,
    filepath,
    filesize: file.size,
  };
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
