import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  completeProductionCandidate,
  createApprovalAuditRecord,
  createProductionCandidateFromApprovedOrder,
  listProductionCandidateAuditEvents,
  markProductionCandidateReady,
  startManualExecution,
} from "../src/backend/productionCandidateHelpers.ts";
import { applyApprovalCandidateSchema } from "../src/backend/productionCandidateSchema.ts";

const root = await mkdtemp(join(tmpdir(), "make3d-phase05-l2-"));
const dbPath = join(root, "phase05-l2.db");
const db = new DatabaseSync(dbPath);

try {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER,
      estimated_price INTEGER DEFAULT 100,
      payment_status TEXT DEFAULT 'paid'
    );
    CREATE TABLE slicing_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id_snapshot INTEGER,
      status TEXT
    );
  `);
  applyApprovalCandidateSchema(db);
  applyApprovalCandidateSchema(db);

  const orderResult = db
    .prepare("INSERT INTO orders (order_no, customer_id, estimated_price, payment_status) VALUES (?, ?, ?, ?)")
    .run("PHASE05_L2_LOCAL_TEST", 5, 1000, "paid");
  const orderId = Number(orderResult.lastInsertRowid);
  const order = { orderId, customerId: 5 };
  const fileSnapshot = {
    files: [{ file_id: 1, filename_snapshot: "local-test.stl", sha256: "a".repeat(64), size_bytes: 100 }],
    snapshot_version: "production_file_v1",
  };
  const quoteSnapshot = { final_total_cents: 1000, quantity: 1, snapshot_version: "production_quote_v1" };
  const approval = createApprovalAuditRecord(db, {
    action: "approve",
    approval_status_after: "APPROVED",
    approval_status_before: "PENDING_REVIEW",
    client_request_id: "phase05-l2-local-approval",
    customer_id: order.customerId,
    file_snapshot: fileSnapshot,
    operator_id: "operator-approval-local",
    operator_role: "APPROVAL_OPERATOR",
    order_id: order.orderId,
    order_snapshot: { order_id: order.orderId, order_no: "PHASE05_L2_LOCAL_TEST", snapshot_version: "order_v1" },
    quote_snapshot: quoteSnapshot,
    reason: "local integration",
    risk_flags: { flags: [], snapshot_version: "risk_v1" },
    snapshot_version: "approval_v1",
  }).approval;
  const candidate = createProductionCandidateFromApprovedOrder(db, {
    approval_id: approval.approval_id,
    client_request_id: "phase05-l2-local-candidate",
    color_snapshot: { color: "black", snapshot_version: "color_v1" },
    customer_id: order.customerId,
    file_snapshot: fileSnapshot,
    material_snapshot: { material: "PLA", snapshot_version: "material_v1" },
    operator_id: "operator-production-local",
    operator_role: "PRODUCTION_OPERATOR",
    order_id: order.orderId,
    profile_snapshot: { profile_key: "bambu-p1s", snapshot_version: "profile_v1" },
    quantity_snapshot: { quantity: 1, snapshot_version: "quantity_v1" },
    quote_snapshot: quoteSnapshot,
    risk_snapshot: { flags: [], snapshot_version: "risk_v1" },
  }).candidate;

  const transitionInput = {
    candidate_id: candidate.candidate_id,
    client_request_id: "phase05-l2-local-transition",
    event_snapshot: { local_integration: true },
    operator_id: "operator-production-local",
    operator_role: "PRODUCTION_OPERATOR",
    reason: "local integration",
  };
  markProductionCandidateReady(db, transitionInput);
  startManualExecution(db, transitionInput);
  completeProductionCandidate(db, transitionInput);

  const summary = {
    approval_count: db.prepare("SELECT COUNT(*) AS count FROM approval_audit_records").get().count,
    audit_events: listProductionCandidateAuditEvents(db, candidate.candidate_id).map((event) => event.event_type),
    candidate_count: db.prepare("SELECT COUNT(*) AS count FROM production_candidates").get().count,
    db_path: dbPath,
    final_status: db
      .prepare("SELECT status FROM production_candidates WHERE candidate_id = ?")
      .get(candidate.candidate_id).status,
    slicing_jobs_count: db.prepare("SELECT COUNT(*) AS count FROM slicing_jobs").get().count,
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  db.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
