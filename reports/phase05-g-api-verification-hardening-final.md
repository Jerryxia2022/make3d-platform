# Phase05-G API Verification And Test Hardening Final

Date: 2026-07-15
Status: completed, not deployed

## Scope

This verification phase hardened Phase05-G Worker Slicing API tests and one validation edge in the API helper layer.

No WSL Worker code was modified. No PrusaSlicer slicing was executed. No real customer files, real slicing tasks, orders, quotes, payments, WeChat Pay code, upload limits, production token, production database, or deployment path were touched.

## 1. Modified Files

```text
src/backend/workerSlicingApi.ts
tests/workerSlicingApi.test.mjs
reports/phase05-g-worker-slicing-api-implementation-final.md
reports/phase05-g-api-verification-hardening-final.md
changelog/CHANGELOG.md
```

## 2. Existing Five-Test Audit

The pre-hardening `tests/workerSlicingApi.test.mjs` contained five top-level API tests:

| Test | Routes Covered | States Covered | Error Branches Covered |
| --- | --- | --- | --- |
| `slicing API authentication, job id, lock body, and response cache policy` | `pending`, `lock` | `pending`, `locked`, lock replay | missing/wrong auth, invalid job id, non-empty lock body, no-store/no-cache headers |
| `slicing API runs normal flow with real parser payload and preserves null metrics` | `lock`, `lease`, `slicing`, `sliced`, `parsing`, `result` | `pending -> locked -> slicing -> sliced -> parsing -> partial` | none; happy path plus null metric preservation |
| `result schema rejects unknown fields, inconsistent quote readiness, and parse cache mismatch` | setup through `parsing`, then `result` | `parsing` | unknown result fields, quote-readiness inconsistency, parse-cache mismatch |
| `sliced path safety, content encoding, and failed policy are enforced` | `lock`, `slicing`, `sliced`, `failed` | `slicing` | unsafe artifact path, unsupported content encoding, server-only error code rejection |
| `reconcile exposes resume_from and restricted parsing resume` | `lock`, `slicing`, `sliced`, `pending`, `parsing` | `sliced -> failed -> locked -> parsing` | expired lease reconcile and restricted resume validation |

Finding: the original tests covered the core happy path and several important failures, but route-level coverage was too coarse for auth variants, body limits, ownership filtering, lease edge cases, terminal replay, each transition route, and non-interference with order/payment data.

## 3. Added Route-Level Coverage

Added independent tests for:

- authentication configuration, missing auth, wrong token, and ignored worker identity inputs
- secret logging checks for token and `lock_owner`
- no-store response headers for all eight slicing API routes and lock no-cache pragma
- invalid route job ids
- zero-byte lock body enforcement and client-supplied lock field rejection
- streaming body limits, content-type, and content-encoding handling
- pending route ownership, retryability, max-attempt filtering, sensitive-field omission, and reconcile execution
- lock route attempt creation, replay, wrong-worker hiding, and `resume_from`
- lease renewal without shortening, expired lease rejection, wrong lock owner, and non-UUID lock owner rejection
- slicing route success and version/input/profile/slice-param mismatch failures
- sliced route artifact ownership, exact path, non-zero size, hash, version, exit-code, and path traversal validation
- parsing route normal transition and resume transition validation
- result route completed/partial status, forbidden statuses, unknown fields, null metric preservation, idempotent terminal replay, and cache validation
- failed route worker/server error code policy, stage policy, error sanitization, truncation, and rejected worker-controlled retryable flag
- expired-state reconcile for `locked`, `slicing`, `sliced`, and `parsing`
- terminal result/failed replay idempotency and conflict rejection
- non-interference with order, quote, payment, refund, and WeChat payment data

`tests/workerSlicingApi.test.mjs` now has 22 top-level tests.

## 4. API Helper Hardening

Updated failed-payload normalization:

- unknown Worker error codes now return `422 UNKNOWN_WORKER_ERROR_CODE`
- server-only error codes still return `422 SERVER_ERROR_CODE_NOT_ALLOWED`
- worker error summaries accept up to 4096 input characters, then sanitize and truncate to 500 characters
- this preserves the intended "sanitize then truncate" behavior without logging or storing secrets

Removed an unused internal `workerErrorCodes()` helper after this change.

## 5. Database Changes

No database schema migration was added or changed in this phase.

Tests use temporary SQLite databases only.

## 6. Security Checks

Confirmed by tests:

- Worker Token is required and missing/invalid tokens fail
- empty `MAKE3D_WORKER_TOKEN` configuration fails closed
- admin/customer sessions cannot substitute for Worker Token in existing Worker API regression
- client-supplied worker identity is ignored
- `lock_owner` must be UUID-shaped where required
- lock endpoint accepts no body
- JSON endpoints enforce content type, content encoding, and body size limits
- pending payload does not expose lock owner, local paths, stderr/stdout paths, errors, or payment data
- terminal replay compares normalized idempotency payloads
- error messages are redacted and length-limited

## 7. Non-Interference

The hardening phase did not change:

- order status
- quote logic
- order amount
- payment status
- refund state
- WeChat Pay code or configuration
- upload limits
- WSL Worker code
- production deployment state

Added a route-level non-interference test that snapshots order, quote, payment, refund, and WeChat payment table state around a full slicing API flow.

## 8. Test Results

```text
node --experimental-strip-types --experimental-specifier-resolution=node --test --test-reporter=spec tests/workerSlicingApi.test.mjs
Result: passed, 22/22

node --experimental-strip-types --experimental-specifier-resolution=node --test tests/workerSlicingJobs.test.mjs
Result: passed, 43/43

node --experimental-strip-types --experimental-specifier-resolution=node --test tests/prusaslicerResultParser.test.mjs
Result: passed, 24/24

node --experimental-strip-types --experimental-specifier-resolution=node --test tests/workerLocalSync.test.mjs
Result: passed, 5/5

node --experimental-strip-types --experimental-specifier-resolution=node --test tests/workerApi.test.mjs
Result: passed, 6/6

npm test
Result: passed, 273/273

npm run lint
Result: passed, no warnings

npm run build
Result: passed
```

Build emitted only existing Node SQLite experimental warnings.

## 9. Risks

- The route tests intentionally invoke handlers directly with temporary SQLite databases; production deployment and live HTTP behavior remain out of scope.
- The strict result and failure schemas require the future Phase05-H Worker client to match this contract exactly.
- The API still uses the Phase05-G single-token-to-single-worker-id model; multi-worker token mapping remains a future design.

## 10. Rollback

To roll back this hardening only:

```text
revert the Phase05-G hardening additions in tests/workerSlicingApi.test.mjs
restore normalizeFailedPayload error summary length behavior in src/backend/workerSlicingApi.ts if required
remove reports/phase05-g-api-verification-hardening-final.md
revert the Phase05-G hardening addendum in reports/phase05-g-worker-slicing-api-implementation-final.md
revert the changelog hardening entry
```

No database rollback is required.

## 11. Phase05-H Readiness

Phase05-G API verification and test hardening is complete.

The project is ready for Phase05-H only after review approval. Phase05-H should remain limited to Worker-side integration with the frozen slicing API contract and must not connect customer pricing or production slicing automation without a separate approved phase.
