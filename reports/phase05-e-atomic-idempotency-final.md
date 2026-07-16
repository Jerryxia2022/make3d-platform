# Phase05-E Atomic Idempotency Hardening Final

Date: 2026-07-15

## Scope

This phase only hardened active slicing task idempotency at the database/helper layer and synchronized report test counts.

No Worker API, Worker change, PrusaSlicer execution, order change, quote change, payment change, WeChat Pay change, upload limit change, or production deployment was performed.

## Database Change

Added a partial unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_slicing_jobs_active_identity_unique
  ON slicing_jobs(file_sync_job_id, slice_cache_key_sha256, required_parser_version)
  WHERE status IN ('pending', 'locked', 'slicing', 'sliced', 'parsing');
```

This prevents only duplicate active rows for the exact same slicing identity.

It does not add:

- `UNIQUE(file_sync_job_id)`
- `UNIQUE(file_id)`
- global `UNIQUE(slice_cache_key_sha256)`

The ordinary index remains:

```sql
CREATE INDEX IF NOT EXISTS idx_slicing_jobs_file_sync
  ON slicing_jobs(file_sync_job_id, created_at);
```

The old incorrect index remains removed:

```sql
DROP INDEX IF EXISTS idx_slicing_jobs_file_sync_unique;
```

## Helper Created Semantics

`createSlicingJobForVerifiedFile` now returns:

```ts
{
  job,
  created
}
```

Semantics:

- `created: true`: a new `slicing_jobs` row was inserted.
- `created: false`: an identical active task already existed, or a concurrent insert won the active identity race and the helper reloaded that row.

The helper still derives `input_worker_id` from the verified `local_file_sync_jobs` row.

## Concurrency Handling

The helper first queries for an identical active task.

If none is found, it attempts to insert.

If the insert hits the partial unique active identity constraint, the helper re-queries the same active identity and returns:

```ts
{
  job: existingActiveJob,
  created: false
}
```

Only the active identity unique conflict is treated as an idempotent race. Other `UNIQUE`, `CHECK`, and `FOREIGN KEY` errors continue to throw normally.

## Allowed Cases

The following remain allowed for the same `file_sync_job_id`:

- Different material.
- Different layer height.
- Different fill density.
- Different `profile_sha256`.
- Different required PrusaSlicer package version.
- Different `required_parser_version`.
- Same identity after the previous task is `completed`, `partial`, `failed`, or `cancelled`.
- Metrics-cache audit row creation.

## Tests Added Or Updated

Additional coverage includes:

1. First helper call returns `created: true`.
2. Second identical active helper call returns `created: false`.
3. Simulated concurrent active identity insert returns the existing row instead of throwing.
4. Completed task allows a new identical task.
5. Partial task allows a new identical task.
6. Failed task allows a new identical task.
7. Cancelled task allows a new identical task.
8. Different layer height remains allowed.
9. Different required parser version remains allowed.
10. Ordinary `idx_slicing_jobs_file_sync` remains present.
11. Old `idx_slicing_jobs_file_sync_unique` remains absent.
12. New `idx_slicing_jobs_active_identity_unique` exists and is partial/unique.

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

The two existing Phase05-E reports were updated so their `npm test` totals match the latest real output: 251/251.

## Production Impact

No production deployment was performed.

When deployed later, the partial unique index will prevent duplicate active slicing jobs for the same exact identity while preserving historical audit rows and same-file multi-parameter slicing.

## Risks

- Future API routes must expose `created` clearly so callers can distinguish newly created tasks from idempotent returns.
- Future Worker/API code must not assume `file_sync_job_id` is unique in `slicing_jobs`.
- Future cache selection logic must keep choosing reusable source rows by status, version, and policy rather than relying on global cache uniqueness.

## Rollback Method

No production rollback is needed because production was not deployed.

Code rollback:

1. Remove `idx_slicing_jobs_active_identity_unique` from `src/backend/database.ts`.
2. Revert `createSlicingJobForVerifiedFile` to return a bare job and remove unique-conflict re-query handling.
3. Revert the new/updated idempotency tests.
4. Revert this report and changelog entry.

Database rollback for a non-production database:

```sql
DROP INDEX IF EXISTS idx_slicing_jobs_active_identity_unique;
```

## Phase05-F Readiness

This hardening clears the remaining Phase05-F blocker.

Phase05-F may proceed to design after approval. It should not implement API routes, Worker slicing execution, automatic quote integration, upload limit changes, payment changes, WeChat Pay changes, or deployment until separately approved.
