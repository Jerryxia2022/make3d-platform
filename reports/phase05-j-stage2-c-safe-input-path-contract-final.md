# Phase05-J Stage 2-C Safe Worker Input Path Contract Correction Final

## Scope

Stage 2-C was executed locally only.

No production deployment, production SSH change, production database write, production token change, Slicing Worker service creation/start, real customer slicing task, order change, quote change, payment change, WeChat Pay change, upload limit change, or production file deletion was performed.

Stage 2 production audit records remain untouched:

- synthetic order: 30
- file: 34
- local file sync job: 2
- slicing job 1: failed
- slicing job 2: partial

## Root Cause

Stage 2 production validation exposed a contract gap:

- `/api/worker/slicing/jobs/pending` did not return a safe local Worker input path.
- `worker/make3d-slicing-worker.mjs` accepted `local_path`, `input_local_path`, `input_relative_path`, then fell back to `files/<file_id>-synthetic-cube.stl`.
- In formal production mode this fallback caused slicing job 1 to look for `files/34-synthetic-cube.stl` even though the verified local file had a different descriptive filename.
- Slicing job 2 only succeeded after the synthetic file was copied to the fallback convention path.

The corrected contract is: the cloud API must return a verified, safe relative input path, and the Worker must use that path. Formal mode must fail closed if it is missing or invalid.

## Modified Files

- `src/backend/workerSlicingJobs.ts`
- `worker/make3d-slicing-worker.mjs`
- `scripts/phase05-h-a-seed.mjs`
- `scripts/phase05-h-b-integration-driver.mjs`
- `scripts/phase05-h-c-attempt-isolation-driver.mjs`
- `scripts/phase05-h-c-final-lease-process-fencing-driver.mjs`
- `tests/workerSlicingApi.test.mjs`
- `tests/workerSlicingClient.test.mjs`
- `tests/workerSlicingJobs.test.mjs`
- `tests/workerSlicingRecovery.test.mjs`
- `tests/workerSlicingLeaseFencing.test.mjs`
- `tests/workerSlicingAttemptIsolation.test.mjs`
- `changelog/CHANGELOG.md`
- `reports/phase05-j-stage2-c-safe-input-path-contract-final.md`

## Contract Changes

### Worker Slicing Pending API

Pending payload now includes:

- `order_no`
- `input_relative_path`
- `input_size_bytes`

The payload remains free of absolute Worker paths, tokens, OpenID, payment details, and customer private fields.

Pending jobs are returned only when the linked `local_file_sync_jobs` record is still:

- `sync_status = verified`
- owned by the authenticated Worker
- consistent by `file_id`, `file_size_bytes`, `local_sha256`, and input path source

Unsafe input paths are filtered out:

- absolute paths
- `..`
- empty path segments
- backslashes
- URL-encoded traversal patterns
- null bytes

### Slicing Job Creation

`createSlicingJobForVerifiedFile` now normalizes the Worker input path from verified local sync state. It prefers an explicit safe `files/...` relative path, and can derive `files/...` from `/srv/make3d-worker/...` verified local paths without exposing the absolute path to Worker API clients.

### Slicing Worker

Formal Worker mode now requires `job.input_relative_path`.

Removed formal fallback:

- `files/<file_id>-synthetic-cube.stl`

Fallback is retained only when:

- `MAKE3D_WORKER_INTEGRATION_TEST_MODE=1`
- API URL host is `localhost` or `127.0.0.1`

Input verification now checks:

- path stays inside Worker root
- file exists
- file is non-empty
- `input_size_bytes` matches local file size
- `input_sha256` matches local SHA-256

Missing path, missing file, size mismatch, SHA mismatch, or unsafe path reports `/failed` with `WORKER_IO_ERROR`.

## Synthetic Seed Updates

Local TEST seed and integration drivers now explicitly set:

- `local_file_sync_jobs.relative_path = files/<file_id>-synthetic-cube.stl`

They no longer rely on filename convention fallback.

## Local Integration Revalidation

Command used:

```bash
wsl bash -lc "cd /mnt/c/Users/21899/Documents/make3d-platform && bash <(tr -d '\r' < scripts/phase05-h-a-local-integration.sh)"
```

The first direct WSL run hit CRLF shell parsing (`set: pipefail\r: invalid option name`). The successful run used transient CRLF stripping and did not modify the script file.

Result:

- isolated database: `/srv/make3d-worker/test-integration/phase05-h-a/db/make3d-test.db`
- synthetic order: `M3D20260716152520753`
- file_id: 1
- local_file_sync_job_id: 1
- slicing_job_id: 1
- final status: `partial`
- attempt status: `partial`
- attempt count: 1
- Worker: `wsl-worker-01`
- G-code path: `results/prusaslicer/1/attempt-1/output.gcode`
- G-code size: `284994`
- G-code SHA-256: `60ff8c8e448369b5e33a0b7b921696958210b7d935466042fd25e3a851452ae4`
- initial lock delta: `120000 ms`
- initial lease delta: `120000 ms`
- parser status: `parsed`
- metrics status: `warning`
- parser quote ready: `false`

Existing `make3d-file-sync-worker.service` was observed only:

- status after validation: `active`
- PID after validation: `203`

## Test Results

Targeted tests:

- `node --test tests/workerSlicingLeaseFencing.test.mjs`: 18/18 passed
- `node --test tests/workerSlicingAttemptIsolation.test.mjs`: 18/18 passed
- `node --test tests/workerSlicingRecovery.test.mjs`: 8/8 passed
- `node --test tests/workerSlicingClient.test.mjs`: 17/17 passed
- `node --test tests/workerSlicingApi.test.mjs`: 23/23 passed
- `node --test tests/workerSlicingJobs.test.mjs`: 46/46 passed
- `node --test tests/prusaslicerResultParser.test.mjs`: 24/24 passed
- `node --test tests/workerLocalSync.test.mjs`: 5/5 passed
- `node --test tests/workerApi.test.mjs`: 6/6 passed

Full regression:

- `npm test`: 337/337 passed
- `npm run lint`: passed
- `npm run build`: passed

## Safety Checks

- No production deployment.
- No production database mutation.
- No production token or environment change.
- No Slicing Worker systemd service created or started.
- No real customer files used.
- No real customer slicing jobs created.
- No order, quote, payment, refund, WeChat Pay, or upload limit logic changed.
- No token or absolute Worker path is returned in pending API payload.
- Formal Worker mode now fails closed instead of guessing the input file path.

## Risks

- Existing `.sh` scripts may still require LF line endings when executed directly in WSL from the Windows checkout. This report used transient CRLF stripping for validation and did not change line-ending policy.
- Production Stage 2 records remain historical evidence of the old contract and were not repaired in place.
- This correction is not deployed to production yet.

## Rollback

Revert the Stage 2-C code changes in:

- `src/backend/workerSlicingJobs.ts`
- `worker/make3d-slicing-worker.mjs`
- Phase05-H seed/integration scripts
- related tests

No database rollback is required for this local-only stage because no schema or production database change was made.

## Next Step

Recommended next phase:

Phase05-J Stage 2-D pre-deployment audit for the safe input path contract correction.

Do not move to broader production slicing enablement until this correction is reviewed, committed, deployed through the staged cloud API process, and revalidated with TEST-only synthetic slicing.
