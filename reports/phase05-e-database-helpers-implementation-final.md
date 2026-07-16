# Phase05-E Slicing Jobs Database Helpers Implementation Final

Date: 2026-07-15

## Scope

Phase05-E implemented only the cloud-side database schema and helper layer for future slicing jobs.

This phase did not implement Worker slicing execution, Worker API routes, PrusaSlicer execution, automatic quote integration, order amount changes, upload limit changes, WeChat Pay changes, or production deployment.

## Modified Files

- `src/backend/database.ts`
  - Added `slicing_jobs` table.
  - Added `slicing_job_attempts` table.
  - Added indexes for pickup, Worker ownership, cache lookup, reusable metrics, lock ownership, and attempt lookup.
  - Phase05-E Constraint Correction: replaced the incorrect unique `file_sync_job_id` index with a normal `(file_sync_job_id, created_at)` index so the same synced file can have separate slicing audit rows for different materials, profiles, slicer versions, and cache reuse.
  - Phase05-E Atomic Idempotency Hardening: added partial unique `idx_slicing_jobs_active_identity_unique` for active rows only.
- `src/backend/workerSlicingJobs.ts`
  - Added database-only slicing job helpers.
  - Added stable slice and parse cache key helpers.
  - Added lock, lease, state transition, terminal result, failure, and metrics-cache reuse helpers.
- `tests/workerSlicingJobs.test.mjs`
  - Added database/helper unit tests covering schema, constraints, ownership, transitions, retries, same-file multi-parameter slicing tasks, active identity concurrency idempotency, metrics-cache reuse, and non-interference with payment/order logic.
- `changelog/CHANGELOG.md`
  - Added Phase05-E implementation entry.

## Database Changes

New table: `slicing_jobs`

Key fields include:

- Input ownership: `file_id`, `file_sync_job_id`, `input_worker_id`
- Artifact ownership: `artifact_worker_id`
- State: `status`, `attempt_count`, `max_attempts`
- Lock and lease: `worker_id`, `lock_owner`, `locked_at_ms`, `lock_expires_at_ms`, `lease_expires_at_ms`, `lease_renewed_at_ms`
- Timing: `started_at_ms`, `finished_at_ms`, `failed_at_ms`, `cache_reused_at_ms`
- Required and actual versions: `required_slicer_package_version`, `actual_slicer_package_version`, `required_parser_version`, `actual_parser_version`
- Cache keys: `slice_cache_key_sha256`, `parse_cache_key_sha256`
- Metrics: print time, filament metrics, layer metrics, parser status, metric status, quote readiness
- Result origin: `executed` or `metrics_cache`

New table: `slicing_job_attempts`

Key fields include:

- `slicing_job_id`
- `attempt_no`
- `worker_id`
- `lock_owner`
- attempt status and timing
- artifact and parser diagnostics
- sanitized error fields

Foreign keys use `ON DELETE RESTRICT`. Legacy `slice_jobs` was not renamed, backfilled, or modified.

## Constraints And Indexes

Important constraints:

- Unix millisecond fields are `NULL` or `>= 0`.
- `metrics_cache` rows must have `cache_reused_at_ms`.
- `metrics_cache` rows are limited to `completed` or `partial`.
- `metrics_cache` rows do not keep G-code paths, logs, slice duration, or attempts.
- `file_sync_job_id` is intentionally not unique in `slicing_jobs`.
- Active identity idempotency is enforced by partial unique index `idx_slicing_jobs_active_identity_unique` on `file_sync_job_id`, `slice_cache_key_sha256`, and `required_parser_version` while status is `pending`, `locked`, `slicing`, `sliced`, or `parsing`.
- `slicing_job_attempts` enforces unique `(slicing_job_id, attempt_no)` and unique `lock_owner`.
- No price, fee, order amount, payment, or WeChat fields were added to `slicing_jobs`.

Important indexes:

- `idx_slicing_jobs_pickup`
- `idx_slicing_jobs_file`
- `idx_slicing_jobs_file_sync`
- `idx_slicing_jobs_order_snapshot`
- `idx_slicing_jobs_worker`
- `idx_slicing_jobs_slice_cache`
- `idx_slicing_jobs_parse_cache`
- `idx_slicing_jobs_reusable_metrics`
- `idx_slicing_jobs_active_identity_unique`
- `idx_slicing_jobs_active_lock_owner`
- `idx_slicing_job_attempts_job`
- `idx_slicing_job_attempts_worker`

## Helper Behavior

Implemented helpers:

- `buildSliceCacheIdentity`
- `computeSliceCacheKey`
- `buildParseCacheIdentity`
- `computeParseCacheKey`
- `canonicalSliceParamsJson`
- `computeSliceParamsSha256`
- `createSlicingJobForVerifiedFile`
- `listPendingSlicingJobsForWorker`
- `toPendingSlicingJobPayload`
- `validateSlicingJobRequiredVersions`
- `claimSlicingJob`
- `renewSlicingJobLease`
- `markSlicingJobSlicing`
- `markSlicingJobSliced`
- `markSlicingJobParsing`
- `completeSlicingJobResult`
- `failSlicingJob`
- `createMetricsCacheReuseJob`
- `getSlicingJobById`
- `getSlicingJobAttemptByLockOwner`

The task creation helper only accepts verified `local_file_sync_jobs`. It derives `input_worker_id` from the verified sync job; callers cannot supply their own input Worker. It returns `{ job, created }`: `created: true` for a new row and `created: false` when an identical active task already exists or a concurrent insert wins the partial unique index race.

`claimSlicingJob`, lease renewal, state transitions, terminal result writes, and failure writes use SQLite transactions. Attempt rows are created or updated in the same transaction as the main job row.

`lock_owner` is generated as a secure random value and is distinct from `worker_id`.

## Cache Keys

Slice cache identity uses a fixed shape:

```json
{
  "schema_version": "1.0",
  "input_sha256": "...",
  "profile_sha256": "...",
  "slice_params_sha256": "...",
  "slicer_name": "...",
  "slicer_package_version": "..."
}
```

Parse cache identity uses a fixed shape:

```json
{
  "schema_version": "1.0",
  "gcode_sha256": "...",
  "parser_version": "..."
}
```

Both use canonical JSON, UTF-8, and SHA-256. Field order changes do not alter the cache key; value changes do.

## Test Results

Executed:

- `node --test tests/workerSlicingJobs.test.mjs`
  - Passed: 43/43 after Phase05-E Atomic Idempotency Hardening
- `node --test tests/prusaslicerResultParser.test.mjs`
  - Passed: 24/24
- `node --test tests/workerLocalSync.test.mjs`
  - Passed: 5/5
- `npm test`
  - Passed: 251/251
- `npm run lint`
  - Passed
- `npm run build`
  - Passed

During verification, `npm run build` initially found a TypeScript type issue where dynamic SQL parameters were inferred as `unknown[]`. The implementation was corrected by typing the transition parameter arrays as `SQLInputValue[]`; build then passed.

## Security Checks

- No Worker token handling was added in this phase.
- No customer file contents are read by these helpers.
- No PrusaSlicer process is started.
- Error messages are sanitized before storage.
- Payment and WeChat Pay tables are not touched by slicing helpers.
- Order price, order status, quote logic, upload limits, and payment logic are not modified.

## Configuration Changes

None.

No `.env.local`, `.env.production`, Worker env file, payment certificate, private key, APIv3 key, upload limit, or production setting was changed.

## Risks

- This phase does not expire stale active locks into a terminal or retryable status by itself. Future API/Worker phases must use the existing claim/lease semantics consistently.
- Metrics cache reuse is database-only. Future API code must avoid treating cached rows as G-code ownership records.
- The helper now returns `{ job, created }` for task creation. Future API responses must preserve this idempotent behavior clearly enough for Worker diagnostics.

## Rollback Method

No production deployment was performed.

Code rollback:

1. Revert `src/backend/database.ts` slicing table/index additions.
2. Remove `src/backend/workerSlicingJobs.ts`.
3. Remove `tests/workerSlicingJobs.test.mjs`.
4. Revert the Phase05-E changelog entry.

Database rollback if applied in a non-production test database:

```sql
DROP TABLE IF EXISTS slicing_job_attempts;
DROP TABLE IF EXISTS slicing_jobs;
```

Do not apply a production database rollback without first creating a database backup and confirming no future slicing audit records must be retained.

## Next Stage Recommendation

Phase05-F can design Worker slicing API routes on top of these helpers.

Recommended Phase05-F boundaries:

- Design first, then wait for approval.
- Do not start PrusaSlicer from the web app.
- Do not connect slicing metrics to automatic quote or order price.
- Do not deploy until a deployment report and backup plan are approved.
