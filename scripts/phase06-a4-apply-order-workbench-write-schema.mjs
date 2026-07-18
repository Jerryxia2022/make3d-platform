#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  applyOrderWorkbenchWriteSchema,
  ORDER_WORKBENCH_WRITE_SCHEMA_VERSION,
  verifyOrderWorkbenchWriteSchema,
} from "../src/backend/orderWorkbenchWriteSchema.ts";

export const PHASE06_A4_SCHEMA_CONFIRM_MARKER = "PHASE06_A4_ORDER_WORKBENCH_WRITE_SCHEMA_DEPLOY";

const BUSINESS_TABLES = [
  "orders",
  "files",
  "local_file_sync_jobs",
  "slicing_jobs",
  "slicing_job_attempts",
  "order_payments",
  "wechat_refunds",
  "payment_settings",
  "approval_audit_records",
  "production_candidates",
  "production_candidate_audit_events",
];

const WRITE_TABLES = [
  "order_messages",
  "operator_order_confirmations",
  "operator_order_audit_events",
];

export function parseArgs(argv) {
  const args = { db: "", confirm: "", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--db") args.db = String(argv[++index] || "");
    else if (item === "--confirm") args.confirm = String(argv[++index] || "");
    else if (item === "--json") args.json = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

export function runMigration(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dbPath = validateDbPath(args.db);
  if (args.confirm !== PHASE06_A4_SCHEMA_CONFIRM_MARKER) {
    throw new Error(`Missing confirmation marker: ${PHASE06_A4_SCHEMA_CONFIRM_MARKER}`);
  }

  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const before = inspectDatabase(db);
    applyOrderWorkbenchWriteSchema(db);
    const after = inspectDatabase(db);
    return {
      ok: true,
      schema_version: ORDER_WORKBENCH_WRITE_SCHEMA_VERSION,
      db_path: dbPath,
      before,
      after,
      business_counts_unchanged: JSON.stringify(before.business_counts) === JSON.stringify(after.business_counts),
      write_counts_zero: WRITE_TABLES.every((table) => after.write_counts[table] === 0),
    };
  } finally {
    db.close();
  }
}

function inspectDatabase(db) {
  const readiness = verifyOrderWorkbenchWriteSchema(db);
  return {
    integrity_check: String(db.prepare("PRAGMA integrity_check").get().integrity_check || ""),
    foreign_key_check_count: db.prepare("PRAGMA foreign_key_check").all().length,
    schema_ready: readiness.ok,
    schema_reasons: readiness.reasons,
    business_counts: Object.fromEntries(BUSINESS_TABLES.map((table) => [table, countRowsIfExists(db, table)])),
    write_counts: Object.fromEntries(WRITE_TABLES.map((table) => [table, countRowsIfExists(db, table)])),
  };
}

function countRowsIfExists(db, table) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return null;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

function validateDbPath(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("--db is required");
  if (/^file:/i.test(text)) throw new Error("--db must be a filesystem path, not a file URL");
  const dbPath = resolve(text);
  if (!existsSync(dbPath)) throw new Error("--db path does not exist");
  if (!statSync(dbPath).isFile()) throw new Error("--db path is not a file");
  return dbPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runMigration();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}
