# Phase05-L2 Local-only Schema Helper Implementation Final

## Summary

- Phase: Phase05-L2 Local-only Schema Helper Implementation
- Date: 2026-07-17
- Execution time: 2026-07-17 11:56:16 +08:00
- Status: completed
- Scope: local-only Approval + Production Candidate schema/helper implementation and tests
- Production deployment: not performed
- Production database migration/write: not performed
- Real approval/candidate/slicing job creation: not performed
- Worker / PrusaSlicer: not started
- Next phase recommendation: Phase05-L3 Production Read-only Migration Rehearsal may proceed after review approval

## 1. Implemented Files

New backend helper modules:

- `src/backend/productionCandidateTypes.ts`
- `src/backend/productionCandidateCanonicalJson.ts`
- `src/backend/productionCandidateSchema.ts`
- `src/backend/productionCandidateHelpers.ts`

New tests:

- `tests/productionCandidateTestUtils.mjs`
- `tests/productionCandidateSchema.test.mjs`
- `tests/productionCandidateCanonicalJson.test.mjs`
- `tests/productionCandidateApprovalHelpers.test.mjs`
- `tests/productionCandidateHelpers.test.mjs`
- `tests/productionCandidateMigration.test.mjs`

New local integration script:

- `scripts/phase05-l2-local-schema-helper-integration.mjs`

Updated project record:

- `changelog/CHANGELOG.md`

## 2. Schema Helper

Implemented:

```ts
applyApprovalCandidateSchema(db)
```

Creates local-only additive schema on the passed SQLite database:

- `approval_audit_records`
- `production_candidates`
- `production_candidate_audit_events`

Creates frozen L1 indexes:

- `idx_approval_audit_records_order_created`
- `idx_approval_audit_records_customer_created`
- `idx_approval_audit_records_client_request`
- `idx_production_candidates_order_created`
- `idx_production_candidates_customer_created`
- `idx_production_candidates_status_created`
- `idx_production_candidates_approval`
- `idx_production_candidates_active_identity`
- `idx_candidate_audit_events_candidate_created`
- `idx_candidate_audit_events_client_request`

Properties:

- uses `CREATE TABLE IF NOT EXISTS`
- uses `CREATE INDEX IF NOT EXISTS`
- is idempotent
- is not called by production app startup
- does not modify existing `orders`, `files`, payment, refund, upload, quote, or Worker Slicing tables

## 3. Canonical JSON / Hash Helper

Implemented:

- `canonicalizeJson(value)`
- `sha256Hex(bufferOrString)`
- `hashCanonicalJson(value)`
- `buildFileSnapshotHash(fileSnapshot)`
- `buildQuoteSnapshotHash(quoteSnapshot)`
- `buildCandidateIdentityHash({ order_id, file_snapshot_sha256, quote_snapshot_sha256 })`

Behavior:

- stable object key ordering
- array order preserved by caller-provided order
- UTF-8 hashing through Node crypto
- explicit `null` vs missing field behavior
- 64-character lowercase hex SHA-256 output
- candidate identity versioned as `production_candidate_identity_v1`

## 4. Sensitive Data Guard

Implemented:

```ts
assertNoSensitiveApprovalCandidateData(snapshotOrRecord)
```

Rejected sensitive field names or obvious sensitive content:

- worker token
- authorization
- OpenID
- phone/mobile/tel
- email
- payment numbers and transaction ids
- refund ids
- private key
- certificate
- APIv3 key
- password
- secret

Verified:

- `order_no` is not falsely rejected as a phone number
- SHA/file/order/job ids may remain in snapshots

## 5. Approval Helper

Implemented:

```ts
createApprovalAuditRecord(db, input)
```

Behavior:

- permits only `APPROVAL_OPERATOR` and `ADMIN`
- permits only `approve`, `reject`, `request_change`
- validates approval statuses
- canonicalizes and stores snapshot JSON
- rejects sensitive snapshot data
- inserts only `approval_audit_records`
- returns the inserted approval row and derived status

Explicit non-effects:

- no order update
- no candidate creation
- no `slicing_job` creation
- no Worker or PrusaSlicer action

## 6. Candidate Helper

Implemented:

```ts
createProductionCandidateFromApprovedOrder(db, input)
```

Behavior:

- permits only `PRODUCTION_OPERATOR` and `ADMIN`
- verifies `approval_id` exists
- verifies approval `order_id` matches input `order_id`
- requires latest approval for the order to be `approve / APPROVED`
- rejects `reject` and `request_change`
- computes:
  - `file_snapshot_sha256`
  - `quote_snapshot_sha256`
  - `candidate_identity_sha256`
- inserts `production_candidates`
- inserts `production_candidate_audit_events` with `event_type=create`
- returns `{ candidate, created: true }` on creation
- returns the existing active candidate with `{ created: false }` for duplicate active identity

Explicit non-effects:

- no `slicing_job` creation
- no Worker start
- no PrusaSlicer run
- no order/quote/payment/file/WeChat Pay mutation

## 7. State Transition Helpers

Implemented:

- `markProductionCandidateReady(db, input)`
- `cancelProductionCandidate(db, input)`
- `startManualExecution(db, input)`
- `completeProductionCandidate(db, input)`

Allowed transitions:

- `CREATED -> READY_FOR_PRODUCTION`
- `CREATED -> CANCELLED`
- `READY_FOR_PRODUCTION -> MANUAL_EXECUTION_STARTED`
- `READY_FOR_PRODUCTION -> CANCELLED`
- `MANUAL_EXECUTION_STARTED -> COMPLETED`
- `MANUAL_EXECUTION_STARTED -> CANCELLED`

Rejected transitions include:

- `CREATED -> MANUAL_EXECUTION_STARTED`
- `READY_FOR_PRODUCTION -> COMPLETED`
- `COMPLETED -> CANCELLED`
- `CANCELLED -> COMPLETED`

Current-stage boundary:

- `startManualExecution` records candidate state only.
- It does not create `slicing_job`.
- It does not start Worker.
- It does not run PrusaSlicer.

## 8. Audit Transaction Behavior

Candidate helper transactions:

- candidate create and `create` audit event are inserted in one transaction
- state update and audit event insert are performed in one transaction
- failed state transitions roll back both candidate status update and audit insert

Application-layer append-only protection:

- no update/delete audit helper is provided
- normal helper flow only inserts audit rows
- audit event counts are verified in tests

## 9. Local Integration Result

Script:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node scripts/phase05-l2-local-schema-helper-integration.mjs
```

Result:

```json
{
  "approval_count": 1,
  "audit_events": ["create", "mark_ready", "manual_start", "complete"],
  "candidate_count": 1,
  "final_status": "COMPLETED",
  "slicing_jobs_count": 0
}
```

The script uses a temporary SQLite database and removes it after completion.

## 10. Test Results

New L2 tests:

```text
node --experimental-strip-types --experimental-specifier-resolution=node --test tests/productionCandidateSchema.test.mjs tests/productionCandidateCanonicalJson.test.mjs tests/productionCandidateApprovalHelpers.test.mjs tests/productionCandidateHelpers.test.mjs tests/productionCandidateMigration.test.mjs
```

Result:

```text
tests 24
pass 24
fail 0
```

Existing focused regression:

```text
node --experimental-strip-types --experimental-specifier-resolution=node --test tests/operatorConsoleRedact.test.mjs tests/operatorConsoleClassifier.test.mjs tests/operatorConsolePending.test.mjs tests/operatorConsoleRunner.test.mjs tests/operatorConsoleReadonlyPreview.test.mjs tests/workerSlicingClient.test.mjs tests/workerSlicingApi.test.mjs tests/workerSlicingJobs.test.mjs tests/workerLocalSync.test.mjs tests/workerApi.test.mjs
```

Result:

```text
tests 116
pass 116
fail 0
```

Full test suite:

```text
npm test
```

Result:

```text
tests 382
pass 382
fail 0
```

## 11. Lint Result

Command:

```text
npm run lint
```

Result:

```text
passed
```

## 12. Build Result

Command:

```text
npm run build
```

Result:

```text
passed
```

## 13. Production Impact

Production impact: none.

Confirmed:

- no production deployment
- no production database migration
- no production database write
- no production env change
- no Worker start
- no PrusaSlicer run
- no Slicing Worker systemd service
- no real approval
- no real production candidate
- no real `slicing_job`
- no order change
- no quote or amount change
- no payment or WeChat Pay change
- no upload limit change
- no customer status change
- no schema auto-attachment to app startup

## 14. Risks

- The L2 schema/helper is intentionally not connected to production startup. A future phase must explicitly decide how and when to deploy the additive schema.
- SQLite cannot enforce append-only audit records by application helper alone. Current protection is application-layer only; future production hardening may add database triggers if approved.
- Sensitive-data detection is conservative for obvious fields and content. Future phases should keep tests updated when snapshot shapes expand.

## 15. Rollback Method

Local development rollback:

- revert or remove the new `productionCandidate*` backend modules
- remove the new `productionCandidate*` tests and local integration script
- revert the `changelog/CHANGELOG.md` entry

Production rollback:

- not applicable for Phase05-L2 because no production deployment or production migration was performed.

## 16. Next Stage Recommendation

Phase05-L3 Production Read-only Migration Rehearsal may proceed after review approval.

Recommended L3 boundaries:

- use a production database copy only
- rehearse the additive schema on the copy
- verify idempotency
- verify `integrity_check` and `foreign_key_check`
- verify no business table data changes
- do not migrate production live database
- do not create real approval/candidate/slicing data
- do not start Worker or PrusaSlicer
