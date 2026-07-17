# Phase06-A1 Local Order Workbench Audit And MVP Plan Final

## Summary

- Phase: Phase06-A1 Local Order Workbench audit and MVP plan
- Execution time: 2026-07-17
- Status: completed
- Production deployment: not performed
- Approval/Candidate schema migration: not performed
- Worker / PrusaSlicer / Slicing Worker: not started
- Payment, refund, WeChat Pay, quote amount, order amount, upload limit: not modified
- Next phase recommendation: Phase06-A2 Local Order Workbench read-only runnable MVP may proceed after review approval

## 0. Required A1 Audit Matrix

The current codebase was audited for the requested Phase06-A inputs:

| Item | Current state | Reuse decision |
| --- | --- | --- |
| Order list read API | No dedicated JSON operator API. Existing admin SSR page uses `searchOrders`. | Add operator read API instead of scraping SSR HTML. |
| Order detail read API | No dedicated JSON operator API. Existing backend has `getOrderById` and customer/admin pages. | Reuse backend loaders; expose allowlisted operator JSON. |
| Customer order detail page | Exists at `src/app/account/orders/[id]/page.tsx`. | Reuse and extend later for `order_messages`. |
| Quote / price update mechanism | Exists through admin final quote route and database fields. | Do not use in A2. For A4, add guarded operator confirmation API with version/idempotency checks. |
| Lead time fields | Existing order fields include estimated/final lead time values. | Reuse; A4 may add min/max/ship-at confirmation fields if needed. |
| Order remarks/messages | `orders.remark`, `admin_remark`, and `customer_service_requests` exist. No append-only order message table. | Add `order_messages` in A4 rather than overloading remarks. |
| Customer message API | `POST /api/account/customer-service` exists. | Reuse for customer support requests; later bridge customer-visible order messages. |
| Admin reply API | `POST /api/admin/customer-service/[id]/status` exists for request replies. | Reuse for support tickets; do not treat as canonical order timeline. |
| Notification table/unread | `wechat_notifications` exists. No general station notification/unread table. | Design `order_message_reads` or notification status in A5. |
| SMTP email notification | `src/backend/email.ts` exists. | Reuse in A5 only; not blocking MVP. |
| `files` and `local_file_sync_jobs` | Exist and are populated by order creation/file-sync Worker. | Reuse as source of file sync metadata. |
| Local file-sync Worker | Exists and stores local files under `/srv/make3d-worker/files`. | Reuse for local file availability; do not restart or modify in A2. |
| Worker Slicing and Parser | Existing Worker Slicing API, local Worker, PrusaSlicer parser, one-shot console flow. | Reuse in A3; no resident Worker. |
| Operator Console readonly preview | Exists in `worker/operator-console/lib/readonlyPreview.mjs`. | Reuse redaction, safe path, and preview concepts; build new local web workbench. |
| Admin/operator auth | Admin session exists; Worker token exists. No dedicated operator-workbench auth. | Add dedicated operator token; do not reuse Worker Token in browser. |

## 0.1 Current Order Schema

Primary table:

```text
orders
```

Workbench-relevant fields already present:

- identity: `id`, `order_no`, `customer_id`
- customer contact: `customer_name`, `phone`, `wechat`, `email`, `company`
- order inputs: `material`, `color`, `quantity`, `remark`
- online quote: `estimated_price`, `estimated_price_min`, `estimated_price_max`, `payable_price`, `final_price`, `price_adjustment_reason`, `final_price_updated_at`
- lead time: `estimated_lead_time_min_hours`, `estimated_lead_time_max_hours`, `estimated_lead_time_hours`, `final_lead_time_hours`
- production/admin notes: `production_note`, `internal_note`, `admin_remark`
- order/payment state: `status`, `payment_status`, `paid_at`, `payment_method`, `payment_confirmed_at`
- delivery: `shipping_method`, `shipping_fee`, `shipping_company`, `tracking_number`, `shipped_at`
- audit-ish timestamps: `created_at`, `updated_at`

Important boundary:

- Phase06 local handling state must not reuse `orders.status`.
- Phase06 local quote draft must not directly mutate `final_price` or `payable_price` until the A4 guarded sync flow is implemented and approved.

## 0.2 Current File Schema And Sync Chain

Primary file table:

```text
files
```

Workbench-relevant fields:

- `id`, `order_id`
- `filename`, `filepath`, `filesize`
- `material`, `color`, `quantity`
- geometry and risk: `bounding_box_x/y/z`, `volume`, `surface_area`, `risk_notice`, `risk_level`, `requires_manual_confirmation`
- quote data per file: `estimated_price_min`, `estimated_price_max`, `estimated_lead_time_min_hours`, `estimated_lead_time_max_hours`, `unit_price`, `subtotal_price`
- `created_at`

Sync table:

```text
local_file_sync_jobs
```

Workbench-relevant fields:

- `id`, `file_id`, `order_id`, `customer_id`, `order_no`
- `original_filename`, `stored_filename`, `relative_path`
- `file_size_bytes`, `sha256`
- `sync_status`, `attempt_count`, `worker_id`
- `local_path`, `local_sha256`, `local_synced_at`
- `last_error`, `source_version`, `worker_version`

Current sync chain:

```text
online order file
  -> files
  -> local_file_sync_jobs
  -> cloud Worker file-sync API
  -> WSL make3d-file-sync-worker
  -> /srv/make3d-worker/files
  -> local_sha256/local_synced_at
```

A2 must use the sync metadata and local filesystem verification; it must not read arbitrary production upload paths.

## 0.3 Current Quote / Lead Time Structure

Online quote values currently live on:

- `orders.estimated_price`
- `orders.estimated_price_min`
- `orders.estimated_price_max`
- `orders.payable_price`
- `orders.final_price`
- `orders.print_fee_total`
- `orders.packaging_fee`
- `orders.shipping_fee`
- `files.unit_price`
- `files.subtotal_price`

Lead time values currently live on:

- `orders.estimated_lead_time_min_hours`
- `orders.estimated_lead_time_max_hours`
- `orders.estimated_lead_time_hours`
- `orders.final_lead_time_hours`
- `files.estimated_lead_time_min_hours`
- `files.estimated_lead_time_max_hours`

Gap for Phase06-A4:

- No dedicated local quote draft table.
- No `confirmed_quote_amount_cents` integer-cent field for operator confirmation.
- No explicit `lead_time_min_hours`, `lead_time_max_hours`, `estimated_ship_at` confirmation record.
- Existing final quote admin route can update official order quote; Phase06 should not call it until the dedicated conflict/idempotency flow is in place.

## 0.4 Current Messages / Replies Structure

Current message-like structures:

- `orders.remark`: customer order remark, not append-only.
- `orders.admin_remark`: admin remark, not append-only and not a customer reply timeline.
- `customer_service_requests`: support-ticket table with `message`, `admin_note`, `customer_visible_reply`, status fields, and optional `order_id`.
- `wechat_notifications`: service-account notification diagnostics, not a general station message table.

Current reply visibility:

- Customer order detail loads `listCustomerServiceRequestsForCustomer(db, customer.id, order.id)`.
- Customer order detail displays `customerVisibleReply` for related customer service requests.

Gap:

- No append-only `order_messages`.
- No `client_request_id` idempotency for order replies.
- No `order_version_snapshot` stored with replies.
- No unread/read state for customer-visible order replies.

## 0.5 Current Customer Notification Structure

Reusable:

- SMTP helpers in `src/backend/email.ts`.
- WeChat notification table and helper flows for order/payment/refund.
- Existing customer order page can show related service request replies after login.

Missing for Local Order Workbench:

- Station notification table for order-message unread count.
- General unread customer message count in order list.
- Safe email notification for "new reply / quote or lead time updated".

Phase06-A5 should add notification without blocking A2/A3/A4.

## 0.6 Current Operator / Admin Permission

Current permission surfaces:

- Admin web pages use admin session through `requireAdminSession`.
- Customer pages use customer session.
- Worker APIs use Worker Token.
- Operator Console is local CLI and reads local env.

Gap:

- No dedicated operator workbench token or role model.
- Worker Token must not be used as browser/operator auth.
- Admin session should not be used as an implicit local operator token unless a future phase explicitly approves that simplification.

## 1. Existing Reusable Capabilities

### Orders and order pages

Reusable:

- `src/backend/database.ts`
  - `searchOrders`
  - `listOrders`
  - `listOrdersByCustomerId`
  - `getOrderById`
  - `getOrderByIdForCustomer`
  - `loadOrderDetail`
  - `getFileById`
- `src/app/admin/orders/page.tsx`
  - Existing admin order list page.
  - Supports search and order status filtering.
- `src/app/admin/orders/[id]/page.tsx`
  - Existing admin order detail page.
  - Shows order detail, uploaded files, payment records, WeChat notification diagnostics, slicer test controls, and internal/admin notes.
- `src/app/account/orders/[id]/page.tsx`
  - Existing customer order detail page.
  - Shows customer-facing order detail, files, payment state, and customer service records.
- `src/app/api/orders/route.ts`
  - Existing customer order creation API.

Gap:

- No dedicated JSON operator API for local workbench order list/detail.
- Admin pages are server-rendered and admin-session based; they are not a clean data source for a localhost-only workbench.
- Existing admin order APIs include status/final quote/payment actions that must not be used by Phase06-A MVP because they can mutate order status, quote, or payment.

### Files and local sync status

Reusable:

- `files` table stores order file metadata.
- `local_file_sync_jobs` table stores file sync state:
  - `file_id`
  - `order_id`
  - `customer_id`
  - `order_no`
  - `original_filename`
  - `stored_filename`
  - `relative_path`
  - `file_size_bytes`
  - `sha256`
  - `sync_status`
  - `worker_id`
  - `local_path`
  - `local_sha256`
  - `local_synced_at`
  - `last_error`
- Existing Worker file sync API:
  - `/api/worker/jobs/pending`
  - `/api/worker/jobs/:id/lock`
  - `/api/worker/jobs/:id/download`
  - `/api/worker/jobs/:id/verified`
  - `/api/worker/jobs/:id/failed`
- Existing WSL file-sync Worker saves files under `/srv/make3d-worker/files`.

Gap:

- No operator-facing order/file sync status API grouped by order.
- No local file existence/SHA verification endpoint for the operator workbench.
- No safe "open local directory" action yet.
- Existing admin/customer download APIs read production upload files, not local WSL synced files.

### Customer messages and replies

Reusable:

- `customer_service_requests` table already exists and can link to `order_id`.
- `createCustomerServiceRequest` supports customer-created support requests.
- `updateCustomerServiceRequest` supports admin note and customer-visible reply.
- `listCustomerServiceRequestsForCustomer` is already used by `src/app/account/orders/[id]/page.tsx`.
- `src/app/api/account/customer-service/route.ts` lets logged-in customers create support requests linked to an order.
- `src/app/api/admin/customer-service/[id]/status/route.ts` lets admin update customer service request status and `customer_visible_reply`.
- `src/app/admin/customer-service/page.tsx` shows request list, associated order, internal note, customer-visible reply, handled-by, and handled-at.
- Customer order detail page already displays `customerVisibleReply` for related service requests.

Gap:

- `customer_service_requests` is request-ticket based, not a general append-only order message timeline.
- There is no `order_messages` table.
- There is no operator reply API that appends a new order-scoped message independent of an existing customer request.
- There is no message type set for:
  - file received
  - file confirmed
  - need more info
  - file problem
  - need re-upload
  - manual quote required
  - free text reply
- Existing customer service update overwrites fields on a request row, so it does not satisfy an append-only order message audit requirement.

### Notifications

Reusable:

- `src/backend/email.ts`
  - New order notification email.
  - Customer order status email.
  - Password reset email.
- `src/backend/orderWorkflow.ts`
  - Shared status transition notification path.
- WeChat notification infrastructure exists for order/payment/refund events.

Phase06-A decision:

- Do not block MVP on email or WeChat notification.
- First version should make replies visible in customer order detail after login.
- Email notification can be Phase06-A5 or later.

### Local readonly preview and Operator Console

Reusable:

- `worker/operator-console/cli.mjs`
  - Local CLI menu.
  - System health.
  - Pending queue viewer.
  - Classifier.
  - One-shot dry-run path.
  - Empty queue check.
  - Report generation.
  - `--readonly-preview --db <path>`.
- `worker/operator-console/lib/readonlyPreview.mjs`
  - Read-only SQLite preview.
  - Real customer order queue filtering.
  - Masked filenames.
  - Existing quote/slicing metadata.
  - Disabled action markers.
  - Read-only count checks.
- `worker/operator-console/lib/redact.mjs`
  - Redacts Worker Token, Authorization, OpenID, phone, email, payment identifiers, private keys, certificates, and APIv3 key-like content.
- `worker/operator-console/lib/pending.mjs`
  - Safe relative path validation.
  - Pending payload field allowlist.
- `worker/operator-console/lib/health.mjs`
  - System health checks for Worker root, token presence, PrusaSlicer, profile, disk, systemd service, and residual processes.

Gap:

- Current Operator Console is CLI only.
- It does not start a localhost web workbench.
- `readonlyPreview` reads a SQLite path, not live production through a dedicated operator data API.
- It does not show local file exists / local SHA verification / open directory.
- It does not support operator handling state or order replies.

## 2. Missing Tables / APIs / Pages

### Missing cloud API

Required for a practical localhost workbench:

- `GET /api/operator/workbench/orders`
  - Read order list and safe summary fields.
  - Include file count and sync summary.
  - Filter by operator handling status.
- `GET /api/operator/workbench/orders/:id`
  - Read order detail, files, local sync metadata, existing customer-visible messages.
- `GET /api/operator/workbench/orders/:id/messages`
  - Read append-only order messages once A4 adds them.
- Future:
  - `POST /api/operator/workbench/orders/:id/handling-state`
  - `POST /api/operator/workbench/orders/:id/messages`
  - `PATCH /api/operator/workbench/orders/:id/confirmation`

External local workbench route naming can expose shorter local paths:

- `GET /operator/orders`
- `GET /operator/orders/:id`
- `GET /operator/orders/:id/messages`
- `POST /operator/orders/:id/messages`
- `PATCH /operator/orders/:id/confirmation`

Auth recommendation:

- Use a new dedicated operator token, for example `MAKE3D_LOCAL_WORKBENCH_TOKEN`.
- Do not reuse Worker Token.
- Do not allow customer session or admin session as a substitute for the local workbench token.
- Token must stay server-side in the local workbench process and never reach browser JavaScript.

### Missing local workbench server/page

Recommended new local-only runtime:

- `worker/order-workbench/server.mjs`
  - Bind only `127.0.0.1`.
  - Default port example: `127.0.0.1:5177`.
  - Refuse `0.0.0.0`.
  - Render server-side HTML or serve minimal static JS.
- `worker/order-workbench/lib/cloudClient.mjs`
  - Calls cloud operator workbench API.
  - Redacts errors.
- `worker/order-workbench/lib/localFiles.mjs`
  - Verifies files under `/srv/make3d-worker/files`.
  - Validates safe relative paths.
  - Checks existence, size, and SHA.
  - Opens local directory only after verification.
- `worker/order-workbench/lib/redact.mjs`
  - Can reuse existing Operator Console redaction module.

### Missing independent handling state

Required new table in a later phase:

```sql
operator_order_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE,
  state TEXT NOT NULL,
  operator_id TEXT,
  note TEXT,
  updated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CHECK (state IN (
    'UNREVIEWED',
    'REVIEWING',
    'FILE_PROBLEM',
    'SLICE_REVIEWED',
    'QUOTE_READY',
    'NEED_CUSTOMER_REPLY',
    'WAITING_CUSTOMER',
    'CUSTOMER_REPLIED',
    'CONFIRMED',
    'CLOSED'
  ))
)
```

Important boundary:

- This table must not modify `orders.status`.
- It must not modify `payment_status`.
- It must not modify quote amount, payment, refund, or WeChat Pay fields.

### Missing append-only order messages

Required new table in a later phase:

```sql
order_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  customer_id INTEGER,
  sender_type TEXT NOT NULL,
  operator_id TEXT,
  message_type TEXT NOT NULL,
  body TEXT NOT NULL,
  client_request_id TEXT,
  order_version_snapshot TEXT,
  customer_visible INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  UNIQUE(client_request_id),
  CHECK (sender_type IN ('CUSTOMER','OPERATOR','SYSTEM')),
  CHECK (message_type IN (
    'TEXT',
    'FILE_RECEIVED',
    'FILE_CONFIRMED',
    'FILE_PROBLEM',
    'REUPLOAD_REQUIRED',
    'MATERIAL_CONFIRM_REQUIRED',
    'QUOTE_CONFIRMATION',
    'LEAD_TIME_CONFIRMATION',
    'GENERAL_REPLY'
  ))
)
```

Reason not to use only `customer_service_requests`:

- `customer_service_requests` can be reused for existing customer support requests.
- It should not be stretched into the canonical order message timeline because it updates a single row and is not append-only.

### Missing audit events

Required new table in a later phase:

```sql
operator_order_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  operator_id TEXT,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  client_request_id TEXT,
  result TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  UNIQUE(client_request_id)
)
```

Audit should record:

- handling state changes
- message creation
- local directory open action
- failed safe-path verification
- failed SHA verification

Audit must not record:

- Worker Token
- Authorization
- OpenID
- full phone/email
- payment identifiers
- private keys/certs/APIv3 keys

## 3. MVP File List

### Phase06-A2 read-only runnable MVP

Suggested files:

- `worker/order-workbench/server.mjs`
- `worker/order-workbench/lib/cloudClient.mjs`
- `worker/order-workbench/lib/localFiles.mjs`
- `worker/order-workbench/lib/render.mjs`
- `worker/order-workbench/lib/redact.mjs`
- `worker/order-workbench/README.md`
- `src/backend/operatorWorkbench.ts`
- `src/app/api/operator/workbench/orders/route.ts`
- `src/app/api/operator/workbench/orders/[id]/route.ts`
- `tests/orderWorkbenchReadonly.test.mjs`

Scope:

- Localhost-only page.
- Order list.
- Order detail.
- File sync status.
- Local file exists/size/SHA check.
- Safe open directory.
- No write operation.

### Phase06-A3 local one-shot slicing and result confirmation

Suggested files:

- `worker/order-workbench/lib/slicingOneShot.mjs`
- `worker/order-workbench/lib/slicingResults.mjs`
- `worker/order-workbench/lib/handlingState.mjs`
- `tests/orderWorkbenchSlicingOneShot.test.mjs`

Scope:

- Reuse Operator Console, Worker Slicing API, PrusaSlicer, and parser.
- Manually trigger exactly one selected TEST/approved local file slicing run.
- Display profile, slicer version, parser version, print time, material weight, dimensions, G-code size/SHA, parse status, metrics status, parser quote readiness, and warnings.
- Allow operator to mark local review as `SLICE_REVIEWED`, `SLICE_CONFIRMED`, or `SLICE_NEEDS_FIX`.
- Partial parser results are human reference only and must not auto-sync price or lead time.
- Do not start a resident Worker.

### Phase06-A4 price / lead-time / reply draft and online sync

Suggested files:

- `src/backend/operatorHandlingState.ts`
- `src/backend/orderMessages.ts`
- `src/backend/operatorOrderConfirmations.ts`
- `src/backend/operatorOrderAudit.ts`
- `src/app/api/operator/workbench/orders/[id]/handling-state/route.ts`
- `src/app/api/operator/workbench/orders/[id]/messages/route.ts`
- `src/app/api/operator/workbench/orders/[id]/confirmation/route.ts`
- `src/app/account/orders/[id]/page.tsx`
- `worker/order-workbench/lib/handlingState.mjs`
- `worker/order-workbench/lib/messages.mjs`
- `worker/order-workbench/lib/confirmations.mjs`
- `tests/orderWorkbenchHandlingState.test.mjs`
- `tests/orderWorkbenchMessages.test.mjs`
- `tests/orderWorkbenchConfirmations.test.mjs`

Scope:

- Add independent handling state table.
- Append-only order messages.
- Customer order detail displays customer-visible messages.
- Local draft fields for confirmed price and lead time.
- Guarded online sync with order version, client request id, idempotency, diff preview, and second confirmation.
- Existing `customer_service_requests` remains available for support tickets.
- Do not modify paid transaction records, refunds, WeChat Pay, or upload records.

### Phase06-A5 notifications and workflow polish

Suggested files:

- `src/backend/email.ts`
- `src/backend/orderMessages.ts`
- `worker/order-workbench/*`
- Tests for new order/customer reply alerting.

Scope:

- New order alert.
- Customer reply alert.
- Optional email notification.
- Do not block A2/A3/A4 on this.

## 4. Data Flow

### A2 read-only data flow

```text
Browser on same machine
  -> http://127.0.0.1:<port>
  -> local order workbench server
  -> cloud operator workbench read API
  -> production DB read-only query
  -> local workbench combines cloud metadata with /srv/make3d-worker/files checks
  -> browser renders order list/detail
```

Local file verification:

```text
cloud local_file_sync_jobs.relative_path
  -> validate safe relative path
  -> resolve under /srv/make3d-worker/files
  -> stat local file
  -> compare size
  -> sha256 check when requested or when file size matches
  -> expose local_exists / size_match / sha_match
```

### A3 handling state flow

```text
operator clicks state
  -> local workbench POST
  -> cloud operator API
  -> update operator_order_states only
  -> insert operator_order_audit_events
  -> return updated workbench summary
```

### A4 reply flow

```text
operator writes reply
  -> local workbench POST
  -> cloud operator API
  -> insert order_messages append-only
  -> customer order detail reads visible messages
```

No part of these flows should:

- modify order amount
- modify quote amount
- modify payment/refund/WeChat Pay
- create slicing jobs
- start Worker
- run PrusaSlicer
- delete files/orders

### A3 one-shot slicing flow

```text
operator selects verified local file
  -> local workbench validates file path under /srv/make3d-worker/files
  -> local workbench confirms file size and SHA
  -> operator manually starts one-shot slicing through the approved console/Worker path
  -> Worker Slicing API locks one job
  -> PrusaSlicer runs once
  -> parser stores result
  -> local workbench displays parser metrics and warnings
  -> operator marks local slice review result
```

This flow must not:

- use a resident Slicing Worker
- run against a real customer file before explicit later approval
- create automatic customer-facing quote changes
- update order amount, payment, refund, or WeChat Pay

### A4 price / lead-time / reply sync flow

```text
operator reviews slicing result
  -> edits local price draft and lead-time draft
  -> edits customer-visible reply draft
  -> local workbench re-reads latest cloud order version
  -> local workbench shows old/new diff
  -> operator confirms sync
  -> cloud API writes allowlisted confirmation fields and append-only message
  -> cloud API writes operator audit event
  -> customer order detail shows updated reply/confirmation
```

Price and lead-time rules:

- Amounts are integer cents only.
- Lead time is represented as `lead_time_min_hours`, `lead_time_max_hours`, and optional `estimated_ship_at`.
- UI must show online current value, local suggested value, and local confirmed value separately.
- A paid order must not have its paid transaction amount rewritten. If additional payment is needed, A4 marks a manual process and reports it instead of mutating payment state.
- Sync must require a second confirmation that displays `order_no`, old/new price, and old/new lead time.

### Online sync modes

The workbench should support:

- first full pull
- incremental sync
- manual refresh
- timed refresh
- offline recovery after network interruption

The online production database remains the source of truth. Local cache is only a working copy and must not write directly to live SQLite.

## 5. Permission Boundary

## 4.1 Local Workbench View Contracts

### Order list fields

The Phase06 local order list should expose these allowlisted fields:

- `order_no`
- `created_at`
- `order_status`
- `payment_status`
- `material`
- `color`
- `quantity`
- `online_quote_amount`
- `online_lead_time`
- `customer_latest_message`
- `unread_customer_message_count`
- `file_count`
- `file_sync_status`
- `operator_handling_status`
- `last_synced_at`

Required filters:

- `NEW`
- `FILE_PENDING`
- `SLICE_PENDING`
- `QUOTE_PENDING`
- `REPLY_PENDING`
- `WAITING_CUSTOMER`
- `CONFIRMED`
- `ALL`

The list must not show OpenID, Worker Token, payment secrets, complete payment flow identifiers, or unnecessary full phone/email values.

### Order detail fields

The Phase06 local order detail should show:

- order summary
- customer requirements and remark
- message timeline
- file list
- material, color, and quantity
- online price and lead time
- local price draft
- local lead-time draft
- local reply draft
- slicing result summary
- risk warnings
- local handling status

Sensitive data must remain minimized and redacted in reports/logs.

### File list fields

File rows should show:

- `file_id`
- masked filename
- format
- size
- SHA prefix
- upload time
- `local_file_sync_job_id`
- `sync_status`
- safe relative path
- local file exists
- local size verification result
- local SHA verification result

Open actions:

- open local containing directory
- open verified local file using the system default program

Both actions are allowed only for files resolved inside `/srv/make3d-worker/files` after path, size, and SHA validation.

### Message and notification contract

The first customer-visible reply path should be append-only order messages, not edits to payment or amount fields.

Customer notification rules:

- Customer order detail must show operator replies after login.
- The customer should have unread status for new operator replies.
- SMTP email can be reused only as a reminder that an order has a new reply or price/lead-time update.
- Email must not include STL attachment, internal path, SHA, Worker info, logs, or secrets.
- Email failure must not roll back a saved message or confirmation; it should record `notification_failed` for safe retry.

### Conflict and idempotency contract

When local review starts, record:

- `order_version`
- file version or file snapshot version
- message cursor
- quote version

Before any sync, the cloud API must re-read online state. It must block the write and ask the operator to reload when:

- customer reuploads or changes a file
- customer changes material, color, or quantity
- customer adds a new message
- another operator changes online price or lead time
- the order version no longer matches

Write APIs must use:

- operator auth and role check
- field allowlist
- `client_request_id`
- idempotency
- append-only audit record

Forbidden write targets through Phase06 workbench APIs:

- `payment_status`
- paid amount or payment transaction records
- refund records
- WeChat Pay settings or records
- customer identity fields
- uploaded files

### MVP acceptance checklist

The MVP is accepted only when it can:

1. pull online orders locally
2. view order detail and customer messages
3. confirm STL/file sync status locally
4. safely open local file directory
5. manually run one slicing job in the approved one-shot path
6. view slicing result
7. edit price and lead-time draft
8. edit reply draft
9. confirm and sync reply/confirmation online
10. show reply/price/lead-time on customer order page
11. create station notification/unread marker for the customer
12. send SMTP reminder if SMTP is available
13. block overwrite on online conflict
14. retry network failures without duplicate replies
15. prove payment/refund/WeChat records are unchanged


### Local server

- Must bind `127.0.0.1` only.
- Must refuse `0.0.0.0`.
- Must not be linked from public production pages.
- Should show a visible local-only banner.
- Should run from WSL/operator machine.

### Cloud API

- Must use a dedicated local workbench token.
- Must not accept Worker Token.
- Must not accept customer session.
- Must not accept admin session as a substitute unless a future design explicitly approves it.
- Must return only allowlisted fields.
- Must not return OpenID, payment identifiers, full phone/email, private paths, or secrets.

### File opening

Allowed:

- open the local directory containing a verified file under `/srv/make3d-worker/files`.

Required checks:

- safe relative path only
- no absolute paths
- no `..`
- no Windows drive path
- no protocol URL
- no percent-encoded path
- resolved path must stay inside `/srv/make3d-worker/files`
- file must exist locally
- local size must match expected size
- local SHA must match expected SHA before marking verified

Forbidden:

- open arbitrary system files
- open production upload path
- download files to public web
- run PrusaSlicer
- create slicing job

## 6. Security Risks

Risk: local page accidentally listens on all interfaces.

Mitigation:

- Hard-code default host to `127.0.0.1`.
- Runtime assert host is not `0.0.0.0`.
- Add test that server rejects public host binding.

Risk: token leakage into browser or logs.

Mitigation:

- Token only in server process.
- Reuse `worker/operator-console/lib/redact.mjs`.
- Add tests for HTML/JSON output not containing Token, Authorization, OpenID, phone, email, payment identifiers, private key/cert/APIv3 patterns.

Risk: local file path traversal.

Mitigation:

- Reuse and extend `validateSafeRelativePath`.
- Resolve paths with a fixed root.
- Verify root containment after path resolution.

Risk: accidental business mutation.

Mitigation:

- A2 is read-only.
- A3 writes only `operator_order_states` and audit.
- A4 writes only `order_messages` and audit.
- Tests compare `orders`, quote, payment, refund, WeChat, upload, and slicing counts before/after.

Risk: using `customer_service_requests` as message timeline.

Mitigation:

- Reuse it only for existing support request display.
- Add append-only `order_messages` for workbench replies.

Risk: production file sync status mismatch.

Mitigation:

- Treat cloud `local_file_sync_jobs` as metadata.
- Treat local `stat`/SHA as authoritative for local availability.

## 7. Expected Implementation Order

### Phase06-A2

Implement read-only runnable local workbench:

1. Add cloud read-only operator workbench APIs.
2. Add local server bound to `127.0.0.1`.
3. Render order list and order detail.
4. Show file sync status and local verification.
5. Add safe open-directory action.
6. Add tests proving no write to order/payment/refund/WeChat/slicing tables.

This is the earliest useful version for operator trial.

### Phase06-A3

Add manual local one-shot slicing and result confirmation:

1. Reuse the existing Operator Console/Worker Slicing one-shot path.
2. Validate local file path, size, and SHA under `/srv/make3d-worker/files`.
3. Run one selected slicing task manually.
4. Display parser result, G-code metadata, warnings, and `parser_quote_ready`.
5. Record local slice review result without syncing quote/lead time.
6. Keep resident Worker and real-customer automation disabled.

### Phase06-A4

Add handling state, price/lead-time draft, reply draft, and guarded online sync:

1. Add `operator_order_states`.
2. Add append-only `order_messages`.
3. Add operator audit events.
4. Add guarded confirmation API for allowlisted price and lead-time fields.
5. Show visible messages and confirmation updates on customer order detail page.
6. Enforce order version conflict detection and idempotency.
7. Keep paid transaction, refund, WeChat Pay, and upload data unchanged.

### Phase06-A5

Add notifications, conflict hardening, and workflow polish:

1. New order indicator.
2. Customer reply indicator.
3. Customer unread/station notification.
4. Optional SMTP reminder.
5. Network retry without duplicate replies.
6. More complete audit/report export.
7. Better workflow shortcuts.

## 8. A2 Readiness

Phase06-A2 can proceed directly after review approval.

Recommended A2 constraints:

- Read-only only.
- No schema migration except if the cloud read-only API needs no new table.
- Localhost-only server.
- No handling state writes yet.
- No order messages yet.
- No Worker start.
- No PrusaSlicer run.
- No slicing job creation.
- No payment/refund/WeChat/order amount/quote mutation.

## 9. Open Questions For A2

These do not block starting A2, but should be settled during implementation:

- Token name: use `MAKE3D_LOCAL_WORKBENCH_TOKEN` or another explicit operator token name.
- Default local port: recommended `5177`.
- Whether A2 should include local file SHA verification on every page load or only on demand, because SHA over large files can be slow.
- Whether local directory opening should use `explorer.exe`, `wslview`, or `xdg-open` depending on WSL desktop integration.

## 10. Stop Statement

This phase is complete and stops here.

No Approval/Candidate migration was executed in this phase.
No slicing Worker was started.
No PrusaSlicer was run.
No payment, refund, WeChat Pay, quote amount, order amount, upload limit, or production order state was modified.
