#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { classifyTestSubject } from "./lib/testClassification.mjs";

export const TARGET_FILE_ID = 25;
export const TARGET_ORDER_ID = 22;
export const CONFIRM_MARKER = "PHASE06_A3_BACKFILL_REAL_FILE_25";
export const DEFAULT_DB_PATH = process.env.DB_PATH || process.env.DATABASE_PATH || "/app/data/make3d.db";
export const DEFAULT_UPLOAD_ROOT = process.env.UPLOAD_DIR || resolve(process.cwd(), "uploads");

const RETRYABLE_SYNC_STATUSES = new Set(["pending", "locked", "downloaded", "verified", "local_synced", "failed"]);
const ACCEPTED_RISK_LEVELS = new Set(["", "none", "low"]);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    dbPath: DEFAULT_DB_PATH,
    uploadRoot: DEFAULT_UPLOAD_ROOT,
    fileId: null,
    confirmMarker: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db") {
      options.dbPath = requireNext(argv, ++index, arg);
    } else if (arg === "--upload-root") {
      options.uploadRoot = requireNext(argv, ++index, arg);
    } else if (arg === "--file-id") {
      const value = requireNext(argv, ++index, arg);
      if (!/^\d+$/.test(value)) throw new Error("file-id must be a single positive integer");
      options.fileId = Number(value);
    } else if (arg === "--confirm-marker") {
      options.confirmMarker = requireNext(argv, ++index, arg);
    } else if (arg === "--dry-run") {
      // Dry-run is the default. The flag is accepted for operator clarity.
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (options.fileId !== TARGET_FILE_ID) {
    throw new Error("refusing to operate on any file_id other than 25");
  }

  return options;
}

export async function runBackfill(options = {}) {
  const fileId = Number(options.fileId);
  if (fileId !== TARGET_FILE_ID) {
    throw new Error("refusing to operate on any file_id other than 25");
  }

  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const uploadRoot = options.uploadRoot || DEFAULT_UPLOAD_ROOT;
  const writeEnabled = options.confirmMarker === CONFIRM_MARKER;
  const db = new DatabaseSync(dbPath);

  try {
    const context = await validateCandidate(db, {
      fileId,
      uploadRoot,
    });

    if (context.existingJob) {
      return buildOutput({
        context,
        mode: writeEnabled ? "write" : "dry-run",
        alreadyExists: true,
        created: false,
        wouldCreate: false,
      });
    }

    if (!writeEnabled) {
      return buildOutput({
        context,
        mode: "dry-run",
        alreadyExists: false,
        created: false,
        wouldCreate: true,
      });
    }

    const created = createJobIdempotently(db, context);
    return buildOutput({
      context,
      mode: "write",
      alreadyExists: !created,
      created,
      wouldCreate: false,
    });
  } finally {
    db.close();
  }
}

export async function validateCandidate(db, options) {
  const row = db.prepare(`
    SELECT
      files.id AS file_id,
      files.order_id AS file_order_id,
      files.filename AS filename,
      files.filepath AS filepath,
      files.filesize AS filesize,
      files.material AS file_material,
      files.color AS file_color,
      files.quantity AS file_quantity,
      files.risk_level AS risk_level,
      files.requires_manual_confirmation AS requires_manual_confirmation,
      orders.id AS order_id,
      orders.order_no AS order_no,
      orders.customer_id AS customer_id,
      orders.material AS order_material,
      orders.color AS order_color,
      orders.quantity AS order_quantity,
      orders.status AS order_status,
      customers.id AS customer_row_id,
      customers.is_test_account AS customer_is_test_account,
      local_file_sync_jobs.id AS existing_sync_job_id,
      local_file_sync_jobs.sync_status AS existing_sync_status
    FROM files
    JOIN orders ON orders.id = files.order_id
    LEFT JOIN customers ON customers.id = orders.customer_id
    LEFT JOIN local_file_sync_jobs ON local_file_sync_jobs.file_id = files.id
    WHERE files.id = ?
  `).get(options.fileId);

  if (!row) throw new Error("target file was not found");
  if (Number(row.file_id) !== TARGET_FILE_ID) throw new Error("target file mismatch");
  if (Number(row.order_id) !== TARGET_ORDER_ID || Number(row.file_order_id) !== TARGET_ORDER_ID) {
    throw new Error("target file does not belong to approved order");
  }
  if (row.customer_id != null && row.customer_row_id == null) {
    throw new Error("customer relationship is inconsistent");
  }

  const testClassification = classifyTestSubject({
    customerId: row.customer_id,
    customerIsTestAccount: row.customer_is_test_account,
    sourceMarkers: [row.order_no, row.filename, row.filepath],
  });
  if (testClassification.isTest) {
    throw new Error("Target order is marked as TEST and is not eligible for real-file backfill.");
  }

  const extension = getExtension(row.filename || row.filepath);
  if (extension !== "stl") throw new Error("target file extension is not approved");

  if (!Number.isSafeInteger(Number(row.filesize)) || Number(row.filesize) <= 0) {
    throw new Error("filesize must be a positive integer");
  }

  const material = row.file_material || row.order_material;
  const color = row.file_color || row.order_color;
  const quantity = row.file_quantity || row.order_quantity;
  if (!material) throw new Error("material is missing");
  if (!color) throw new Error("color is missing");
  if (!quantity || Number(quantity) <= 0) throw new Error("quantity is missing");

  const riskLevel = String(row.risk_level || "").trim().toLowerCase();
  if (!ACCEPTED_RISK_LEVELS.has(riskLevel) || Number(row.requires_manual_confirmation) === 1) {
    throw new Error("target file risk level is not approved");
  }

  const existingJob = row.existing_sync_job_id == null ? null : {
    id: Number(row.existing_sync_job_id),
    syncStatus: String(row.existing_sync_status || ""),
  };
  if (existingJob && !RETRYABLE_SYNC_STATUSES.has(existingJob.syncStatus)) {
    throw new Error("existing sync job has an unsupported status");
  }

  const source = await validateSourceFile({
    filepath: row.filepath,
    filename: row.filename,
    expectedSize: Number(row.filesize),
    uploadRoot: options.uploadRoot,
  });

  return {
    fileId: Number(row.file_id),
    orderId: Number(row.order_id),
    customerId: row.customer_id == null ? null : Number(row.customer_id),
    orderNo: String(row.order_no || ""),
    orderMasked: maskOrderNo(row.order_no),
    format: extension,
    isTest: false,
    testClassification,
    originalFilename: String(row.filename || ""),
    storedFilename: source.storedFilename,
    relativePath: source.relativePath,
    fileSizeBytes: Number(row.filesize),
    sha256: source.sha256,
    shaPrefix: source.sha256.slice(0, 12),
    sourceChecks: {
      source_exists: true,
      source_regular_file: true,
      source_inside_upload_root: true,
      size_match: true,
      sha_available: true,
    },
    existingJob,
  };
}

export async function validateSourceFile(input) {
  const uploadRootReal = await realpath(resolve(input.uploadRoot));
  const sourcePath = await resolveSourcePath(input.filepath, uploadRootReal);
  const sourceLstat = await lstat(sourcePath).catch((error) => {
    if (error?.code === "ENOENT") throw new Error("source file does not exist");
    throw error;
  });

  if (!sourceLstat.isFile()) {
    throw new Error("source path is not a regular file");
  }

  const sourceReal = await realpath(sourcePath);
  assertInsideRoot(uploadRootReal, sourceReal);

  const sourceStat = await stat(sourceReal);
  if (!sourceStat.isFile()) throw new Error("source path is not a regular file");
  if (sourceStat.size !== Number(input.expectedSize)) {
    throw new Error("source file size does not match database filesize");
  }

  const storedFilename = basename(sourceReal);
  if (storedFilename !== basename(String(input.filename || ""))) {
    throw new Error("stored filename does not match source filepath basename");
  }

  const relativePath = normalizeRelativePath(relative(uploadRootReal, sourceReal));
  const sha256 = await sha256File(sourceReal);
  return {
    storedFilename,
    relativePath,
    sha256,
  };
}

export function createJobIdempotently(db, context) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = ?").get(context.fileId);
    if (existing) {
      db.exec("COMMIT");
      return false;
    }

    const result = db.prepare(`
      INSERT OR IGNORE INTO local_file_sync_jobs (
        file_id,
        order_id,
        customer_id,
        order_no,
        source_type,
        source_version,
        original_filename,
        stored_filename,
        relative_path,
        file_size_bytes,
        sha256,
        sync_status,
        attempt_count,
        schema_version,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'order_file', 'upload_v1', ?, ?, ?, ?, ?, 'pending', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      context.fileId,
      context.orderId,
      context.customerId,
      context.orderNo,
      context.originalFilename,
      context.storedFilename,
      context.relativePath,
      context.fileSizeBytes,
      context.sha256,
    );

    const count = db.prepare("SELECT COUNT(*) AS count FROM local_file_sync_jobs WHERE file_id = ?").get(context.fileId).count;
    if (Number(count) !== 1) {
      throw new Error("local_file_sync_jobs uniqueness invariant failed");
    }

    db.exec("COMMIT");
    return result.changes === 1;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function buildOutput({ context, mode, alreadyExists, created, wouldCreate }) {
  return {
    phase: "Phase06-A3-C1-RC-B",
    mode,
    file_id: context.fileId,
    order_id: context.orderId,
    order_masked: context.orderMasked,
    is_test: context.isTest,
    format: context.format,
    ...context.sourceChecks,
    sha_prefix: context.shaPrefix,
    existing_sync_job: Boolean(context.existingJob),
    existing_sync_status: context.existingJob?.syncStatus || null,
    would_create: Boolean(wouldCreate),
    created: Boolean(created),
    already_exists: Boolean(alreadyExists),
    sync_status: created ? "pending" : context.existingJob?.syncStatus || null,
  };
}

function requireNext(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

async function resolveSourcePath(rawPath, uploadRootReal) {
  const raw = String(rawPath || "");
  if (!raw || raw.includes("\0")) throw new Error("source filepath is invalid");

  const candidates = isAbsolute(raw)
    ? [resolve(raw)]
    : [
        resolve(uploadRootReal, raw),
        resolve(process.cwd(), raw),
        resolve(dirname(uploadRootReal), raw),
      ];

  for (const candidate of candidates) {
    try {
      await lstat(candidate);
      return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  return candidates[0];
}

function assertInsideRoot(root, target) {
  const diff = relative(root, target);
  if (!diff || diff.startsWith("..") || isAbsolute(diff) || diff.split(/[\\/]+/).includes("..")) {
    throw new Error("source file escapes upload root");
  }
  return target;
}

function normalizeRelativePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.includes("\0") ||
    normalized.includes("%") ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("relative_path is unsafe");
  }
  return normalized;
}

function getExtension(value) {
  const name = String(value || "").toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function maskOrderNo(value) {
  const text = String(value || "");
  if (text.length <= 7) return "***";
  return `${text.slice(0, 3)}***${text.slice(-4)}`;
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

async function main() {
  try {
    const output = await runBackfill(parseArgs());
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      phase: "Phase06-A3-C1-RC-B",
      error: sanitizeError(error),
    }, null, 2));
    process.exitCode = 1;
  }
}

function sanitizeError(error) {
  return String(error instanceof Error ? error.message : error || "backfill failed")
    .replace(/1[3-9]\d{9}/g, "[redacted-phone]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/[a-f0-9]{64}/gi, "[redacted-sha]")
    .slice(0, 300);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
