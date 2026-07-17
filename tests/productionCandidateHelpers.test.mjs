import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cancelProductionCandidate,
  completeProductionCandidate,
  createApprovalAuditRecord,
  createProductionCandidateFromApprovedOrder,
  listProductionCandidateAuditEvents,
  markProductionCandidateReady,
  startManualExecution,
} from "../src/backend/productionCandidateHelpers.ts";
import {
  baseApprovalInput,
  baseCandidateInput,
  baseFileSnapshot,
  baseQuoteSnapshot,
  countRows,
  seedOrder,
  withProductionCandidateDb,
} from "./productionCandidateTestUtils.mjs";

test("approved order can create a production candidate and create audit event", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const { order, approval } = createApprovedFixture(db);
    const result = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, approval.approval_id));

    assert.equal(result.created, true);
    assert.equal(result.candidate.status, "CREATED");
    assert.match(result.candidate.file_snapshot_sha256, /^[a-f0-9]{64}$/);
    assert.equal(countRows(db, "production_candidates"), 1);
    assert.equal(listProductionCandidateAuditEvents(db, result.candidate.candidate_id)[0].event_type, "create");
  });
});

test("APPROVAL_OPERATOR cannot create candidate", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const { order, approval } = createApprovedFixture(db);
    assert.throws(
      () =>
        createProductionCandidateFromApprovedOrder(db, {
          ...baseCandidateInput(order, approval.approval_id),
          operator_role: "APPROVAL_OPERATOR",
        }),
      /operator_role is not allowed/,
    );
  });
});

test("rejected and request_change approvals cannot create candidates", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const rejected = createApprovalFixture(db, "reject", "REJECTED");
    assert.throws(
      () =>
        createProductionCandidateFromApprovedOrder(
          db,
          baseCandidateInput(rejected.order, rejected.approval.approval_id),
        ),
      /not approved/,
    );

    const change = createApprovalFixture(db, "request_change", "NEED_CUSTOMER_CONFIRM");
    assert.throws(
      () =>
        createProductionCandidateFromApprovedOrder(db, baseCandidateInput(change.order, change.approval.approval_id)),
      /not approved/,
    );
  });
});

test("duplicate active candidate returns existing candidate with created=false", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const { order, approval } = createApprovedFixture(db);
    const first = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, approval.approval_id));
    const second = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, approval.approval_id));

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.candidate.candidate_id, first.candidate.candidate_id);
    assert.equal(countRows(db, "production_candidates"), 1);
  });
});

test("changed file snapshot and changed quote snapshot require new approval and can create new candidates", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const order = seedOrder(db);
    const firstApproval = createApprovalAuditRecord(db, baseApprovalInput(order)).approval;
    const first = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, firstApproval.approval_id));

    const changedFile = baseFileSnapshot({
      files: [{ file_id: 2, filename_snapshot: "changed.stl", sha256: "b".repeat(64), size_bytes: 222 }],
    });
    const secondApproval = createApprovalAuditRecord(db, {
      ...baseApprovalInput(order),
      file_snapshot: changedFile,
      client_request_id: "approval-file-change",
    }).approval;
    const second = createProductionCandidateFromApprovedOrder(
      db,
      baseCandidateInput(order, secondApproval.approval_id, {
        file_snapshot: changedFile,
        client_request_id: "candidate-file-change",
      }),
    );

    const changedQuote = baseQuoteSnapshot({ final_total_cents: 2000, quantity: 2 });
    const thirdApproval = createApprovalAuditRecord(db, {
      ...baseApprovalInput(order),
      file_snapshot: changedFile,
      quote_snapshot: changedQuote,
      client_request_id: "approval-quote-change",
    }).approval;
    const third = createProductionCandidateFromApprovedOrder(
      db,
      baseCandidateInput(order, thirdApproval.approval_id, {
        file_snapshot: changedFile,
        quote_snapshot: changedQuote,
        client_request_id: "candidate-quote-change",
      }),
    );

    assert.notEqual(first.candidate.candidate_id, second.candidate.candidate_id);
    assert.notEqual(second.candidate.candidate_id, third.candidate.candidate_id);
    assert.equal(countRows(db, "production_candidates"), 3);
  });
});

test("candidate lifecycle writes audit events and never creates slicing jobs", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const { order, approval } = createApprovedFixture(db);
    const beforeSlicing = countRows(db, "slicing_jobs");
    const created = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, approval.approval_id));
    const ready = markProductionCandidateReady(db, stateInput(created.candidate.candidate_id));
    const started = startManualExecution(db, stateInput(created.candidate.candidate_id));
    const completed = completeProductionCandidate(db, stateInput(created.candidate.candidate_id));
    const events = listProductionCandidateAuditEvents(db, created.candidate.candidate_id).map((event) => event.event_type);

    assert.equal(ready.status, "READY_FOR_PRODUCTION");
    assert.equal(started.status, "MANUAL_EXECUTION_STARTED");
    assert.equal(completed.status, "COMPLETED");
    assert.deepEqual(events, ["create", "mark_ready", "manual_start", "complete"]);
    assert.equal(countRows(db, "slicing_jobs"), beforeSlicing);
  });
});

test("illegal transitions and terminal changes are rejected", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const { order, approval } = createApprovedFixture(db);
    const created = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, approval.approval_id));

    assert.throws(
      () => startManualExecution(db, stateInput(created.candidate.candidate_id)),
      /illegal production candidate transition/,
    );

    markProductionCandidateReady(db, stateInput(created.candidate.candidate_id));
    startManualExecution(db, stateInput(created.candidate.candidate_id));
    completeProductionCandidate(db, stateInput(created.candidate.candidate_id));
    assert.throws(
      () => cancelProductionCandidate(db, stateInput(created.candidate.candidate_id)),
      /illegal production candidate transition/,
    );
  });
});

test("cancelled and completed terminal candidates allow repeat identity only through a new approval", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const order = seedOrder(db);
    const firstApproval = createApprovalAuditRecord(db, baseApprovalInput(order)).approval;
    const first = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, firstApproval.approval_id));
    cancelProductionCandidate(db, stateInput(first.candidate.candidate_id));

    const secondApproval = createApprovalAuditRecord(db, {
      ...baseApprovalInput(order),
      client_request_id: "approval-after-cancel",
    }).approval;
    const second = createProductionCandidateFromApprovedOrder(
      db,
      baseCandidateInput(order, secondApproval.approval_id, { client_request_id: "candidate-after-cancel" }),
    );
    markProductionCandidateReady(db, stateInput(second.candidate.candidate_id));
    startManualExecution(db, stateInput(second.candidate.candidate_id));
    completeProductionCandidate(db, stateInput(second.candidate.candidate_id));

    const thirdApproval = createApprovalAuditRecord(db, {
      ...baseApprovalInput(order),
      client_request_id: "approval-after-complete",
    }).approval;
    const third = createProductionCandidateFromApprovedOrder(
      db,
      baseCandidateInput(order, thirdApproval.approval_id, { client_request_id: "candidate-after-complete" }),
    );

    assert.notEqual(first.candidate.candidate_id, second.candidate.candidate_id);
    assert.notEqual(second.candidate.candidate_id, third.candidate.candidate_id);
    assert.equal(countRows(db, "production_candidates"), 3);
  });
});

test("candidate snapshots are unaffected by later order changes", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const { order, approval } = createApprovedFixture(db);
    const created = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, approval.approval_id));
    const before = created.candidate.quote_snapshot_json;

    db.prepare("UPDATE orders SET estimated_price = 999999 WHERE id = ?").run(order.orderId);

    const after = db
      .prepare("SELECT quote_snapshot_json AS quoteSnapshotJson FROM production_candidates WHERE candidate_id = ?")
      .get(created.candidate.candidate_id);
    assert.equal(after.quoteSnapshotJson, before);
  });
});

function createApprovedFixture(db) {
  return createApprovalFixture(db, "approve", "APPROVED");
}

function createApprovalFixture(db, action, statusAfter) {
  const order = seedOrder(db);
  const approval = createApprovalAuditRecord(db, {
    ...baseApprovalInput(order),
    action,
    approval_status_after: statusAfter,
    client_request_id: `approval-${action}-${order.orderId}`,
  }).approval;
  return { order, approval };
}

function stateInput(candidateId) {
  return {
    candidate_id: candidateId,
    operator_id: "operator-production-1",
    operator_role: "PRODUCTION_OPERATOR",
    reason: "local state transition",
    event_snapshot: { safe: true },
    client_request_id: `state-${candidateId}-${Date.now()}-${Math.random()}`,
  };
}
