import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { applyApprovalCandidateSchema } from "../src/backend/productionCandidateSchema.ts";

export async function withProductionCandidateDb(run) {
  const root = await mkdtemp(join(tmpdir(), "make3d-production-candidate-"));
  const dbPath = join(root, "test.db");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  createStubTables(db);
  applyApprovalCandidateSchema(db);
  try {
    await run({ db, dbPath, root });
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

export function createStubTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER,
      estimated_price INTEGER DEFAULT 100,
      payment_status TEXT DEFAULT 'unpaid',
      status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slicing_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id_snapshot INTEGER,
      status TEXT
    );
  `);
}

export function seedOrder(db, options = {}) {
  const customerResult = db.prepare("INSERT INTO customers (name) VALUES (?)").run(options.customerName || "Fixture");
  const customerId = Number(customerResult.lastInsertRowid);
  const result = db
    .prepare(
      `INSERT INTO orders (order_no, customer_id, estimated_price, payment_status, status)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      options.orderNo || `M3DTEST${Date.now()}${Math.floor(Math.random() * 1000)}`,
      customerId,
      options.estimatedPrice ?? 100,
      options.paymentStatus || "paid",
      options.status || "confirmed",
    );
  return { orderId: Number(result.lastInsertRowid), customerId };
}

export function baseApprovalInput(order) {
  return {
    order_id: order.orderId,
    customer_id: order.customerId,
    operator_id: "operator-approval-1",
    operator_role: "APPROVAL_OPERATOR",
    action: "approve",
    approval_status_before: "PENDING_REVIEW",
    approval_status_after: "APPROVED",
    reason: "local fixture approval",
    risk_flags: { snapshot_version: "risk_v1", flags: [] },
    order_snapshot: { snapshot_version: "order_v1", order_id: order.orderId, order_no: "M3D-SAFE-001" },
    file_snapshot: baseFileSnapshot(),
    quote_snapshot: baseQuoteSnapshot(),
    snapshot_version: "approval_v1",
    client_request_id: "approval-fixture-1",
  };
}

export function baseCandidateInput(order, approvalId, overrides = {}) {
  return {
    approval_id: approvalId,
    order_id: order.orderId,
    customer_id: order.customerId,
    operator_id: "operator-production-1",
    operator_role: "PRODUCTION_OPERATOR",
    file_snapshot: overrides.file_snapshot || baseFileSnapshot(),
    quote_snapshot: overrides.quote_snapshot || baseQuoteSnapshot(),
    risk_snapshot: overrides.risk_snapshot || { snapshot_version: "risk_v1", flags: [] },
    material_snapshot: overrides.material_snapshot || { material: "PLA", snapshot_version: "material_v1" },
    color_snapshot: overrides.color_snapshot || { color: "black", snapshot_version: "color_v1" },
    quantity_snapshot: overrides.quantity_snapshot || { quantity: 1, snapshot_version: "quantity_v1" },
    profile_snapshot: overrides.profile_snapshot || { profile_key: "bambu-p1s", snapshot_version: "profile_v1" },
    client_request_id: overrides.client_request_id || "candidate-fixture-1",
  };
}

export function baseFileSnapshot(overrides = {}) {
  return {
    snapshot_version: "production_file_v1",
    files: [
      {
        dimensions_mm: { x: 20, y: 20, z: 20 },
        file_id: 1,
        filename_snapshot: "masked-cube.stl",
        format: "stl",
        sha256: "a".repeat(64),
        size_bytes: 1234,
      },
    ],
    ...overrides,
  };
}

export function baseQuoteSnapshot(overrides = {}) {
  return {
    snapshot_version: "production_quote_v1",
    final_total_cents: 1000,
    material: "PLA",
    quantity: 1,
    ...overrides,
  };
}

export function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

export function indexExists(db, indexName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(indexName));
}

export function countRows(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}
