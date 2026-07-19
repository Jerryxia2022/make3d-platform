import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const openDirectoryScript = fileURLToPath(new URL("../open-directory.ps1", import.meta.url));

export const DEFAULT_LOCAL_FILES_ROOT = "/srv/make3d-worker/files";

export async function ensureLocalFilesRoot(rootDir = DEFAULT_LOCAL_FILES_ROOT) {
  const root = resolve(rootDir);
  await mkdir(root, { recursive: true, mode: 0o750 });
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) throw new Error("local files root is not a directory");
  return root;
}

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
    const canonical = await verifyCanonicalPathInsideRoot(rootDir, resolved.path);
    if (!canonical.ok) {
      return { exists: false, size_matches: false, sha_matches: null, error: canonical.reason };
    }
    const expectedSize = Number(file?.expected_size_bytes ?? file?.filesize ?? 0);
    return {
      exists: true,
      path: canonical.path,
      directory: dirname(canonical.path),
      size: fileStat.size,
      modified_at: fileStat.mtime.toISOString(),
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

async function verifyCanonicalPathInsideRoot(rootDir, targetPath) {
  try {
    const root = await realpath(resolve(rootDir || DEFAULT_LOCAL_FILES_ROOT));
    const target = await realpath(targetPath);
    const diff = relative(root, target);
    if (diff && !diff.startsWith("..") && !isAbsolute(diff)) {
      return { ok: true, path: target };
    }
    return { ok: false, reason: "root-escape" };
  } catch (error) {
    return { ok: false, reason: error?.code === "ENOENT" ? "not-found" : "realpath-failed" };
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

  const windowsPath = await toWindowsDirectoryPath(verified.directory).catch(() => null);
  const openImpl = options.openImpl || openDirectoryWithSystem;
  try {
    const openerResult = await openImpl(verified.directory, { windowsPath });
    const normalized = normalizeOpenDirectoryResult(openerResult);
    return {
      ok: normalized.status === "directory-focused",
      opened: ["directory-focused", "directory-opened-not-focused"].includes(normalized.status),
      ...normalized,
      directory: verified.directory,
      windowsPath,
      verification: verified,
    };
  } catch {
    return {
      ok: false,
      reason: "opener-unavailable",
      status: "directory-open-failed",
      message: "Windows 文件资源管理器调用失败",
      directory: verified.directory,
      windowsPath,
      verification: verified,
    };
  }
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

export async function openDirectoryWithSystem(directory, options = {}) {
  await access(directory);
  const windowsPath = options.windowsPath || await toWindowsDirectoryPath(directory).catch(() => null);
  const windowsScriptPath = process.platform === "win32"
    ? openDirectoryScript
    : await toWindowsPath(openDirectoryScript).catch(() => null);
  const wslInteropEnv = await getWslInteropChildEnv();
  const candidates = process.platform === "win32"
    ? [{ command: "explorer.exe", args: [directory], env: process.env, allowedExitCodes: [0], generic: true }]
    : windowsPath && windowsScriptPath
      ? [{
          command: "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
          args: [
            "-NoProfile",
            "-NonInteractive",
            "-File",
            windowsScriptPath,
            "-Target",
            windowsPath,
          ],
          env: wslInteropEnv,
          allowedExitCodes: [0],
          structured: true,
        }]
      : [
        { command: "wslview", args: [directory], env: process.env },
        { command: "xdg-open", args: [directory], env: process.env },
      ];

  let lastError;
  for (const candidate of candidates) {
    try {
      if (candidate.structured) {
        return await runStructuredDirectoryOpener(candidate.command, candidate.args, candidate.env);
      }
      await spawnAndWait(candidate.command, candidate.args, {
        env: candidate.env,
        allowedExitCodes: candidate.allowedExitCodes,
      });
      return candidate.generic ? { status: "directory-opened-not-focused", windowFound: null, restored: null, foregroundVerified: false } : undefined;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("no opener available");
}

async function runStructuredDirectoryOpener(command, args, env) {
  let stdout = "";
  try {
    const result = await execFileAsync(command, args, {
      env: env || process.env,
      timeout: 15_000,
      windowsHide: true,
      maxBuffer: 256 * 1024,
    });
    stdout = String(result.stdout || "");
  } catch (error) {
    stdout = String(error?.stdout || "");
    const parsed = parseStructuredDirectoryOutput(stdout);
    if (parsed) return parsed;
    throw error;
  }
  const parsed = parseStructuredDirectoryOutput(stdout);
  if (!parsed) throw new Error("Windows directory opener returned invalid output");
  return parsed;
}

function parseStructuredDirectoryOutput(stdout) {
  const lines = String(stdout || "").trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (value && typeof value.status === "string") return value;
    } catch {
      // Ignore PowerShell host noise and inspect the previous line.
    }
  }
  return null;
}

function normalizeOpenDirectoryResult(result) {
  if (!result || typeof result !== "object") {
    return { status: "directory-focused", windowFound: true, restored: false, foregroundVerified: true };
  }
  return {
    status: String(result.status || "directory-opened-not-focused"),
    message: result.message ? String(result.message) : null,
    windowFound: result.windowFound === true,
    openedNewWindow: result.openedNewWindow === true,
    restored: result.restored === true,
    foregroundVerified: result.foregroundVerified === true,
    targetHwnd: Number.isSafeInteger(Number(result.targetHwnd)) ? Number(result.targetHwnd) : null,
    foregroundHwnd: Number.isSafeInteger(Number(result.foregroundHwnd)) ? Number(result.foregroundHwnd) : null,
    locationUrl: result.locationUrl ? String(result.locationUrl) : null,
    diagnostics: normalizeOpenDirectoryDiagnostics(result.diagnostics),
  };
}

function normalizeOpenDirectoryDiagnostics(value) {
  if (!value || typeof value !== "object") return null;
  const safe = {};
  for (const key of [
    "windowsUser", "powershellProcessId", "powershellSessionId", "interactiveExplorerSessionId",
    "nonInteractiveServiceSession", "targetProcessId", "targetThreadId", "foregroundHwndBefore", "foregroundProcessIdBefore",
    "foregroundThreadIdBefore", "powershellThreadId", "setForegroundResult", "bringWindowToTopResult",
    "showWindowAsyncResult", "topmostResult", "notTopmostResult", "attachedForeground", "attachedTarget",
    "attachedTargetToForeground",
  ]) {
    if (key in value) safe[key] = value[key];
  }
  return safe;
}

async function getWslInteropChildEnv() {
  const candidates = [process.env.WSL_INTEROP, "/run/WSL/2_interop"].filter(Boolean);
  for (const socketPath of candidates) {
    try {
      await access(socketPath);
      return { ...process.env, WSL_INTEROP: socketPath };
    } catch {
      // Try the next known interop socket.
    }
  }
  return process.env;
}

export async function toWindowsDirectoryPath(directory) {
  if (process.platform === "win32") return directory;
  return toWindowsPath(directory);
}

async function toWindowsPath(value) {
  const result = await execFileAsync("/usr/bin/wslpath", ["-w", value], {
    timeout: 5_000,
    windowsHide: true,
  });
  const windowsPath = String(result.stdout || "").trim();
  if (!windowsPath) throw new Error("wslpath returned an empty path");
  return windowsPath;
}

function spawnAndWait(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: "ignore",
      detached: false,
      env: options.env || process.env,
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} did not exit after opening the directory`));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      const allowedExitCodes = options.allowedExitCodes || [0];
      if (allowedExitCodes.includes(code)) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
