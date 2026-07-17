import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const SCRIPT = "scripts/phase05-l4-apply-approval-candidate-schema.mjs";
const MARKER = "PHASE05_L4_APPROVAL_CANDIDATE_SCHEMA_DEPLOY";

test("migration guard rejects missing database path", () => {
  const result = runScript([]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--db <sqlite-path> is required/);
});

test("migration guard rejects missing and wrong confirmation marker", async () => {
  await withDb(async ({ dbPath }) => {
    const missing = runScript(["--db", dbPath]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /--confirm must equal/);

    const wrong = runScript(["--db", dbPath, "--confirm", "WRONG"]);
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /--confirm must equal/);
  });
});

test("migration guard rejects nonexistent target database", () => {
  const missingPath = join(tmpdir(), `make3d-missing-${Date.now()}.db`);
  const result = runScript(["--db", missingPath, "--confirm", MARKER]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /target database file does not exist/);
});

test("migration script succeeds on rehearsal database and is idempotent", async () => {
  await withDb(async ({ db, dbPath }) => {
    const beforeCounts = businessCounts(db);
    const first = runScript(["--db", dbPath, "--confirm", MARKER]);
    assert.equal(first.status, 0, first.stderr);
    const firstJson = JSON.parse(first.stdout);
    assert.equal(firstJson.status, "ok");
    assert.equal(firstJson.new_table_counts.approval_audit_records, 0);
    assert.equal(firstJson.new_table_counts.production_candidates, 0);
    assert.equal(firstJson.new_table_counts.production_candidate_audit_events, 0);
    assert.deepEqual(firstJson.business_counts_before, beforeCounts);
    assert.deepEqual(firstJson.business_counts_after, beforeCounts);

    const second = runScript(["--db", dbPath, "--confirm", MARKER]);
    assert.equal(second.status, 0, second.stderr);
    const secondJson = JSON.parse(second.stdout);
    assert.deepEqual(secondJson.business_counts_before, beforeCounts);
    assert.deepEqual(secondJson.business_counts_after, beforeCounts);
    assert.equal(countRows(db, "slicing_jobs"), 0);
  });
});

test("migration script output contains no obvious sensitive data", async () => {
  await withDb(async ({ dbPath }) => {
    const result = runScript(["--db", dbPath, "--confirm", MARKER]);
    assert.equal(result.status, 0, result.stderr);
    const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
    for (const forbidden of [
      "authorization",
      "openid",
      "payment_no",
      "out_trade_no",
      "transaction_id",
      "private key",
      "certificate",
      "apiv3",
      "worker_token",
      "bearer ",
    ]) {
      assert.equal(combined.includes(forbidden), false, `output should not contain ${forbidden}`);
    }
  });
});

async function withDb(run) {
  const root = await mkdtemp(join(tmpdir(), "make3d-l4-migration-script-"));
  const dbPath = join(root, "rehearsal.db");
  const db = new DatabaseSync(dbPath, {});
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE orders (id INTEGER PRIMARY KEY, order_no TEXT);
    CREATE TABLE files (id INTEGER PRIMARY KEY, order_id INTEGER, filename TEXT);
    CREATE TABLE local_file_sync_jobs (id INTEGER PRIMARY KEY, file_id INTEGER);
    CREATE TABLE slicing_jobs (id INTEGER PRIMARY KEY, status TEXT);
    CREATE TABLE slicing_job_attempts (id INTEGER PRIMARY KEY, slicing_job_id INTEGER);
    CREATE TABLE order_payments (id INTEGER PRIMARY KEY, order_id INTEGER);
    CREATE TABLE wechat_refunds (id INTEGER PRIMARY KEY, order_id INTEGER);
    CREATE TABLE payment_settings (id INTEGER PRIMARY KEY);
  `);
  try {
    await run({ db, dbPath, root });
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function runScript(args) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--experimental-specifier-resolution=node", SCRIPT, ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}

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

function countRows(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}
