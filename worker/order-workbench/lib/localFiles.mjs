import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

export const DEFAULT_LOCAL_FILES_ROOT = "/srv/make3d-worker/files";

export function validateSafeRelativePath(value) {
  const text = String(value || "").trim();
  if (!text) return { ok: false, reason: "empty-path" };
  if (text.includes("\0")) return { ok: false, reason: "null-byte" };
  if (text.includes("\\") || text.includes("//")) return { ok: false, reason: "slash" };
  if (text.includes("%")) return { ok: false, reason: "percent-encoded" };
  if (text.startsWith("/") || /^[A-Za-z]:[\\/]/.test(text)) return { ok: false, reason: "absolute-path" };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return { ok: false, reason: "protocol" };
  if (text.includes("/srv/") || text.startsWith("srv/")) return { ok: false, reason: "srv-path" };
  const parts = text.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    return { ok: false, reason: "unsafe-segment" };
  }
  return { ok: true, path: text };
}

export function resolveInsideRoot(rootDir, relativePath) {
  const safe = validateSafeRelativePath(relativePath);
  if (!safe.ok) return { ok: false, reason: safe.reason };

  const root = resolve(rootDir || DEFAULT_LOCAL_FILES_ROOT);
  const target = resolve(root, safe.path);
  const diff = relative(root, target);

  if (diff === "" || (!diff.startsWith("..") && !isAbsolute(diff))) {
    return { ok: true, path: target, relativePath: safe.path };
  }

  return { ok: false, reason: "root-escape" };
}

export async function verifyLocalFileMetadata(file, options = {}) {
  const rootDir = options.rootDir || DEFAULT_LOCAL_FILES_ROOT;
  const resolved = resolveInsideRoot(rootDir, file?.relative_path);
  if (!resolved.ok) {
    return { exists: false, size_matches: false, sha_matches: null, error: resolved.reason };
  }

  try {
    const fileStat = await stat(resolved.path);
    if (!fileStat.isFile()) {
      return { exists: false, size_matches: false, sha_matches: null, error: "not-file" };
    }
    const expectedSize = Number(file?.expected_size_bytes ?? file?.filesize ?? 0);
    return {
      exists: true,
      path: resolved.path,
      directory: dirname(resolved.path),
      size: fileStat.size,
      expected_size: expectedSize,
      size_matches: expectedSize > 0 ? fileStat.size === expectedSize : null,
      sha_matches: null,
      error: null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { exists: false, size_matches: false, sha_matches: null, error: "not-found" };
    }
    return { exists: false, size_matches: false, sha_matches: null, error: "stat-failed" };
  }
}

export async function verifyLocalFileSha256(file, options = {}) {
  const metadata = await verifyLocalFileMetadata(file, options);
  if (!metadata.exists || !metadata.path) return metadata;

  const expectedSha = String(file?.expected_sha256 || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSha)) {
    return { ...metadata, sha_matches: null, error: "missing-expected-sha256" };
  }

  const sha256 = await sha256File(metadata.path);
  return {
    ...metadata,
    sha256,
    sha_matches: sha256 === expectedSha,
    error: sha256 === expectedSha ? null : "sha256-mismatch",
  };
}

export async function openVerifiedFileDirectory(file, options = {}) {
  if (file?.sync_status !== "verified" && file?.sync_status !== "local_synced") {
    return { ok: false, reason: "sync-not-verified" };
  }

  const verified = await verifyLocalFileSha256(file, options);
  if (!verified.exists || !verified.size_matches || !verified.sha_matches || !verified.directory) {
    return { ok: false, reason: verified.error || "file-not-verified", verification: verified };
  }

  const openImpl = options.openImpl || openDirectoryWithSystem;
  await openImpl(verified.directory);
  return { ok: true, directory: verified.directory, verification: verified };
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

export async function openDirectoryWithSystem(directory) {
  await access(directory);
  const candidates = process.platform === "win32"
    ? [{ command: "explorer.exe", args: [directory] }]
    : [
        { command: "explorer.exe", args: [directory] },
        { command: "wslview", args: [directory] },
        { command: "xdg-open", args: [directory] },
      ];

  let lastError;
  for (const candidate of candidates) {
    try {
      await spawnAndWait(candidate.command, candidate.args);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("no opener available");
}

function spawnAndWait(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: "ignore",
      detached: true,
    });
    child.on("error", reject);
    child.on("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
}
