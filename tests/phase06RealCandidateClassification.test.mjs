import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import { classifyRealFileCandidates } from "../scripts/phase06-a3-classify-real-file-candidates.mjs";

test("real candidate classification separates TEST, no-sync, synced, unsupported, missing metadata, and risk", async () => {
  const fixture = await createFixture();
  try {
    const result = classifyRealFileCandidates({ dbPath: fixture.dbPath, limit: 20 });
    assert.equal(result.total_files, 7);
    assert.equal(result.category_counts.TEST, 2);
    assert.equal(result.category_counts.REAL_NO_SYNC_JOB, 1);
    assert.equal(result.category_counts.REAL_ALREADY_SYNCED, 1);
    assert.equal(result.category_counts.UNSUPPORTED_FORMAT, 1);
    assert.equal(result.category_counts.MISSING_METADATA, 1);
    assert.equal(result.category_counts.HIGH_RISK, 1);
    assert.equal(result.real_candidate_found, true);
    assert.equal(result.candidate_file_id, 3);
    assert.equal(result.candidate_order_id, 3);
    assert.equal(result.candidate_has_sync_job, false);
    assert.equal(result.db_health.integrity_check, "ok");
    assert.equal(result.db_health.foreign_key_check_count, 0);
    assert.doesNotMatch(JSON.stringify(result), /customer-phone|secret|\/uploads\/|real-a\.stl/);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "make3d-real-candidate-classification-"));
  const dbPath = join(root, "make3d.db");
  await mkdir(join(root, "uploads"), { recursive: true });
  await writeFile(join(root, "uploads", "real-a.stl"), "solid a\nendsolid a\n");
  const db = new DatabaseSync(dbPath);
  migrate(db);

  for (const [id, isTest] of [[1, 1], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]]) {
    addCustomer(db, id, isTest);
  }

  addOrderFile(db, { orderId: 1, customerId: 1, orderNo: "M3D202607180001", fileId: 1, filename: "test-flag.stl" });
  addOrderFile(db, { orderId: 2, customerId: 2, orderNo: "PHASE05_K_D_TEST", fileId: 2, filename: "marker.stl" });
  addOrderFile(db, { orderId: 3, customerId: 3, orderNo: "M3D202607180003", fileId: 3, filename: "real-a.stl" });
  addOrderFile(db, { orderId: 4, customerId: 4, orderNo: "M3D202607180004", fileId: 4, filename: "synced.stl", sync: true });
  addOrderFile(db, { orderId: 5, customerId: 5, orderNo: "M3D202607180005", fileId: 5, filename: "unsupported.step" });
  addOrderFile(db, { orderId: 6, customerId: 6, orderNo: "M3D202607180006", fileId: 6, filename: "missing.stl", material: "" });
  addOrderFile(db, { orderId: 7, customerId: 7, orderNo: "M3D202607180007", fileId: 7, filename: "risk.stl", riskLevel: "high" });

  return {
    dbPath,
    async cleanup() {
      db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      phone TEXT,
      is_test_account INTEGER
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      order_no TEXT NOT NULL,
      customer_id INTEGER,
      material TEXT,
      color TEXT,
      quantity INTEGER,
      status TEXT
    );
    CREATE TABLE files (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      material TEXT,
      color TEXT,
      quantity INTEGER,
      risk_level TEXT,
      requires_manual_confirmation INTEGER
    );
    CREATE TABLE local_file_sync_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL UNIQUE,
      order_id INTEGER NOT NULL,
      source_type TEXT,
      source_version TEXT,
      sync_status TEXT
    );
  `);
}

function addCustomer(db, id, isTest) {
  db.prepare("INSERT INTO customers (id, phone, is_test_account) VALUES (?, 'customer-phone-secret', ?)").run(id, isTest);
}

function addOrderFile(db, options) {
  const material = options.material === undefined ? "PLA" : options.material;
  db.prepare(`
    INSERT INTO orders (id, order_no, customer_id, material, color, quantity, status)
    VALUES (?, ?, ?, ?, 'black', 1, 'pending')
  `).run(options.orderId, options.orderNo, options.customerId, material);
  db.prepare(`
    INSERT INTO files (
      id, order_id, filename, filepath, filesize, material, color, quantity, risk_level, requires_manual_confirmation
    ) VALUES (?, ?, ?, ?, 20, ?, 'black', 1, ?, 0)
  `).run(
    options.fileId,
    options.orderId,
    options.filename,
    `/uploads/${options.filename}`,
    material,
    options.riskLevel || "none",
  );
  if (options.sync) {
    db.prepare(`
      INSERT INTO local_file_sync_jobs (file_id, order_id, source_type, source_version, sync_status)
      VALUES (?, ?, 'order_file', 'upload_v1', 'verified')
    `).run(options.fileId, options.orderId);
  }
}
