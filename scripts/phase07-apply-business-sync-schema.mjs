#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  applyOrderWorkbenchWriteSchema,
  verifyOrderWorkbenchWriteSchema,
} from "../src/backend/orderWorkbenchWriteSchema.ts";

export const PHASE07_BUSINESS_SCHEMA_CONFIRM_MARKER = "PHASE07_ORDER_WORKBENCH_BUSINESS_SYNC_SCHEMA_DEPLOY";

const PROTECTED_TABLES = [
  "orders", "files", "local_file_sync_jobs", "slicing_jobs", "slicing_job_attempts",
  "order_payments", "wechat_refunds", "payment_settings", "approval_audit_records",
  "production_candidates", "production_candidate_audit_events", "order_messages",
  "operator_order_confirmations", "operator_order_audit_events",
];

export function runPhase07BusinessSchemaMigration(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dbPath = validateDbPath(args.db);
  if (args.confirm !== PHASE07_BUSINESS_SCHEMA_CONFIRM_MARKER) {
    throw new Error(`Missing confirmation marker: ${PHASE07_BUSINESS_SCHEMA_CONFIRM_MARKER}`);
  }
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const before = inspect(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      applyOrderWorkbenchWriteSchema(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const after = inspect(db);
    const protectedCountsUnchanged = JSON.stringify(before.counts) === JSON.stringify(after.counts);
    if (!protectedCountsUnchanged || after.integrity_check !== "ok" || after.foreign_key_check_count !== 0 || !after.schema_ready) {
      throw new Error("Phase07 schema verification failed");
    }
    return { ok: true, db_path: dbPath, before, after, protected_counts_unchanged: true };
  } finally {
    db.close();
  }
}

function inspect(db) {
  const readiness = verifyOrderWorkbenchWriteSchema(db);
  return {
    integrity_check: String(db.prepare("PRAGMA integrity_check").get().integrity_check || ""),
    foreign_key_check_count: db.prepare("PRAGMA foreign_key_check").all().length,
    schema_ready: readiness.ok,
    schema_reasons: readiness.reasons,
    confirmation_columns: db.prepare("PRAGMA table_info(operator_order_confirmations)").all().map((item) => item.name),
    counts: Object.fromEntries(PROTECTED_TABLES.map((table) => [table, countRowsIfExists(db, table)])),
  };
}

function parseArgs(argv) {
  const args = { db: "", confirm: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--db") args.db = String(argv[++index] || "");
    else if (argv[index] === "--confirm") args.confirm = String(argv[++index] || "");
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return args;
}

function countRowsIfExists(db, table) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return exists ? Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count) : null;
}

function validateDbPath(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("--db is required");
  if (/^file:/i.test(text)) throw new Error("--db must be a filesystem path");
  const path = resolve(text);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error("--db must reference an existing file");
  return path;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(runPhase07BusinessSchemaMigration(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}
