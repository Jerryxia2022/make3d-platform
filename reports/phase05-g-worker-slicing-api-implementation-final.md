# Phase05-G Worker Slicing API Implementation Final

Date: 2026-07-15
Status: completed, not deployed

## Scope

Phase05-G implemented cloud-side Worker Slicing API routes, slicing Worker authentication, API request/response helpers, necessary database helper extensions, status recovery, `resume_from`, strict parser result schema validation, and API tests.

This phase did not modify the WSL Worker program, run PrusaSlicer, create real customer slicing tasks, use real customer files, modify order status, modify quote logic, modify order amounts, modify payment, modify WeChat Pay, modify upload limits, modify production Worker Token, connect to production database for tests, or deploy production.

## 1. New Files

```text
src/backend/workerSlicingAuth.ts
src/backend/workerSlicingApi.ts
src/app/api/worker/slicing/jobs/pending/route.ts
src/app/api/worker/slicing/jobs/[id]/lock/route.ts
src/app/api/worker/slicing/jobs/[id]/lease/route.ts
src/app/api/worker/slicing/jobs/[id]/slicing/route.ts
src/app/api/worker/slicing/jobs/[id]/sliced/route.ts
src/app/api/worker/slicing/jobs/[id]/parsing/route.ts
src/app/api/worker/slicing/jobs/[id]/result/route.ts
src/app/api/worker/slicing/jobs/[id]/failed/route.ts
tests/workerSlicingApi.test.mjs
reports/phase05-g-worker-slicing-api-implementation-final.md
```

## 2. Modified Files

```text
src/backend/workerSlicingJobs.ts
tests/workerSlicingJobs.test.mjs
changelog/CHANGELOG.md
```

## 3. API Routes

Implemented:

```text
GET  /api/worker/slicing/jobs/pending
POST /api/worker/slicing/jobs/:id/lock
POST /api/worker/slicing/jobs/:id/lease
POST /api/worker/slicing/jobs/:id/slicing
POST /api/worker/slicing/jobs/:id/sliced
POST /api/worker/slicing/jobs/:id/parsing
POST /api/worker/slicing/jobs/:id/result
POST /api/worker/slicing/jobs/:id/failed
```

Not implemented:

- Worker task creation API
- customer public slicing API
- automatic quote API

## 4. Authentication

Added slicing-specific Worker authentication:

- `Authorization: Bearer <token>`
- `MAKE3D_WORKER_TOKEN -> wsl-worker-01`
- does not trust `x-make3d-worker-id`
- does not trust query/body `worker_id`
- hashes expected and received tokens with SHA-256, then uses `timingSafeEqual`
- missing/empty token config returns `503 WORKER_AUTH_NOT_CONFIGURED`
- missing auth returns `401 WORKER_AUTH_REQUIRED`
- wrong token returns `401 WORKER_AUTH_INVALID`

Tokens and token hashes are not logged.

## 5. Body Limits

Added streaming body handling:

- `/result`: 256 KB
- other JSON state endpoints: 32 KB
- lock requires zero-byte body
- content length is only a pre-check
- oversized streamed bodies return `413 REQUEST_BODY_TOO_LARGE`
- accepted media type: `application/json`, including `application/json; charset=utf-8`
- accepted content encoding: missing or `identity`
- compressed requests are rejected with `415 UNSUPPORTED_CONTENT_ENCODING`

## 6. Schema

Implemented strict JSON schema checks for:

- top-level unknown fields
- nested unknown fields
- lowercase SHA-256 values
- UUID v4 `lock_owner`
- safe integers and bounds
- `/sliced` exact artifact paths
- parser-derived `/result` `metrics`, `metric_sources`, `metric_validation`, `missing_fields`, and `warnings`

Missing numeric parser metrics remain `NULL`. They are not converted to `0`.

## 7. Error Strategy

Implemented centralized `WorkerErrorCodePolicy`:

- Worker-submitted errors are whitelisted.
- server-only errors are rejected from Worker payloads.
- retryability is read from the policy.
- multiple error codes may belong to one stage.
- error messages are sanitized and truncated.

Validation mismatch during `/slicing` atomically marks the job and attempt failed, clears locks/leases, and returns `422`.

## 8. State Transitions

Implemented:

- `pending/failed retryable -> locked`
- `locked -> slicing`
- `slicing -> sliced`
- `sliced -> parsing`
- restricted resume `locked -> parsing`
- `parsing -> completed`
- `parsing -> partial`
- active states -> `failed`

Completed requires:

```text
parse_status=parsed
metrics_status=valid
server_validated_parser_quote_ready=true
```

All other valid `/result` combinations become `partial`.

## 9. Reconcile

Implemented:

- `reconcileExpiredSlicingJobs`
- `reconcileExpiredSlicingJob`

`GET /pending` runs Worker-scoped reconciliation before listing jobs.

`POST /lock` runs targeted reconciliation before claiming.

Expired `locked`, `slicing`, `sliced`, and `parsing` attempts become `expired`; main jobs become retryable `failed`; locks and leases are cleared; G-code metadata and `artifact_worker_id` are preserved.

## 10. Resume From

Implemented `resume_from` calculation without new schema:

- source: `last_error_code`
- checks: `artifact_worker_id`, G-code SHA, G-code size, G-code path
- values: `null`, `sliced`, `parsing`

Lock response includes `resume_from`, and lock replay preserves it.

Resume parsing validates `artifact_worker_id` and `gcode_sha256`, then clears recovery error state after entering `parsing`.

## 11. Idempotency

Implemented:

- lock replay for same Worker, active lock, and valid lease
- terminal `/result` replay through `slicing_job_attempts.lock_owner`
- terminal `/failed` replay through `slicing_job_attempts.lock_owner`
- normalized payload comparison instead of raw JSON comparison
- sorted/deduped `missing_fields` and `warnings`

Conflicting terminal replay returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`.

## 12. Parser Real Contract

`tests/workerSlicingApi.test.mjs` uses the current `worker/prusaslicer-result-parser.mjs` against a synthetic G-code fixture and maps real parser output into the `/result` API payload.

Confirmed:

- parser output schema is accepted
- warning metrics produce `partial`
- missing metrics are not auto-filled with `0`
- parser consistency conflicts return `422`
- parse cache key is server-recomputed

## 13. Test Results

```text
node --test tests/workerSlicingApi.test.mjs
Original implementation result: passed, 5/5
After API verification hardening: passed, 22/22

node --test tests/workerSlicingJobs.test.mjs
Result: passed, 43/43

node --test tests/prusaslicerResultParser.test.mjs
Result: passed, 24/24

node --test tests/workerLocalSync.test.mjs
Result: passed, 5/5

node --test tests/workerApi.test.mjs
Result: passed, 6/6

npm test
Original implementation result: passed, 256/256
After API verification hardening: passed, 273/273

npm run lint
Result: passed

npm run build
Result: passed
```

Build completed with existing Node SQLite experimental warnings only.

## 13A. API Verification Hardening Addendum

Follow-up verification added independent route-level tests for authentication, no-store headers, invalid job ids, lock body rejection, streaming body limits, content type/encoding, pending filtering, lock replay, lease renewal/expiry, slicing/sliced/parsing transitions, result completion/partial/failure validation, failed-code policy, lease reconcile, terminal idempotency replay, and non-interference with order, quote, payment, refund, and WeChat payment data.

The five original API tests were audited and mapped to the routes, states, and error branches they covered. Coverage gaps were closed in `tests/workerSlicingApi.test.mjs`, which now has 22 top-level tests.

One API helper edge was hardened: Worker failure summaries now accept a larger raw error string, redact secrets/phone/email/path data, then truncate to 500 characters. Unknown Worker error codes now return `UNKNOWN_WORKER_ERROR_CODE`; server-only codes remain rejected with `SERVER_ERROR_CODE_NOT_ALLOWED`.

No database migration, WSL Worker change, PrusaSlicer execution, production deployment, order/quote/payment/WeChat/upload change, production token change, or production database access occurred during this addendum.

## 14. Order Impact

No order status, order amount, order payment status, customer-visible order workflow, or production order data was changed.

Tests use temporary SQLite databases only.

## 15. Quote Impact

No quote logic, quote price, automatic quote integration, customer quote page, or admin final quote workflow was changed.

The API stores parser metrics only in `slicing_jobs`; it does not calculate customer price.

## 16. Payment Impact

No payment logic, payment settings, payment status, refund logic, or payment records were changed.

## 17. WeChat Pay Impact

No WeChat Pay code, keys, certificates, APIv3 key, test-only flags, payment settings, JSAPI, Native, refund, notification, or callback logic was changed.

## 18. Production Impact

No production deployment was performed.

No production database was connected during tests.

No production Worker Token was modified.

No real customer file or real customer slicing task was used.

## 19. Risks

- The first API version maps `MAKE3D_WORKER_TOKEN` to a single Worker id, `wsl-worker-01`; multi-Worker credential mapping remains a future phase.
- The result schema is intentionally strict and may require coordinated Worker updates in Phase05-H.
- This phase exposes cloud API routes but does not deploy them to production.
- Parser metrics are still not connected to quote pricing; future quote integration must remain a separate approved phase.

## 20. Rollback

To roll back Phase05-G:

```text
remove src/backend/workerSlicingAuth.ts
remove src/backend/workerSlicingApi.ts
remove src/app/api/worker/slicing/jobs/
revert Phase05-G changes in src/backend/workerSlicingJobs.ts
remove tests/workerSlicingApi.test.mjs
revert Phase05-G updates in tests/workerSlicingJobs.test.mjs
revert Phase05-G changelog/report entries
```

No database rollback is required because no schema migration was added in this phase.

## 21. Phase05-H Readiness

Phase05-G is ready for Phase05-H local Worker API integration testing after review.

Recommended Phase05-H focus:

- update the local Worker client to call the new slicing API
- use TEST/synthetic files only
- do not connect pricing or customer order automation
- verify pending -> lock -> slicing -> sliced -> parsing -> result
- verify failed/retry/reconcile/resume behavior against the local Worker
