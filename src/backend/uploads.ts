import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

const ALLOWED_EXTENSIONS = new Set([".stl", ".step", ".stp", ".3mf"]);

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
    throw new Error("仅支持 STL、STEP、STP、3MF 文件");
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
