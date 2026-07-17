import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertNoSensitiveApprovalCandidateData,
  createApprovalAuditRecord,
} from "../src/backend/productionCandidateHelpers.ts";
import {
  baseApprovalInput,
  countRows,
  seedOrder,
  withProductionCandidateDb,
} from "./productionCandidateTestUtils.mjs";

test("APPROVAL_OPERATOR can create an approval audit record", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const order = seedOrder(db);
    const result = createApprovalAuditRecord(db, baseApprovalInput(order));

    assert.equal(result.derivedApprovalStatus, "APPROVED");
    assert.equal(result.approval.action, "approve");
    assert.equal(countRows(db, "approval_audit_records"), 1);
  });
});

test("READONLY_OPERATOR cannot approve", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const order = seedOrder(db);
    assert.throws(
      () => createApprovalAuditRecord(db, { ...baseApprovalInput(order), operator_role: "READONLY_OPERATOR" }),
      /operator_role is not allowed/,
    );
  });
});

test("illegal approval action is rejected", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const order = seedOrder(db);
    assert.throws(
      () => createApprovalAuditRecord(db, { ...baseApprovalInput(order), action: "delete_order" }),
      /action is not allowed/,
    );
  });
});

test("sensitive approval snapshot fields are rejected and order_no is not treated as phone", async () => {
  assert.doesNotThrow(() => assertNoSensitiveApprovalCandidateData({ order_no: "M3D202607170001" }));
  await withProductionCandidateDb(async ({ db }) => {
    const order = seedOrder(db);
    assert.throws(
      () =>
        createApprovalAuditRecord(db, {
          ...baseApprovalInput(order),
          order_snapshot: { order_no: "M3D202607170001", phone: "13900000000" },
        }),
      /sensitive field/,
    );
  });
});

test("approval helper does not update orders or create candidates or slicing jobs", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const order = seedOrder(db);
    const beforeOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.orderId);
    const beforeCandidates = countRows(db, "production_candidates");
    const beforeSlicing = countRows(db, "slicing_jobs");

    createApprovalAuditRecord(db, baseApprovalInput(order));

    assert.deepEqual(db.prepare("SELECT * FROM orders WHERE id = ?").get(order.orderId), beforeOrder);
    assert.equal(countRows(db, "production_candidates"), beforeCandidates);
    assert.equal(countRows(db, "slicing_jobs"), beforeSlicing);
  });
});
