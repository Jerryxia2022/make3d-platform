# Phase05-E Constraint Correction Final

Date: 2026-07-15

## Scope

This correction only fixes the Phase05-E `file_sync_job_id` uniqueness issue and related helper/tests.

No Worker API, Worker slicing execution, PrusaSlicer production run, order change, quote change, payment change, WeChat Pay change, upload limit change, or production deployment was performed.

## Correction Summary

The previous Phase05-E implementation added:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_slicing_jobs_file_sync_unique
  ON slicing_jobs(file_sync_job_id);
```

That constraint was incorrect because a single synced file must support multiple independent slicing audit rows for different materials, layer heights, infill percentages, supports, profiles, and PrusaSlicer versions. Metrics-cache reuse must also be able to create a new audit row for the same synced file.

The correction now applies:

```sql
DROP INDEX IF EXISTS idx_slicing_jobs_file_sync_unique;

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_file_sync
  ON slicing_jobs(file_sync_job_id, created_at);
```

No global unique constraint was added on `file_sync_job_id`, `file_id`, or `slice_cache_key_sha256`.

## Modified Files

- `src/backend/database.ts`
  - Deletes the old unique index if present.
  - Creates ordinary index `idx_slicing_jobs_file_sync` on `(file_sync_job_id, created_at)`.
- `src/backend/workerSlicingJobs.ts`
  - Adds active-task idempotency lookup in `createSlicingJobForVerifiedFile`.
- `tests/workerSlicingJobs.test.mjs`
  - Replaces the old uniqueness test.
  - Adds same-file multi-parameter, metrics-cache, idempotency, and index tests.
- `reports/phase05-e-database-helpers-implementation-final.md`
  - Updated to reflect this correction.
- `changelog/CHANGELOG.md`
  - Added this correction entry.

## Active Task Idempotency Rule

`createSlicingJobForVerifiedFile` now checks for an existing active task with the same:

- `file_sync_job_id`
- `slice_cache_key_sha256`
- `required_parser_version`

Active statuses are:

- `pending`
- `locked`
- `slicing`
- `sliced`
- `parsing`

If such a task exists, the helper returns the existing active task and does not create a duplicate active row. Phase05-E Atomic Idempotency Hardening later added the partial unique database index `idx_slicing_jobs_active_identity_unique` and changed the helper return shape to `{ job, created }`.

Different `slice_params_sha256`, `profile_sha256`, or `required_slicer_package_version` changes the slice cache key and creates a new slicing audit row.

Terminal historical rows remain preserved and do not block new audit rows.

## Cache Reuse

`createMetricsCacheReuseJob` can now create a new `slicing_jobs` audit row using the same `file_sync_job_id` as the source row.

The helper still requires:

- `source_slicing_job_id` exists.
- Source status is `completed` or `partial`.
- Target local file sync job is verified.
- Cached rows have no attempts, G-code paths, log paths, or slice duration.

## Tests Added Or Updated

Covered correction scenarios:

1. Same `file_sync_job_id` PLA task creates successfully.
2. Same `file_sync_job_id` PETG task creates successfully.
3. Same `file_sync_job_id` with changed `fill_density_percent` creates a new task.
4. Same `file_sync_job_id` with changed `profile_sha256` creates a new task.
5. Same `file_sync_job_id` with changed `required_slicer_package_version` creates a new task.
6. Same `file_sync_job_id` metrics-cache audit row creates successfully.
7. Completely identical active task is idempotent and does not create a duplicate active row.
8. Ordinary `idx_slicing_jobs_file_sync` index exists.
9. Old unique `idx_slicing_jobs_file_sync_unique` index is absent.
10. Phase05-E Atomic Idempotency Hardening adds active identity partial unique index coverage and concurrency-race handling.

## Test Results

Executed:

- `node --test tests/workerSlicingJobs.test.mjs`
  - Passed: 43/43
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

## Production Impact

No production deployment was performed.

If this migration is later deployed to a database where `idx_slicing_jobs_file_sync_unique` already exists, `DROP INDEX IF EXISTS` removes it safely before creating the ordinary index.

The correction improves production readiness because it allows:

- multiple slicing jobs per synced file,
- cache reuse audit rows,
- historical audit preservation,
- active-task idempotency without over-constraining the database.
- database-level prevention of duplicate active rows for the same slicing identity.

## Risks

- Future API routes must surface the `{ job, created }` return behavior clearly so an operator can tell whether a task was newly created or reused.
- Since no global unique cache key is enforced, future cache lookup code must explicitly choose the correct reusable source row by status, version, and policy.

## Rollback Method

No production rollback is needed because production was not deployed.

Code rollback:

1. Revert the `src/backend/database.ts` index change.
2. Revert the `createSlicingJobForVerifiedFile` active-task idempotency lookup.
3. Revert the updated tests and report/changelog entries.

Do not restore the old unique index unless Phase05-D schema rules are intentionally changed, because it blocks required same-file multi-parameter audit rows.

## Phase05-F Readiness

This correction clears the blocking schema issue.

Phase05-F may proceed to design only after approval. It should continue to avoid API implementation, Worker execution, automatic quote integration, payment changes, upload limit changes, and production deployment until separately approved.
