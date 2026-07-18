#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { classifyTestSubject } from "./lib/testClassification.mjs";

export const DEFAULT_DB_PATH = process.env.DB_PATH || process.env.DATABASE_PATH || "/app/data/make3d.db";
export const SUPPORTED_FORMATS = new Set(["stl", "3mf"]);
export const ACCEPTED_RISK_LEVELS = new Set(["", "none", "low"]);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { dbPath: DEFAULT_DB_PATH, limit: 10 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db") {
      options.dbPath = requireNext(argv, ++index, arg);
    } else if (arg === "--limit") {
      const value = requireNext(argv, ++index, arg);
      if (!/^\d+$/.test(value)) throw new Error("limit must be a positive integer");
      options.limit = Math.max(1, Math.min(Number(value), 50));
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

export function classifyRealFileCandidates(options = {}) {
  const db = new DatabaseSync(options.dbPath || DEFAULT_DB_PATH, { readOnly: true });
  db.exec("PRAGMA query_only=ON");
  db.exec("PRAGMA busy_timeout=10000");

  try {
    const rows = db.prepare(`
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
        customers.is_test_account AS customer_is_test_account,
        local_file_sync_jobs.id AS sync_job_id,
        local_file_sync_jobs.sync_status AS sync_status,
        local_file_sync_jobs.source_type AS sync_source_type,
        local_file_sync_jobs.source_version AS sync_source_version
      FROM files
      JOIN orders ON orders.id = files.order_id
      LEFT JOIN customers ON customers.id = orders.customer_id
      LEFT JOIN local_file_sync_jobs ON local_file_sync_jobs.file_id = files.id
      ORDER BY orders.id ASC, files.id ASC
    `).all();

    const records = rows.map(classifyRow);
    const categoryCounts = {};
    for (const record of records) {
      categoryCounts[record.category] = (categoryCounts[record.category] || 0) + 1;
    }

    const candidates = records
      .filter((record) => ["REAL_NO_SYNC_JOB", "REAL_ALREADY_SYNCED", "REAL_ELIGIBLE"].includes(record.category))
      .slice(0, options.limit || 10);
    const preferred = candidates.find((record) => record.category === "REAL_NO_SYNC_JOB") || candidates[0] || null;

    const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
    const foreignKeyCheckCount = db.prepare("PRAGMA foreign_key_check").all().length;

    return {
      phase: "Phase06-A3-C1-RC-C",
      mode: "read-only",
      total_files: records.length,
      category_counts: categoryCounts,
      real_candidate_found: Boolean(preferred),
      candidate_file_id: preferred?.file_id || null,
      candidate_order_id: preferred?.order_id || null,
      candidate_has_sync_job: preferred ? preferred.has_sync_job : null,
      candidates,
      db_health: {
        integrity_check: integrity,
        foreign_key_check_count: foreignKeyCheckCount,
      },
    };
  } finally {
    db.close();
  }
}

export function classifyRow(row) {
  const testClassification = classifyTestSubject({
    customerId: row.customer_id,
    customerIsTestAccount: row.customer_is_test_account,
    sourceMarkers: [
      row.order_no,
      row.filename,
      row.filepath,
      row.sync_source_type,
      row.sync_source_version,
    ],
  });
  const format = getExtension(row.filename || row.filepath);
  const material = row.file_material || row.order_material;
  const color = row.file_color || row.order_color;
  const quantity = row.file_quantity || row.order_quantity;
  const riskLevel = String(row.risk_level || "").trim().toLowerCase();
  const hasSyncJob = row.sync_job_id != null;

  let category = "REAL_ELIGIBLE";
  const reasons = [...testClassification.reasons];
  if (testClassification.isTest) {
    category = "TEST";
  } else if (!SUPPORTED_FORMATS.has(format)) {
    category = "UNSUPPORTED_FORMAT";
    reasons.push("unsupported_format");
  } else if (!material || !color || !quantity || Number(quantity) <= 0) {
    category = "MISSING_METADATA";
    reasons.push("missing_metadata");
  } else if (!ACCEPTED_RISK_LEVELS.has(riskLevel) || Number(row.requires_manual_confirmation) === 1) {
    category = "HIGH_RISK";
    reasons.push("risk_not_accepted");
  } else if (!isOrderStatusEligible(row.order_status)) {
    category = "ORDER_INELIGIBLE";
    reasons.push("order_status_ineligible");
  } else if (hasSyncJob) {
    category = "REAL_ALREADY_SYNCED";
  } else {
    category = "REAL_NO_SYNC_JOB";
  }

  return {
    file_id: Number(row.file_id),
    order_id: Number(row.order_id),
    order_masked: maskOrderNo(row.order_no),
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    database_test_flag: testClassification.authoritativeTestFlag,
    test_fail_closed: testClassification.failClosed,
    category,
    format,
    has_sync_job: hasSyncJob,
    sync_status: row.sync_status || null,
    has_material: Boolean(material),
    has_color: Boolean(color),
    has_quantity: Boolean(quantity && Number(quantity) > 0),
    risk_level: riskLevel || "none",
    reasons,
  };
}

function isOrderStatusEligible(value) {
  const text = String(value || "").trim().toLowerCase();
  const blocked = ["cancel", "closed", "\u53d6\u6d88", "\u5173\u95ed", "\u5df2\u5173\u95ed"];
  return !blocked.some((marker) => text.includes(marker));
}

function getExtension(value) {
  const match = String(value || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function maskOrderNo(value) {
  const text = String(value || "");
  if (text.length <= 7) return "***";
  return `${text.slice(0, 3)}***${text.slice(-4)}`;
}

function requireNext(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

async function main() {
  try {
    console.log(JSON.stringify(classifyRealFileCandidates(parseArgs()), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: sanitizeError(error) }, null, 2));
    process.exitCode = 1;
  }
}

function sanitizeError(error) {
  return String(error instanceof Error ? error.message : error || "classification failed")
    .replace(/1[3-9]\d{9}/g, "[redacted-phone]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/[a-f0-9]{64}/gi, "[redacted-sha]")
    .slice(0, 300);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
