# Phase05-L3 Production Read-only Migration Rehearsal Final

## Summary

- Phase: Phase05-L3 Production Read-only Migration Rehearsal
- Execution time: 2026-07-17 12:24:29 +08:00
- Status: completed
- Scope: rehearse Approval + Production Candidate additive schema against a production database copy only
- Production deployment: not performed
- Live production database migration/write: not performed
- Real approval/candidate/slicing job creation: not performed
- Worker / PrusaSlicer: not started
- Next phase recommendation: Phase05-L4 Guarded Production Additive Schema Deploy may proceed after review approval

## 1. Production HEAD

Production repository:

```text
/opt/make3d-platform
```

Production HEAD:

```text
052ab1aa28676087f246b2d4659048868cdb5147
```

Production branch state:

```text
HEAD
```

Local repository HEAD:

```text
052ab1aa28676087f246b2d4659048868cdb5147
```

## 2. Live DB Read-only Baseline

Live DB paths:

```text
host:      /opt/make3d-platform/data/make3d.db
container: /app/data/make3d.db
```

Live DB metadata before rehearsal:

```text
size=524288
owner=root:root
mode=644
sha256=a890870d23c4dc369dd683d92d110cf7e74e38b8f590a3eb6c8c7af6a40ee749
```

Live DB health before rehearsal:

```text
integrity_check=ok
foreign_key_check_count=0
```

Business table counts before rehearsal:

```text
orders=22
files=24
local_file_sync_jobs=13
slicing_jobs=13
slicing_job_attempts=21
order_payments=8
wechat_refunds=3
payment_settings=1
```

L1/L2 tables before rehearsal:

```text
approval_audit_records=false
production_candidates=false
production_candidate_audit_events=false
```

No live DB `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `ALTER`, or migration command was executed.

## 3. Source Backup

Source backup path:

```text
/opt/make3d-platform/backups/make3d.db.phase05-l3-rehearsal-source.20260717-121602.bak
```

Source backup metadata:

```text
size=524288
owner=root:root
mode=600
sha256=a890870d23c4dc369dd683d92d110cf7e74e38b8f590a3eb6c8c7af6a40ee749
```

Source backup health:

```text
integrity_check=ok
foreign_key_check_count=0
```

Source backup business table counts:

```text
orders=22
files=24
local_file_sync_jobs=13
slicing_jobs=13
slicing_job_attempts=21
order_payments=8
wechat_refunds=3
payment_settings=1
```

Source backup L1/L2 tables before rehearsal:

```text
approval_audit_records=false
production_candidates=false
production_candidate_audit_events=false
```

## 4. Working Copy

Host-side working copy path:

```text
/opt/make3d-platform/backups/make3d.db.phase05-l3-rehearsal-working.20260717-121602.db
```

Container rehearsal working copy path:

```text
/tmp/make3d.db.phase05-l3-rehearsal-working.20260717-121602.db
```

Working copy metadata before schema rehearsal:

```text
size=524288
owner=root:root
mode=600
sha256=a890870d23c4dc369dd683d92d110cf7e74e38b8f590a3eb6c8c7af6a40ee749
```

Working copy metadata after schema rehearsal:

```text
size=585728
owner=root:root
mode=600
sha256=b754fbc6786b98699d5a1b598ae6e45ef6b535008f7d2d3b92e8e5af7daea373
```

The changed working copy is preserved at the host-side working copy path for audit.

## 5. Schema Rehearsal Result

Target:

```text
working copy only
```

Executed helper:

```text
applyApprovalCandidateSchema(db)
```

Execution method:

- temporary helper code copied to `/tmp/phase05-l3-code-20260717-121356`
- Node executed inside the existing `make3d-platform` container
- live DB was opened only in read-only mode
- schema helper was executed only against the container `/tmp` working copy

Tables created on working copy:

```text
approval_audit_records=true
production_candidates=true
production_candidate_audit_events=true
```

New table row counts after first and second apply:

```text
approval_audit_records=0
production_candidates=0
production_candidate_audit_events=0
```

Working copy health after first and second apply:

```text
integrity_check=ok
foreign_key_check_count=0
```

## 6. Index Verification

Indexes verified on working copy:

```text
idx_approval_audit_records_order_created=true
idx_approval_audit_records_customer_created=true
idx_approval_audit_records_client_request=true
idx_production_candidates_order_created=true
idx_production_candidates_customer_created=true
idx_production_candidates_status_created=true
idx_production_candidates_approval=true
idx_production_candidates_active_identity=true
idx_candidate_audit_events_candidate_created=true
idx_candidate_audit_events_client_request=true
```

Partial unique index SQL verified:

```sql
CREATE UNIQUE INDEX idx_production_candidates_active_identity
ON production_candidates(order_id, file_snapshot_sha256, quote_snapshot_sha256)
WHERE status IN (
  'CREATED',
  'READY_FOR_PRODUCTION',
  'MANUAL_EXECUTION_STARTED'
)
```

## 7. Idempotency Verification

`applyApprovalCandidateSchema(db)` was executed twice against the same working copy.

Result:

```text
second_apply=success
schema_duplicate=false
index_duplicate=false
integrity_check=ok
foreign_key_check_count=0
new_table_rows=0
```

## 8. Business Table Counts Before / After

Working copy business counts before first apply:

```text
orders=22
files=24
local_file_sync_jobs=13
slicing_jobs=13
slicing_job_attempts=21
order_payments=8
wechat_refunds=3
payment_settings=1
```

Working copy business counts after second apply:

```text
orders=22
files=24
local_file_sync_jobs=13
slicing_jobs=13
slicing_job_attempts=21
order_payments=8
wechat_refunds=3
payment_settings=1
```

Conclusion:

```text
business_counts_changed=false
```

## 9. Live DB Unchanged Proof

Live DB metadata after rehearsal:

```text
size=524288
owner=root:root
mode=644
sha256=a890870d23c4dc369dd683d92d110cf7e74e38b8f590a3eb6c8c7af6a40ee749
```

Live DB health after rehearsal:

```text
integrity_check=ok
foreign_key_check_count=0
```

Live DB business table counts after rehearsal:

```text
orders=22
files=24
local_file_sync_jobs=13
slicing_jobs=13
slicing_job_attempts=21
order_payments=8
wechat_refunds=3
payment_settings=1
```

Live DB L1/L2 table presence after rehearsal:

```text
approval_audit_records=false
production_candidates=false
production_candidate_audit_events=false
```

Conclusion:

```text
live_db_changed=false
live_db_new_tables_created=false
```

## 10. Service Status

Production container before and after:

```text
make3d-platform / service make3d: Up 19 hours
```

Nginx before and after:

```text
active
```

Remote host file-sync unit:

```text
not installed on production host
```

Local WSL file-sync Worker after rehearsal:

```text
active
pid=287
```

Remote process checks before and after:

```text
PrusaSlicer process count=0
Slicing Worker process count=0
Slicing Worker systemd unit count=0
```

Local WSL checks:

```text
PrusaSlicer process count=0
Slicing Worker process count=0
Slicing Worker systemd unit count=0
```

No Worker or PrusaSlicer execution was performed.

## 11. Test Results

L2 tests:

```text
node --experimental-strip-types --experimental-specifier-resolution=node --test tests/productionCandidateSchema.test.mjs tests/productionCandidateCanonicalJson.test.mjs tests/productionCandidateApprovalHelpers.test.mjs tests/productionCandidateHelpers.test.mjs tests/productionCandidateMigration.test.mjs
```

Result:

```text
tests=24
pass=24
fail=0
```

Focused Operator / Worker regression:

```text
tests=116
pass=116
fail=0
```

Full regression:

```text
npm test
tests=382
pass=382
fail=0
```

## 12. Lint Result

Command:

```text
npm run lint
```

Result:

```text
passed
```

## 13. Build Result

Command:

```text
npm run build
```

Result:

```text
passed
```

## 14. Production Impact

Production impact: none.

Confirmed:

- no production deployment
- no live production DB migration
- no live production DB write
- no real approval record
- no real production candidate
- no real slicing job
- no order mutation
- no quote or price mutation
- no payment, refund, or WeChat Pay mutation
- no upload mutation
- no environment variable change
- no Docker restart
- no Nginx restart
- no Worker start
- no PrusaSlicer run
- no Slicing Worker systemd creation
- no Token, OpenID, phone, email, payment identifier, private key, certificate, or APIv3 key output

## 15. Notes

- The first attempted remote command failed before any database operation because host-level `node` is not installed. It stopped before backup creation or migration.
- The successful rehearsal used container Node and copied only temporary helper code to `/tmp`; production code was not deployed or replaced.
- A remote production host `make3d-file-sync-worker.service` unit is not installed; the WSL local file-sync Worker remains active and was not restarted.

## 16. Next Stage Recommendation

Phase05-L4 Guarded Production Additive Schema Deploy may proceed after review approval.

Recommended L4 boundaries:

- deploy only additive Approval + Production Candidate schema
- create fresh production database backup first
- record production HEAD and service state
- run `integrity_check` and `foreign_key_check`
- verify new tables exist and are empty
- verify business table counts remain unchanged
- do not create real approval/candidate/slicing rows
- do not start Worker or PrusaSlicer
- do not modify orders, quotes, payments, WeChat Pay, upload limits, or customer status
