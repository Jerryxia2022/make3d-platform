import { createHash } from "node:crypto";
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { applyApprovalCandidateSchema } from "../src/backend/productionCandidateSchema.ts";

const CONFIRM_MARKER = "PHASE05_L4_APPROVAL_CANDIDATE_SCHEMA_DEPLOY";
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
const NEW_TABLES = [
  "approval_audit_records",
  "production_candidates",
  "production_candidate_audit_events",
];

const args = parseArgs(process.argv.slice(2));
const dbPath = args.db ? resolve(args.db) : null;
const confirm = args.confirm || null;

if (!dbPath) {
  fail("Refusing to run: --db <sqlite-path> is required and no default production path is used.");
}
if (confirm !== CONFIRM_MARKER) {
  fail(`Refusing to run: --confirm must equal ${CONFIRM_MARKER}.`);
}
if (!existsSync(dbPath)) {
  fail("Refusing to run: target database file does not exist.");
}

const beforeFile = fileSummary(dbPath);
const db = new DatabaseSync(dbPath, {});
try {
  db.exec("PRAGMA foreign_keys = ON");
  const before = collectState(db);
  db.exec("BEGIN IMMEDIATE");
  try {
    applyApprovalCandidateSchema(db);
    const inside = collectState(db);
    assertBusinessCountsUnchanged(before.business_counts, inside.business_counts);
    assertNewTablesEmpty(inside.new_table_counts);
    db.exec("COMMIT");
  } catch (error) {
    rollback(db);
    throw error;
  }

  const after = collectState(db);
  assertBusinessCountsUnchanged(before.business_counts, after.business_counts);
  assertNewTablesEmpty(after.new_table_counts);
  const afterFile = fileSummary(dbPath);
  console.log(JSON.stringify({
    status: "ok",
    db_path: dbPath,
    confirmation_marker: CONFIRM_MARKER,
    file_before: beforeFile,
    file_after: afterFile,
    integrity_check: after.integrity_check,
    foreign_key_check_count: after.foreign_key_check_count,
    business_counts_before: before.business_counts,
    business_counts_after: after.business_counts,
    new_tables_present: after.new_tables_present,
    new_table_counts: after.new_table_counts,
  }, null, 2));
} finally {
  db.close();
}

function collectState(db) {
  return {
    integrity_check: db.prepare("PRAGMA integrity_check").get().integrity_check,
    foreign_key_check_count: db.prepare("PRAGMA foreign_key_check").all().length,
    business_counts: Object.fromEntries(BUSINESS_TABLES.map((table) => [table, tableExists(db, table) ? countRows(db, table) : null])),
    new_tables_present: Object.fromEntries(NEW_TABLES.map((table) => [table, tableExists(db, table)])),
    new_table_counts: Object.fromEntries(NEW_TABLES.map((table) => [table, tableExists(db, table) ? countRows(db, table) : null])),
  };
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function countRows(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

function assertBusinessCountsUnchanged(before, after) {
  for (const table of BUSINESS_TABLES) {
    if (before[table] !== after[table]) {
      throw new Error(`business table count changed for ${table}: ${before[table]} -> ${after[table]}`);
    }
  }
}

function assertNewTablesEmpty(counts) {
  for (const table of NEW_TABLES) {
    if (counts[table] !== 0) throw new Error(`new table must remain empty: ${table}`);
  }
}

function fileSummary(path) {
  const stat = statSync(path);
  return {
    path,
    size: stat.size,
    mode: `0${(stat.mode & 0o777).toString(8)}`,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  };
}

function rollback(db) {
  try {
    db.exec("ROLLBACK");
  } catch {
    // SQLite may already have ended the transaction after a hard error.
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) fail(`Unexpected argument: ${value}`);
    const key = value.slice(2).replace(/-/g, "_");
    const next = values[index + 1];
    if (!next || next.startsWith("--")) fail(`Missing value for ${value}`);
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
