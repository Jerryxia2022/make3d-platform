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
import { applyApprovalCandidateSchema } from "../src/backend/productionCandidateSchema.ts";
import {
  baseApprovalInput,
  baseCandidateInput,
  countRows,
  seedOrder,
  withProductionCandidateDb,
} from "./productionCandidateTestUtils.mjs";

test("local integration flow completes without writing slicing_jobs", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    applyApprovalCandidateSchema(db);
    const order = seedOrder(db);
    const approval = createApprovalAuditRecord(db, baseApprovalInput(order)).approval;
    const beforeSlicing = countRows(db, "slicing_jobs");
    const created = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, approval.approval_id));
    const duplicate = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, approval.approval_id));

    markProductionCandidateReady(db, transitionInput(created.candidate.candidate_id));
    startManualExecution(db, transitionInput(created.candidate.candidate_id));
    completeProductionCandidate(db, transitionInput(created.candidate.candidate_id));

    const events = listProductionCandidateAuditEvents(db, created.candidate.candidate_id);
    assert.equal(duplicate.created, false);
    assert.equal(countRows(db, "slicing_jobs"), beforeSlicing);
    assert.deepEqual(events.map((event) => event.event_type), ["create", "mark_ready", "manual_start", "complete"]);
  });
});

test("cancelled repeat strategy matches L1 design and keeps audit history", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const order = seedOrder(db);
    const approval = createApprovalAuditRecord(db, baseApprovalInput(order)).approval;
    const first = createProductionCandidateFromApprovedOrder(db, baseCandidateInput(order, approval.approval_id));
    cancelProductionCandidate(db, transitionInput(first.candidate.candidate_id));

    const nextApproval = createApprovalAuditRecord(db, {
      ...baseApprovalInput(order),
      client_request_id: "approval-after-terminal-cancel",
    }).approval;
    const second = createProductionCandidateFromApprovedOrder(
      db,
      baseCandidateInput(order, nextApproval.approval_id, { client_request_id: "candidate-after-terminal-cancel" }),
    );

    assert.equal(second.created, true);
    assert.equal(countRows(db, "production_candidates"), 2);
    assert.equal(countRows(db, "production_candidate_audit_events"), 3);
  });
});

function transitionInput(candidateId) {
  return {
    candidate_id: candidateId,
    operator_id: "operator-production-1",
    operator_role: "PRODUCTION_OPERATOR",
    reason: "integration",
    event_snapshot: { integration: true },
    client_request_id: `integration-${candidateId}-${Date.now()}-${Math.random()}`,
  };
}
