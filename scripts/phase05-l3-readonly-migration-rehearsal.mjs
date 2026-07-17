import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { applyApprovalCandidateSchema } from "../src/backend/productionCandidateSchema.ts";

const BUSINESS_TABLES = [
  "orders",
  "files",
  "local_file_sync_jobs",
  "slicing_jobs",
  "slicing_job_attempts",
  "order_payments",
  "wechat_refunds",
  "payment_settings",
];

const L3_TABLES = [
  "approval_audit_records",
  "production_candidates",
  "production_candidate_audit_events",
];

const L3_INDEXES = [
  "idx_approval_audit_records_order_created",
  "idx_approval_audit_records_customer_created",
  "idx_approval_audit_records_client_request",
  "idx_production_candidates_order_created",
  "idx_production_candidates_customer_created",
  "idx_production_candidates_status_created",
  "idx_production_candidates_approval",
  "idx_production_candidates_active_identity",
  "idx_candidate_audit_events_candidate_created",
  "idx_candidate_audit_events_client_request",
];

const args = parseArgs(process.argv.slice(2));
const mode = args.mode;
const dbPath = args.db;

if (!["live-baseline", "working-rehearsal"].includes(mode)) {
  throw new Error("--mode must be live-baseline or working-rehearsal");
}
if (!dbPath) throw new Error("--db is required");

const startedAt = new Date().toISOString();
const db = new DatabaseSync(dbPath, mode === "live-baseline" ? { readOnly: true } : {});
try {
  db.exec("PRAGMA foreign_keys = ON");
  const before = collectSummary(db);
  let afterFirst = null;
  let afterSecond = null;

  if (mode === "working-rehearsal") {
    applyApprovalCandidateSchema(db);
    afterFirst = collectSummary(db);
    applyApprovalCandidateSchema(db);
    afterSecond = collectSummary(db);
  }

  const fileStat = statSync(dbPath);
  const output = {
    mode,
    db_path: dbPath,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    file: {
      size: fileStat.size,
      mode: `0${(fileStat.mode & 0o777).toString(8)}`,
      sha256: sha256File(dbPath),
    },
    before,
    after_first_apply: afterFirst,
    after_second_apply: afterSecond,
  };
  console.log(JSON.stringify(output, null, 2));
} finally {
  db.close();
}

function collectSummary(db) {
  return {
    integrity_check: db.prepare("PRAGMA integrity_check").get().integrity_check,
    foreign_key_check_count: db.prepare("PRAGMA foreign_key_check").all().length,
    business_counts: Object.fromEntries(BUSINESS_TABLES.map((table) => [table, countRowsIfExists(db, table)])),
    l3_tables: Object.fromEntries(L3_TABLES.map((table) => [table, tableExists(db, table)])),
    l3_counts: Object.fromEntries(L3_TABLES.map((table) => [table, tableExists(db, table) ? countRows(db, table) : null])),
    l3_indexes: Object.fromEntries(L3_INDEXES.map((index) => [index, indexInfo(db, index)])),
  };
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function countRowsIfExists(db, tableName) {
  return tableExists(db, tableName) ? countRows(db, tableName) : null;
}

function countRows(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

function indexInfo(db, indexName) {
  const row = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(indexName);
  if (!row) return { exists: false, sql: null };
  return { exists: true, sql: row.sql };
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`unexpected argument: ${value}`);
    const key = value.slice(2).replace(/-/g, "_");
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`missing value for ${value}`);
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
