# Phase05-L1 Approval + Production Candidate Schema Freeze Final

## Summary

- Phase: Phase05-L1 Approval + Production Candidate Schema Freeze
- Date: 2026-07-17
- Status: design/schema contract frozen
- Scope: Approval audit, Production Candidate, Candidate audit, helper/API contracts, migration design, and future test plan
- Production deployment: not performed
- Production database migration/write: not performed
- Real approval/candidate/slicing job creation: not performed
- Worker / PrusaSlicer: not started
- Next phase recommendation: Phase05-L2 local-only schema/helper implementation may proceed after review approval

This phase freezes the contract between the already designed approval workflow and the future production candidate workflow. It does not implement production execution and does not create any real operational data.

## Source Design Inputs

Reviewed local project artifacts:

- `reports/phase05-k-f-manual-real-customer-approval-design-final.md`
- `reports/phase05-l-production-candidate-workflow-design-final.md`
- Current schema declarations in `src/backend/database.ts` for:
  - `orders`
  - `files`
  - `local_file_sync_jobs`
  - `slicing_jobs`
  - `slicing_job_attempts`
  - `order_payments`
  - `wechat_refunds`
  - `payment_settings`

Existing schema audit conclusion:

- Phase05-L1 remains additive.
- Existing order, file, payment, refund, WeChat Pay, upload, quote, and slicing tables are not modified in this design.
- Candidate/approval records must not write back to order status, quote amount, payment state, upload records, or WeChat Pay settings.

## 1. `approval_audit_records` Schema

Frozen future table:

```sql
CREATE TABLE IF NOT EXISTS approval_audit_records (
  approval_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  customer_id INTEGER,
  operator_id TEXT NOT NULL,
  operator_role TEXT NOT NULL,
  action TEXT NOT NULL,
  approval_status_before TEXT,
  approval_status_after TEXT NOT NULL,
  reason TEXT,
  risk_flags_json TEXT NOT NULL,
  order_snapshot_json TEXT NOT NULL,
  file_snapshot_json TEXT NOT NULL,
  quote_snapshot_json TEXT NOT NULL,
  snapshot_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_request_id TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CHECK (operator_role IN ('APPROVAL_OPERATOR', 'ADMIN')),
  CHECK (action IN ('approve', 'reject', 'request_change')),
  CHECK (
    approval_status_before IS NULL OR
    approval_status_before IN (
      'PENDING_REVIEW',
      'APPROVED',
      'REJECTED',
      'NEED_CUSTOMER_CONFIRM'
    )
  ),
  CHECK (approval_status_after IN (
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'NEED_CUSTOMER_CONFIRM'
  ))
);
```

Recommended indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_approval_audit_records_order_created
ON approval_audit_records(order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_approval_audit_records_customer_created
ON approval_audit_records(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_approval_audit_records_client_request
ON approval_audit_records(client_request_id);
```

Append-only rules:

- Ordinary product code must not `UPDATE` or `DELETE` approval audit records.
- A new decision is represented by a new row.
- The latest approval status is derived by the newest valid audit row for the order.
- Any future administrative correction must be a new compensating audit row, not an overwrite.

Sensitive data exclusion:

- Do not store Worker Token.
- Do not store OpenID.
- Do not store raw phone or email.
- Do not store `payment_no`, `out_trade_no`, full transaction id, refund id, private key, certificate, or APIv3 key.
- Snapshots must contain masked or hash-only values for customer/contact/payment-adjacent fields if such fields are ever needed.

## 2. `production_candidates` Schema

Frozen future table:

```sql
CREATE TABLE IF NOT EXISTS production_candidates (
  candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  customer_id INTEGER,
  file_snapshot_json TEXT NOT NULL,
  quote_snapshot_json TEXT NOT NULL,
  risk_snapshot_json TEXT NOT NULL,
  material_snapshot_json TEXT NOT NULL,
  color_snapshot_json TEXT,
  quantity_snapshot_json TEXT NOT NULL,
  profile_snapshot_json TEXT NOT NULL,
  file_snapshot_sha256 TEXT NOT NULL,
  quote_snapshot_sha256 TEXT NOT NULL,
  candidate_identity_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  cancelled_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (approval_id) REFERENCES approval_audit_records(approval_id) ON DELETE RESTRICT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CHECK (length(file_snapshot_sha256) = 64),
  CHECK (length(quote_snapshot_sha256) = 64),
  CHECK (length(candidate_identity_sha256) = 64),
  CHECK (status IN (
    'CREATED',
    'READY_FOR_PRODUCTION',
    'MANUAL_EXECUTION_STARTED',
    'COMPLETED',
    'CANCELLED'
  ))
);
```

Recommended indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_production_candidates_order_created
ON production_candidates(order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_production_candidates_customer_created
ON production_candidates(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_production_candidates_status_created
ON production_candidates(status, created_at);

CREATE INDEX IF NOT EXISTS idx_production_candidates_approval
ON production_candidates(approval_id);
```

Active identity uniqueness:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_candidates_active_identity
ON production_candidates(order_id, file_snapshot_sha256, quote_snapshot_sha256)
WHERE status IN (
  'CREATED',
  'READY_FOR_PRODUCTION',
  'MANUAL_EXECUTION_STARTED'
);
```

Boundary:

- A Production Candidate is not an order.
- A Production Candidate is not a payment, refund, shipment, slicing job, Worker lock, or PrusaSlicer run.
- Creating or updating a Production Candidate must not create a `slicing_job`.
- Creating or updating a Production Candidate must not update order status, quote amount, payment state, uploaded file records, WeChat Pay settings, or customer records.

## 3. `production_candidate_audit_events` Schema

Frozen future table:

```sql
CREATE TABLE IF NOT EXISTS production_candidate_audit_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  operator_role TEXT NOT NULL,
  status_before TEXT,
  status_after TEXT NOT NULL,
  reason TEXT,
  event_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_request_id TEXT,
  FOREIGN KEY (candidate_id) REFERENCES production_candidates(candidate_id) ON DELETE RESTRICT,
  CHECK (operator_role IN ('PRODUCTION_OPERATOR', 'ADMIN')),
  CHECK (event_type IN (
    'create',
    'mark_ready',
    'cancel',
    'manual_start',
    'complete'
  )),
  CHECK (
    status_before IS NULL OR
    status_before IN (
      'CREATED',
      'READY_FOR_PRODUCTION',
      'MANUAL_EXECUTION_STARTED',
      'COMPLETED',
      'CANCELLED'
    )
  ),
  CHECK (status_after IN (
    'CREATED',
    'READY_FOR_PRODUCTION',
    'MANUAL_EXECUTION_STARTED',
    'COMPLETED',
    'CANCELLED'
  ))
);
```

Recommended indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_candidate_audit_events_candidate_created
ON production_candidate_audit_events(candidate_id, created_at);

CREATE INDEX IF NOT EXISTS idx_candidate_audit_events_client_request
ON production_candidate_audit_events(client_request_id);
```

Audit rules:

- Every candidate state change must insert exactly one audit event.
- Candidate status update and audit event insert must happen in the same transaction.
- Candidate audit events are append-only.
- Ordinary product code must not overwrite or delete candidate audit events.

## 4. Candidate Transition Matrix

Allowed transitions:

| From | To | Event |
| --- | --- | --- |
| `NULL` | `CREATED` | `create` |
| `CREATED` | `READY_FOR_PRODUCTION` | `mark_ready` |
| `CREATED` | `CANCELLED` | `cancel` |
| `READY_FOR_PRODUCTION` | `MANUAL_EXECUTION_STARTED` | `manual_start` |
| `READY_FOR_PRODUCTION` | `CANCELLED` | `cancel` |
| `MANUAL_EXECUTION_STARTED` | `COMPLETED` | `complete` |
| `MANUAL_EXECUTION_STARTED` | `CANCELLED` | `cancel` |

Terminal states:

- `COMPLETED`
- `CANCELLED`

Forbidden transitions:

- `ORDER -> SLICING_JOB`
- `APPROVED -> SLICING_JOB`
- `CREATED -> SLICING_JOB`
- `READY_FOR_PRODUCTION -> SLICING_JOB`
- `COMPLETED -> CANCELLED`
- `CANCELLED -> COMPLETED`
- any transition that bypasses approval

Future design note:

- If `ABORTED` or `FAILED` becomes necessary for production execution, it should be introduced in a later design revision with explicit state semantics, audit event names, and rollback rules. It is not part of this frozen L1 state set.

## 5. Uniqueness and Idempotency Rules

Active identity:

```text
order_id + file_snapshot_sha256 + quote_snapshot_sha256
```

Rules:

- The same order/file snapshot/quote snapshot cannot have more than one active candidate.
- Active statuses are `CREATED`, `READY_FOR_PRODUCTION`, and `MANUAL_EXECUTION_STARTED`.
- Terminal statuses are `COMPLETED` and `CANCELLED`.
- Repeating the same identity after `COMPLETED` or `CANCELLED` is allowed only through a new approval/audit trail. The old terminal candidate remains preserved.
- Customer file changes must produce a new `file_snapshot_sha256` and require new approval.
- Customer quote, quantity, material, color, or profile changes must produce a new `quote_snapshot_sha256` or candidate identity and require new approval.
- The active unique index must not be replaced by a global unique index.

Forbidden uniqueness:

- Do not add global `UNIQUE(order_id)`.
- Do not add global `UNIQUE(file_snapshot_sha256)`.
- Do not add global `UNIQUE(quote_snapshot_sha256)`.
- Do not add global `UNIQUE(candidate_identity_sha256)` unless a later phase proves it preserves terminal audit history.

## 6. Canonical JSON and Hash Rules

Canonical JSON requirements:

- Use stable object key ordering.
- Use stable array ordering based on deterministic source order, such as ascending file id.
- Use UTF-8.
- Use explicit `null` for known absent nullable fields.
- Omit only fields that are explicitly versioned as unsupported.
- Use integer cents for money.
- Use integer grams/milligrams or explicit unit fields for weights.
- Use integer milliseconds or ISO-8601 UTC strings for timestamps, consistently per snapshot version.
- Use millimeters for dimensions with a documented precision strategy.
- Do not use raw JavaScript `JSON.stringify` on arbitrary object construction as the hash authority unless the object was first canonicalized.

Hash definitions:

```text
file_snapshot_sha256 = SHA256(canonical_json(file_snapshot_json))

quote_snapshot_sha256 = SHA256(canonical_json(quote_snapshot_json))

candidate_identity_sha256 =
  SHA256(canonical_json({
    identity_version: "production_candidate_identity_v1",
    order_id,
    file_snapshot_sha256,
    quote_snapshot_sha256
  }))
```

Snapshot versioning:

- `file_snapshot_json` must include a snapshot version such as `production_file_v1`.
- `quote_snapshot_json` must include a snapshot version such as `production_quote_v1`.
- `risk_snapshot_json` must include a snapshot version such as `production_risk_v1`.
- Future schema changes must increment snapshot versions rather than silently changing hash semantics.

## 7. Permission Boundaries

### READONLY_OPERATOR

Allowed:

- Read-only preview.
- Real-customer queue observation.
- File/quote/risk/slicing metadata preview with masking.

Forbidden:

- Approval write.
- Candidate creation.
- Candidate state change.
- Worker invocation.
- PrusaSlicer invocation.
- `POST`, `PUT`, `PATCH`, `DELETE`.

### APPROVAL_OPERATOR

Allowed in future implementation:

- Create approval audit records for `approve`, `reject`, and `request_change`.

Forbidden:

- Create production candidate directly.
- Start Worker.
- Run PrusaSlicer.
- Create `slicing_job`.
- Change order, quote, payment, file, upload, WeChat Pay, or customer records.

### PRODUCTION_OPERATOR

Allowed in future implementation:

- Create candidate from an approved order.
- Mark candidate ready.
- Cancel candidate with reason.
- Mark manual execution start.
- Mark candidate complete.

Forbidden:

- Bypass approval.
- Change order price or payment.
- Change uploaded files.
- Change WeChat Pay settings.
- Start a persistent Worker service.
- Execute automatic slicing without a separate future manual execution contract.

### ADMIN

Allowed:

- Future role management.
- Emergency disablement.
- Audit access.

Requirement:

- ADMIN role changes must be audited. ADMIN authority must not silently bypass approval or candidate audit records.

## 8. Helper/API Contract Design

This section freezes contracts only. It does not implement routes or helpers in this phase.

### `createApprovalAuditRecord`

Input:

- `order_id`
- `operator_id`
- `operator_role`
- `action`
- `reason`
- `risk_flags`
- canonical order/file/quote snapshots
- `client_request_id`

Output:

- inserted approval audit row
- derived approval status

Transaction:

- single insert transaction

Permission check:

- requires `APPROVAL_OPERATOR` or audited `ADMIN`

Forbidden side effects:

- no order update
- no candidate creation
- no slicing job creation
- no Worker or PrusaSlicer action

### `createProductionCandidateFromApprovedOrder`

Input:

- `approval_id`
- `order_id`
- `operator_id`
- canonical file/quote/risk/material/color/quantity/profile snapshots
- `client_request_id`

Output:

- `{ candidate, created }`
- if active duplicate identity exists, return existing active candidate with `created=false` or reject with a typed duplicate result, as chosen in implementation

Transaction:

- verify latest approval is `APPROVED`
- insert candidate
- insert `create` audit event
- commit atomically

Permission check:

- requires `PRODUCTION_OPERATOR` or audited `ADMIN`

Forbidden side effects:

- must not create `slicing_job`
- must not start Worker
- must not run PrusaSlicer
- must not update order/quote/payment/upload/WeChat Pay

### `markProductionCandidateReady`

Input:

- `candidate_id`
- `operator_id`
- `reason`
- readiness snapshot
- `client_request_id`

Output:

- updated candidate
- `mark_ready` audit event

Transaction:

- status `CREATED -> READY_FOR_PRODUCTION`
- candidate update and audit insert in one transaction

Permission check:

- requires `PRODUCTION_OPERATOR` or audited `ADMIN`

Forbidden side effects:

- must not create `slicing_job`
- must not start Worker
- must not run PrusaSlicer

### `cancelProductionCandidate`

Input:

- `candidate_id`
- `operator_id`
- `reason`
- `client_request_id`

Output:

- updated candidate
- `cancel` audit event

Transaction:

- allowed from `CREATED`, `READY_FOR_PRODUCTION`, or `MANUAL_EXECUTION_STARTED`
- update `cancelled_at`
- audit insert in the same transaction

Permission check:

- requires `PRODUCTION_OPERATOR` or audited `ADMIN`

Forbidden side effects:

- no order cancellation
- no refund
- no payment state change

### `startManualExecution`

Input:

- `candidate_id`
- `operator_id`
- `reason`
- `client_request_id`

Output:

- updated candidate
- `manual_start` audit event

Transaction:

- status `READY_FOR_PRODUCTION -> MANUAL_EXECUTION_STARTED`
- audit insert in the same transaction

Permission check:

- requires `PRODUCTION_OPERATOR` or audited `ADMIN`

Current-stage boundary:

- even after `manual_start`, this L1 contract does not start Worker and does not create `slicing_job`.
- future slicing job creation must require a separate later phase contract.

### `completeProductionCandidate`

Input:

- `candidate_id`
- `operator_id`
- completion snapshot
- `client_request_id`

Output:

- updated candidate
- `complete` audit event

Transaction:

- status `MANUAL_EXECUTION_STARTED -> COMPLETED`
- update `completed_at`
- audit insert in the same transaction

Permission check:

- requires `PRODUCTION_OPERATOR` or audited `ADMIN`

Forbidden side effects:

- no payment update
- no shipment update
- no automatic order completion

## 9. Migration Design

Migration type:

- additive only
- SQLite compatible
- idempotent

Future migration steps:

1. `CREATE TABLE IF NOT EXISTS approval_audit_records`.
2. Create approval indexes with `IF NOT EXISTS`.
3. `CREATE TABLE IF NOT EXISTS production_candidates`.
4. Create candidate indexes with `IF NOT EXISTS`.
5. Create partial active identity unique index with `IF NOT EXISTS`.
6. `CREATE TABLE IF NOT EXISTS production_candidate_audit_events`.
7. Create candidate audit indexes with `IF NOT EXISTS`.
8. Run `PRAGMA integrity_check`.
9. Run `PRAGMA foreign_key_check`.
10. Repeat migration on a copied database to prove idempotency before any production migration.

Explicit non-goals:

- no existing table column changes
- no production data migration
- no backfill from real orders
- no real approval creation
- no real production candidate creation
- no slicing job creation

Rollback design:

- Before any future production migration, create a SQLite database backup.
- If deployment fails before business use, restore the backup.
- If business use has begun, do not drop audit tables casually. Prefer forward corrective migration and preserve audit history.
- Code rollback must point to the pre-migration commit and include database compatibility notes.

## 10. Future Test Design

Approval tests:

- approval audit record is append-only
- approval record excludes Token, OpenID, phone, email, payment identifiers, private keys, certificates, and APIv3 key
- `READONLY_OPERATOR` cannot approve
- `APPROVAL_OPERATOR` can create approval audit record
- `APPROVAL_OPERATOR` cannot create candidate
- `reject` prevents candidate creation
- `request_change` prevents candidate creation until a later approval

Candidate tests:

- approved order can create candidate
- rejected order cannot create candidate
- duplicate active candidate is rejected or returns existing idempotent candidate
- `COMPLETED` candidate allows a new candidate only through new approval/audit trail
- `CANCELLED` candidate allows a new candidate only through new approval/audit trail
- changed file snapshot SHA requires new approval
- changed quote snapshot SHA requires new approval
- candidate creation does not create `slicing_job`
- `mark_ready` does not create `slicing_job`
- `manual_start` does not start Worker
- snapshots remain unchanged after later order/file/quote changes
- every candidate state change inserts an audit event
- illegal transitions are rejected
- sensitive fields are redacted from helper output and reports

Migration tests:

- migration is idempotent
- partial active identity unique index exists
- no global unique index blocks terminal history
- foreign key delete behavior restricts audit/candidate loss
- existing `orders`, `files`, `local_file_sync_jobs`, `slicing_jobs`, `slicing_job_attempts`, `order_payments`, `wechat_refunds`, and `payment_settings` behavior remains unchanged

## 11. Safety Boundaries

Phase05-L1 confirms:

- no production deployment
- no production database write
- no production migration
- no real approval
- no real production candidate
- no real `slicing_job`
- no Worker start
- no PrusaSlicer run
- no Slicing Worker systemd service
- no order status change
- no quote or price change
- no payment, refund, or WeChat Pay change
- no upload limit or file mutation
- no customer status change
- no Token/OpenID/contact/payment secret output

## 12. Phase05-L2 Readiness

Phase05-L2 may proceed only as local-only schema/helper implementation after review approval.

Recommended L2 boundaries:

- implement additive schema locally
- implement canonical JSON/hash helpers
- implement approval/candidate helper functions
- implement tests against temporary or copied SQLite databases
- do not migrate production
- do not create real approvals or candidates
- do not create slicing jobs
- do not start Worker or PrusaSlicer

L1 conclusion:

- Approval and Production Candidate schemas are frozen for implementation planning.
- The approval/candidate layer remains isolated from slicing execution.
- It is safe to request approval for Phase05-L2 local-only implementation.
