# Phase06-A4-A TEST-only Online Confirmation, Order Messages And Customer-page Sync Implementation

## Scope

- Implemented local Workbench flow for local quote draft, lead-time draft, and reply draft preparation.
- Added a guarded TEST-only online write API for appending manual confirmation and customer-visible order messages.
- Added customer order page read-only display for manual confirmation and operator messages.
- This phase was local implementation and test only.

## Modified Files

- `src/backend/orderWorkbenchWriteSchema.ts`
- `src/backend/orderWorkbenchOnlineSync.ts`
- `src/app/api/operator/workbench/orders/[id]/confirm-and-reply/route.ts`
- `src/backend/operatorWorkbench.ts`
- `src/app/account/orders/[id]/page.tsx`
- `worker/order-workbench/lib/cloudClient.mjs`
- `worker/order-workbench/lib/render.mjs`
- `worker/order-workbench/server.mjs`
- `tests/orderWorkbenchOnlineConfirmation.test.mjs`
- `tests/orderWorkbenchLocalDraftsAndSlicing.test.mjs`
- `changelog/CHANGELOG.md`

## Database Changes

Added explicit schema helper only:

- `applyOrderWorkbenchWriteSchema(db)`

New tables prepared for temporary SQLite and future controlled migration:

- `order_messages`
- `operator_order_confirmations`
- `operator_order_audit_events`

Important boundary:

- The helper is not attached to `initDatabase`.
- No automatic startup migration was added.
- No production database migration or production write was performed.

## API

Added:

- `POST /api/operator/workbench/orders/:id/confirm-and-reply`

Security and behavior:

- Auth uses `MAKE3D_LOCAL_WORKBENCH_TOKEN`.
- Missing or wrong token returns `401`.
- Worker token is rejected.
- Query-string token is rejected.
- Request body is allowlisted.
- Browser-submitted `operator_id`, `customer_id`, `is_test_account`, `payment_status`, and order status are ignored.
- The route rereads order/customer/TEST state from SQLite.
- Writes are allowed only when `customers.is_test_account=1` and the unified TEST helper returns authoritative TEST without fail-closed state.
- Real customers, NULL/missing authoritative flags, and invalid order/customer relation fail closed.

## Conflict And Idempotency

- Added canonical order version SHA-256 covering order fields, file digest, latest customer message/service request id, and latest operator confirmation id.
- `expected_order_version` mismatch returns conflict.
- `client_request_id` is unique and idempotent across confirmation, message, and audit rows.
- Duplicate requests return the first stored result without duplicating rows.
- Confirmation, message, and audit insertion run inside one transaction.
- Injected transaction failure test verifies rollback.

## Customer Page

- Customer order detail page now reads:
  - latest manual operator confirmation
  - customer-visible `order_messages`
- Reads are ownership-scoped by current session customer and `orders.customer_id`.
- Internal messages remain hidden.
- React text rendering is used; no `dangerouslySetInnerHTML` was introduced.
- Manual quote and lead time are shown as independent operator-confirmed information and do not mutate paid amount or order totals.

## Local Workbench

- Added online version and latest manual confirmation display.
- Added `Prepare sync` step from the local order detail page.
- Added second confirmation page with:
  - order no
  - TEST marker
  - old/new manual quote
  - old/new lead time
  - reply preview
  - TEST-only warning
- Added final `Confirm and sync to TEST order` POST through the local Workbench server.
- Token remains server-side and is not exposed to the browser.

## Configuration Changes

- No `.env` file was modified.
- No production environment variable was modified.
- Existing payment, WeChat Pay, upload, quote, and slicing configuration was not changed.

## Test Results

- `node --test tests/orderWorkbenchLocalDraftsAndSlicing.test.mjs tests/orderWorkbenchOnlineConfirmation.test.mjs`
  - 19 tests passed.
- `npm test`
  - 417 tests total.
  - 416 passed.
  - 1 skipped.
  - 0 failed.
- `npm run lint`
  - passed.
- `npm run build`
  - passed.

## Safety Checks

- No production deployment.
- No production database write.
- No Approval/Candidate migration.
- No slicing Worker start.
- No PrusaSlicer execution.
- No online `slicing_job` creation.
- No real customer write.
- No order status modification.
- No payment, refund, or WeChat Pay modification.
- No upload limit or upload logic modification.
- No notification delivery was implemented or triggered.

## Risks

- The new write tables still require a future explicit migration phase before production use.
- The customer page has a read path that safely returns empty data when the new tables do not exist, but the write API requires the explicit schema helper to have been applied.
- A future production deployment must include a guarded migration rehearsal and TEST-only acceptance before enabling real operator use.

## Rollback

- Revert this phase's code changes and remove the new route/helper files.
- If a future environment has applied the new schema, leave append-only audit tables in place unless a separate approved database rollback plan exists.
- No rollback is needed for production state from this phase because no production deployment or write was performed.

## Next Stage Recommendation

Allowed next step:

- Phase06-A4-B guarded local/TEST acceptance using a temporary SQLite database or explicitly approved TEST environment.

Do not proceed directly to production schema migration or real customer writes without a separate approval gate.
