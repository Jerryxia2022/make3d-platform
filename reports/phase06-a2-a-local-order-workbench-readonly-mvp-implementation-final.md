# Phase06-A2-A Local Order Workbench Read-only MVP Implementation Final

## 1. Execution Time

- Date: 2026-07-17
- Phase: Phase06-A2-A Local Order Workbench Read-only MVP Implementation
- Production deployment: not performed
- Production database migration/write: not performed
- PrusaSlicer: not run
- `slicing_job`: not created

## 2. Implemented Files

- `src/backend/operatorWorkbench.ts`
- `src/app/api/operator/workbench/orders/route.ts`
- `src/app/api/operator/workbench/orders/[id]/route.ts`
- `worker/order-workbench/server.mjs`
- `worker/order-workbench/lib/config.mjs`
- `worker/order-workbench/lib/cloudClient.mjs`
- `worker/order-workbench/lib/localFiles.mjs`
- `worker/order-workbench/lib/render.mjs`
- `worker/order-workbench/lib/security.mjs`
- `worker/order-workbench/README.md`
- `tests/orderWorkbenchCloudApi.test.mjs`
- `tests/orderWorkbenchLocalFiles.test.mjs`
- `tests/orderWorkbenchServerSecurity.test.mjs`

## 3. Cloud Read-only API

Added:

- `GET /api/operator/workbench/orders`
- `GET /api/operator/workbench/orders/:id`

The API returns allowlisted order summary, safe file metadata, local sync summary, and existing customer service request summary.

No `POST`, `PUT`, `PATCH`, or `DELETE` route was added for Phase06-A2-A.

## 4. Operator Token Contract

Token name:

- `MAKE3D_LOCAL_WORKBENCH_TOKEN`

Rules implemented:

- Missing/empty configured token fails closed.
- Missing request token returns `401`.
- Wrong token returns `401`.
- Worker Token does not authenticate operator workbench API.
- Token is accepted only through `Authorization: Bearer ...`.
- Query-string token is ignored.
- Token is compared with timing-safe comparison.
- Token value, prefix, suffix, length, and hash are not returned.

Production env was not modified.

## 5. Local Server

Added local-only server:

- `worker/order-workbench/server.mjs`

Default:

- Host: `127.0.0.1`
- Port: `5177`
- URL: `http://127.0.0.1:5177`

The browser talks only to the local server. The local server calls the cloud read-only API and merges local file verification results.

The browser never receives `MAKE3D_LOCAL_WORKBENCH_TOKEN`, Worker Token, or Authorization header.

## 6. Host / Origin / CSRF Security

Implemented:

- Host allowlist for `127.0.0.1:<port>` and `localhost:<port>`.
- Non-loopback bind rejected by config.
- `X-Frame-Options: DENY`.
- `Content-Security-Policy`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer`.
- `Cache-Control: no-store`.
- Local actions require `POST`.
- Local actions require same-origin Origin/Referer.
- Local actions require CSRF token.
- Directory opening uses `spawn` argument arrays and `shell: false`.

## 7. Order List

Implemented read-only local order list with:

- order number
- created time
- order status
- payment status summary
- material
- color
- quantity
- current quote summary
- current lead-time summary
- customer remark summary
- file count
- file sync summary
- TEST marker
- manual refresh/search/filter through GET query parameters

No operator handling state is saved in A2-A.

## 8. Order Detail

Implemented read-only order detail with:

- order summary
- quote summary
- lead-time summary
- payment status summary
- customer remark
- existing customer service request and visible reply summary
- file list
- dimensions/risk metadata
- file sync status
- local metadata verification result

No controls were added for price edits, lead-time edits, replies, order status changes, payment, refund, or slicing.

## 9. File Sync Status

Cloud API returns safe file rows with:

- `file_id`
- masked filename
- format
- size
- upload time
- material/color/quantity
- dimensions
- risk fields
- `local_file_sync_job_id`
- `sync_status`
- safe relative path
- expected size
- expected SHA-256
- local synced time
- last error summary

Cloud API does not return:

- `local_path`
- production upload absolute path
- server absolute path
- OpenID
- payment identifiers
- tokens/secrets/certs/private keys/APIv3 key

## 10. Local Size / SHA Verification

Implemented local verification helpers:

- `validateSafeRelativePath`
- `resolveInsideRoot`
- `verifyLocalFileMetadata`
- `verifyLocalFileSha256`

List/detail load checks existence and size only. SHA-256 is calculated only through explicit local action.

Rejected path forms include:

- empty path
- absolute path
- `..`
- backslash
- double slash
- percent encoding
- null byte
- Windows drive path
- `file://`, `http://`, `https://`
- `/srv/` as an input value
- root escape

## 11. Open Local Directory

Added local-only endpoint:

- `POST /local/files/:syncJobId/open-directory`

Before opening, the server:

- re-fetches latest cloud order detail
- verifies the sync job belongs to that order detail
- validates safe relative path
- verifies root containment under `/srv/make3d-worker/files`
- verifies local file exists
- verifies size matches
- verifies expected SHA-256 matches
- requires `sync_status` to be `verified` or `local_synced`

The action writes no production database row.

## 12. Redaction Result

Tests verify rendered HTML/JSON does not include:

- local workbench token
- Authorization header
- Worker Token
- OpenID
- full phone
- full email
- payment identifiers
- production absolute upload path
- `/srv/make3d-worker/files` absolute local path

## 13. New Test Results

Focused Phase06-A2-A tests:

- `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/orderWorkbenchCloudApi.test.mjs tests/orderWorkbenchLocalFiles.test.mjs tests/orderWorkbenchServerSecurity.test.mjs`
- Result: `11/11` passed

Focused existing regression:

- Operator Console, file-sync Worker, Worker API, Worker Slicing API
- Result: `55/55` passed

## 14. Complete Regression

- `npm test`: passed, `398/398`
- `npm run lint`: passed
- `npm run build`: passed

## 15. Production Impact

Production impact: none.

Not performed:

- production deployment
- production env change
- production database migration
- production database write
- Phase05-L4-B Approval/Candidate migration
- resident Slicing Worker
- automatic slicing
- automatic scheduling
- PrusaSlicer run
- `slicing_job` creation
- order amount change
- quote change
- lead-time change
- payment/refund change
- WeChat Pay change
- upload limit change

## 16. Rollback Method

Before deployment, rollback is simply to revert or remove the added Phase06-A2-A files listed in section 2.

No database rollback is required because this phase adds no schema and performs no data migration.

If the cloud API is later deployed and must be disabled, unset `MAKE3D_LOCAL_WORKBENCH_TOKEN` or roll back the release commit; the API fails closed when the token is absent.

## 17. Next Phase

Allowed next phase after review approval:

- Phase06-A2-B Guarded Read-only API Deploy And Local Workbench Acceptance

Recommended A2-B scope:

- configure production `MAKE3D_LOCAL_WORKBENCH_TOKEN`
- deploy only the read-only API
- run local workbench against production API
- validate real order read-only display and local file verification
- do not add writes, slicing, replies, quote updates, or schema migrations
