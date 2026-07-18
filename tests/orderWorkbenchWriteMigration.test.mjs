import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { initDatabase } from "../src/backend/database.ts";
import { verifyOrderWorkbenchWriteSchema } from "../src/backend/orderWorkbenchWriteSchema.ts";
import {
  PHASE06_A4_SCHEMA_CONFIRM_MARKER,
  runMigration,
} from "../scripts/phase06-a4-apply-order-workbench-write-schema.mjs";

test("guarded workbench write migration rejects default, missing marker, and wrong paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-a4-migration-reject-"));
  try {
    const dbPath = join(root, "make3d.db");
    await writeFile(join(root, "not-db.txt"), "not a database");
    assert.throws(() => runMigration([]), /--db is required/);
    assert.throws(() => runMigration(["--db", dbPath]), /path does not exist/);
    const db = initDatabase(dbPath);
    db.close();
    assert.throws(() => runMigration(["--db", dbPath]), /Missing confirmation marker/);
    assert.throws(() => runMigration(["--db", `file:${dbPath}`, "--confirm", PHASE06_A4_SCHEMA_CONFIRM_MARKER]), /filesystem path/);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("guarded workbench write migration is additive and idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-a4-migration-"));
  try {
    const dbPath = join(root, "make3d.db");
    const db = initDatabase(dbPath);
    db.prepare(`
      INSERT INTO customers (id, phone, password_hash, name, wechat, email, is_test_account)
      VALUES (7, '13900000007', 'hash', 'Test', 'wx', 'a@example.invalid', 1)
    `).run();
    db.prepare(`
      INSERT INTO orders (order_no, customer_id, customer_name, phone, wechat, material, quantity)
      VALUES ('M3DTEST-MIGRATION', 7, 'Test', '13900000007', 'wx', 'PLA', 1)
    `).run();
    const beforeBusinessCounts = businessCounts(db);
    assert.equal(verifyOrderWorkbenchWriteSchema(db).ok, false);
    db.close();

    const first = runMigration(["--db", dbPath, "--confirm", PHASE06_A4_SCHEMA_CONFIRM_MARKER]);
    assert.equal(first.ok, true);
    assert.equal(first.after.integrity_check, "ok");
    assert.equal(first.after.foreign_key_check_count, 0);
    assert.equal(first.after.schema_ready, true);
    assert.equal(first.write_counts_zero, true);
    assert.equal(first.business_counts_unchanged, true);

    const second = runMigration(["--db", dbPath, "--confirm", PHASE06_A4_SCHEMA_CONFIRM_MARKER]);
    assert.equal(second.ok, true);
    assert.deepEqual(second.after.business_counts, first.after.business_counts);
    assert.deepEqual(second.after.write_counts, first.after.write_counts);

    const afterDb = new DatabaseSync(dbPath);
    assert.deepEqual(businessCounts(afterDb), beforeBusinessCounts);
    assert.equal(countRows(afterDb, "order_messages"), 0);
    assert.equal(countRows(afterDb, "operator_order_confirmations"), 0);
    assert.equal(countRows(afterDb, "operator_order_audit_events"), 0);
    afterDb.close();
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

function businessCounts(db) {
  return {
    orders: countRows(db, "orders"),
    files: countRows(db, "files"),
    local_file_sync_jobs: countRows(db, "local_file_sync_jobs"),
    slicing_jobs: countRows(db, "slicing_jobs"),
    slicing_job_attempts: countRows(db, "slicing_job_attempts"),
    order_payments: countRows(db, "order_payments"),
    wechat_refunds: countRows(db, "wechat_refunds"),
    payment_settings: countRows(db, "payment_settings"),
  };
}

function countRows(db, table) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return null;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}
