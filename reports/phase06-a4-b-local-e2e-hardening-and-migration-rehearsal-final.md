# Phase06-A4-B Local E2E Hardening And Migration Rehearsal Final

## Execution Time

- 2026-07-18 11:10:09 +08:00

## Baseline Commit

- Baseline HEAD: `c87ff52f4cedb8c21e1230ff3d692f3de07ac53b`
- Working branch: `codex/phase06-a2-b-rc`
- Release commit: final pushed HEAD recorded in the operator final response
- Parent commit: `c87ff52f4cedb8c21e1230ff3d692f3de07ac53b`

## Modified Files

- `changelog/CHANGELOG.md`
- `reports/phase06-a4-a-online-confirmation-order-messages-final.md`
- `reports/phase06-a4-b-local-e2e-hardening-and-migration-rehearsal-final.md`
- `scripts/phase06-a4-apply-order-workbench-write-schema.mjs`
- `src/app/account/orders/[id]/page.tsx`
- `src/app/api/operator/workbench/orders/[id]/confirm-and-reply/route.ts`
- `src/backend/operatorWorkbench.ts`
- `src/backend/orderWorkbenchOnlineSync.ts`
- `src/backend/orderWorkbenchWriteSchema.ts`
- `tests/orderWorkbenchLocalDraftsAndSlicing.test.mjs`
- `tests/orderWorkbenchOnlineConfirmation.test.mjs`
- `tests/orderWorkbenchWriteMigration.test.mjs`
- `worker/order-workbench/lib/cloudClient.mjs`
- `worker/order-workbench/lib/render.mjs`
- `worker/order-workbench/server.mjs`

## Idempotency Fingerprint

Added canonical request fingerprint:

- Fixed field order canonical JSON.
- SHA-256 digest.
- Fields: `order_id`, `expected_order_version`, `confirmed_quote_amount_cents`, `lead_time_min_hours`, `lead_time_max_hours`, `estimated_ship_at`, `message_type`, `message_body`.
- Excludes operator token, browser-submitted `operator_id`, customer data, and rendered HTML.
- Stored as `request_fingerprint` on `order_messages`, `operator_order_confirmations`, and `operator_order_audit_events`.

Behavior:

- Same `client_request_id` and same fingerprint returns the original success result without duplicate rows.
- Same `client_request_id` with different price, lead time, or message returns `409 IDEMPOTENCY_KEY_REUSED`.
- Failed transactions do not occupy the idempotency key.
- Concurrent identical requests create only one confirmation/message/audit row group.

## Order Version Fields

Canonical order version now covers:

- `orders.id`
- `orders.customer_id`
- `orders.updated_at`
- `orders.status`
- `orders.payment_status`
- `orders.material`
- `orders.color`
- `orders.quantity`
- file collection digest from file id, size, material, color, quantity, and created time
- customer service request count, latest id, and latest updated time when available
- order message count, latest id, latest CUSTOMER sender id, and latest created time
- operator confirmation count, latest id, and latest created time

Excluded:

- Token
- OpenID
- phone
- email
- payment serials
- message body raw text
- customer file content

Conflict behavior:

- `expected_order_version` mismatch returns `409 ORDER_VERSION_CONFLICT`.
- Customer service changes, customer messages, file changes, order material/color/quantity changes, and new operator confirmations are covered.
- Unrelated operator audit-only events do not create false conflicts.

## Schema Readiness

Added:

- `ORDER_WORKBENCH_WRITE_SCHEMA_VERSION = 1`
- `verifyOrderWorkbenchWriteSchema(db)`

Readiness checks cover:

- all three write tables
- required columns
- named indexes
- `CHECK`
- `FOREIGN KEY`
- `UNIQUE`
- `schema_version`

Write API behavior:

- Missing or structurally invalid schema returns `503 WORKBENCH_WRITE_SCHEMA_NOT_READY`.
- No automatic schema creation.
- No partial business write.
- No SQL stack trace is returned.

Customer page behavior:

- Missing write tables safely produce empty manual confirmation/message displays.
- Existing order read continues.

## Transaction Atomicity

One successful request creates exactly:

- `operator_order_confirmations = 1`
- `order_messages = 1`
- `operator_order_audit_events = 1`

Injected failure coverage:

- after confirmation insert
- after message insert
- during audit stage
- before commit

All injected failures roll back all three tables.

## Customer Ownership And Visibility

Verified:

- customer-visible operator messages are scoped by `orders.customer_id`
- other customers cannot read the order messages
- `customer_visible=0` messages remain hidden
- internal OPERATOR and SYSTEM messages remain hidden
- script/img/HTML payloads remain text data and are not emitted through visible message reads
- real customers are rejected by the operator write API with fail-closed TEST-only checks

## Local End-to-end Result

Temporary SQLite local E2E flow passed:

1. Local Workbench draft saved price, lead time, and reply.
2. Workbench prepared online sync.
3. Second confirmation page generated expected payload.
4. Workbench submitted to a fixture cloud API transaction.
5. Fixture customer-visible read returned:
   - manual confirmed quote
   - manual confirmed lead time
   - customer-visible reply
6. Repeating the same request did not duplicate rows.
7. Reusing the same key with a changed message returned conflict.
8. Stale order version returned conflict.
9. Real-customer writes remain rejected.

## Notification Suppression

- No SMTP helper was called.
- No WeChat notification helper was called.
- No real customer email was used for delivery.
- Notification delivery was not implemented or triggered in A4-B.

## Migration Script

Added guarded script:

- `scripts/phase06-a4-apply-order-workbench-write-schema.mjs`

Required invocation:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node scripts/phase06-a4-apply-order-workbench-write-schema.mjs --db <explicit-sqlite-path> --confirm PHASE06_A4_ORDER_WORKBENCH_WRITE_SCHEMA_DEPLOY
```

Guardrails:

- requires explicit `--db`
- rejects file URLs
- rejects missing database path
- rejects missing confirmation marker
- does not run on import
- does not call `initDatabase`
- adds only the three Workbench write tables and approved indexes
- inserts no business rows

## Working Copy Migration Rehearsal

Source database:

- `C:\Users\21899\Documents\make3d-platform\data\make3d.db`

Working copy:

- `C:\Users\21899\Documents\make3d-platform-phase06-a2-rc\tmp\phase06-a4-b-rehearsal\make3d.phase06-a4-b-working.20260718-110713.db`

Source SHA-256:

- before: `ba864e8345a15b0db3ac8d5c5fa2cc2841eb1524a50b01a0c52a11098e4b1d95`
- after: `ba864e8345a15b0db3ac8d5c5fa2cc2841eb1524a50b01a0c52a11098e4b1d95`

First migration:

- `integrity_check = ok`
- `foreign_key_check_count = 0`
- schema ready after migration
- `business_counts_unchanged = true`
- `write_counts_zero = true`

Second migration:

- idempotent
- `integrity_check = ok`
- `foreign_key_check_count = 0`
- business counts unchanged
- write counts unchanged and zero

Business counts on working copy:

- `orders = 2`
- `files = 2`
- `local_file_sync_jobs = null`
- `slicing_jobs = null`
- `slicing_job_attempts = null`
- `order_payments = 0`
- `wechat_refunds = 0`
- `payment_settings = 1`
- `approval_audit_records = null`
- `production_candidates = null`
- `production_candidate_audit_events = null`

Live/source database remained unchanged.

## Tests

Focused A4 and required regression:

- `node --test tests/orderWorkbenchOnlineConfirmation.test.mjs tests/orderWorkbenchLocalDraftsAndSlicing.test.mjs tests/orderWorkbenchWriteMigration.test.mjs tests/testClassification.test.mjs tests/orderWorkbenchCloudApi.test.mjs tests/orderWorkbenchLocalFiles.test.mjs tests/orderWorkbenchServerSecurity.test.mjs tests/workerLocalSync.test.mjs tests/workerApi.test.mjs`
- Result: 50 passed, 0 failed, 0 skipped.

Full regression:

- `npm test`
- Result: 425 total, 424 passed, 1 skipped, 0 failed.
- Existing skip is outside A4专项测试; A4专项测试 had 0 skipped.

Lint:

- `npm run lint`
- Result: passed.

Build:

- `npm run build`
- Result: passed.

## Production Impact

- No production deployment.
- No live production database write.
- No production environment change.
- No production TEST order write.
- No real customer write.
- No customer notification.
- No order status change.
- No order amount or payment change.
- No refund change.
- No WeChat Pay change.
- No upload change.
- No `slicing_job`.
- No PrusaSlicer execution.
- No Slicing Worker start.

## Release Commit And Push

- Release commit: final pushed HEAD recorded in the operator final response
- Push target: `origin/phase05-worker-slicing-candidate`
- Push status: `pending at report write; updated after normal push`

## Next Stage

Allowed after review:

- Phase06-A4-C Guarded Production Additive Schema Migration And TEST-only Live Sync Acceptance

Do not enter A4-C without explicit approval.
