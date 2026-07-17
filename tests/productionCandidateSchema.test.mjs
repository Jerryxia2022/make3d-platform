import assert from "node:assert/strict";
import { test } from "node:test";

import { applyApprovalCandidateSchema } from "../src/backend/productionCandidateSchema.ts";
import { countRows, indexExists, tableExists, withProductionCandidateDb } from "./productionCandidateTestUtils.mjs";

test("approval candidate schema migration is idempotent and creates all frozen tables", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    applyApprovalCandidateSchema(db);

    assert.equal(tableExists(db, "approval_audit_records"), true);
    assert.equal(tableExists(db, "production_candidates"), true);
    assert.equal(tableExists(db, "production_candidate_audit_events"), true);
  });
});

test("approval candidate schema creates frozen indexes including partial active identity", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    for (const indexName of [
      "idx_approval_audit_records_order_created",
      "idx_approval_audit_records_customer_created",
      "idx_approval_audit_records_client_request",
      "idx_production_candidates_order_created",
      "idx_production_candidates_customer_created",
      "idx_production_candidates_status_created",
      "idx_production_candidates_approval",
      "idx_production_candidates_active_identity",
      "idx_candidate_audit_events_candidate_created",
      "idx_candidate_audit_events_client_request",
    ]) {
      assert.equal(indexExists(db, indexName), true, `${indexName} should exist`);
    }

    const indexes = db.prepare("PRAGMA index_list(production_candidates)").all();
    const active = indexes.find((index) => index.name === "idx_production_candidates_active_identity");
    assert.equal(active.unique, 1);
    assert.equal(active.partial, 1);
  });
});

test("schema helper does not modify existing order, file, payment, or slicing data", async () => {
  await withProductionCandidateDb(async ({ db }) => {
    const before = {
      orders: countRows(db, "orders"),
      files: countRows(db, "files"),
      slicing: countRows(db, "slicing_jobs"),
    };
    applyApprovalCandidateSchema(db);
    const after = {
      orders: countRows(db, "orders"),
      files: countRows(db, "files"),
      slicing: countRows(db, "slicing_jobs"),
    };

    assert.deepEqual(after, before);
  });
});
