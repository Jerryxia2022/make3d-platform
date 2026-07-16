# Phase05-H-C Attempt Isolation And Lease Ownership Fencing Final

Date: 2026-07-15

## Scope

Phase05-H-C upgraded local Worker Slicing from job-scoped artifacts to attempt-scoped artifacts and added lease ownership fencing around local slicing execution and resume flows.

This phase did not deploy production code, did not SSH production, did not access production database or production token, did not use real customer files, did not create real customer slicing tasks, did not modify orders, quotes, order amounts, payment, WeChat Pay, upload limits, automatic quote behavior, customer status updates, or create a slicing systemd service. Existing `make3d-file-sync-worker.service` was not stopped or restarted.

## Old Path Risk

Before H-C, Worker Slicing artifacts used job-only paths such as:

- `results/prusaslicer/<job_id>/output.gcode`
- `results/prusaslicer/<job_id>/stdout.log`
- `results/prusaslicer/<job_id>/stderr.log`

Risk: if an old attempt continued after lease expiry while a new attempt started, both attempts could target the same output path. H-C replaces this with attempt-scoped paths and rejects the old format at `/sliced`.

## New Attempt Paths

New path contract:

- Processing: `processing/prusaslicer/<job_id>/attempt-<attempt_no>/`
- Results: `results/prusaslicer/<job_id>/attempt-<attempt_no>/`
- Failed: `failed/prusaslicer/<job_id>/attempt-<attempt_no>/`

Formal result paths:

- `results/prusaslicer/<job_id>/attempt-<attempt_no>/output.gcode`
- `results/prusaslicer/<job_id>/attempt-<attempt_no>/stdout.log`
- `results/prusaslicer/<job_id>/attempt-<attempt_no>/stderr.log`

Paths contain only positive integer `job_id` and `attempt_no`. They do not include `lock_owner`, Worker token, or secrets.

## Modified Files

- `worker/make3d-slicing-worker.mjs`
- `src/backend/workerSlicingApi.ts`
- `src/backend/workerSlicingJobs.ts`
- `src/app/api/worker/slicing/jobs/[id]/lock/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/sliced/route.ts`
- `tests/workerSlicingAttemptIsolation.test.mjs`
- `tests/workerSlicingClient.test.mjs`
- `tests/workerSlicingApi.test.mjs`
- `tests/workerSlicingRecovery.test.mjs`
- `scripts/phase05-h-c-attempt-isolation-driver.mjs`
- `scripts/phase05-h-c-attempt-isolation-integration.sh`
- `reports/phase05-h-c-attempt-isolation-lease-fencing-final.md`
- `changelog/CHANGELOG.md`

## API Path Contract

`POST /api/worker/slicing/jobs/:id/sliced` now:

- Reads the current active attempt from `lock_owner`.
- Uses server-side `attempt_no`; Worker does not submit or choose attempt number.
- Accepts only current attempt paths.
- Rejects old job-only paths.
- Rejects other job paths.
- Rejects stale attempt paths.
- Rejects absolute paths, backslashes, `..`, URL-encoded traversal, null bytes, `processing/`, `failed/`, and `.part` paths.

## Resume Rules

`resume_from=sliced` and `resume_from=parsing` may read historical attempt artifacts only when:

- Artifact path belongs to the same slicing job.
- Path contains a legal historical `attempt_no`.
- The matching `slicing_job_attempts` row exists for the same job, attempt, Worker, G-code path, size, and SHA-256.
- `artifact_worker_id` matches the authenticated Worker.

Lock responses return historical artifact paths only when resume is allowed. Otherwise artifact fields are returned as `null`.

## Temporary Files And Atomic Publish

PrusaSlicer writes only to processing `.part` files first:

- `processing/prusaslicer/<job_id>/attempt-<attempt_no>/output.gcode.part`
- `processing/prusaslicer/<job_id>/attempt-<attempt_no>/stdout.part`
- `processing/prusaslicer/<job_id>/attempt-<attempt_no>/stderr.part`

After successful exit, valid non-empty G-code, SHA calculation, and lease ownership check, files are atomically renamed into the attempt result directory. Parser only reads formal result paths and never `.part` paths.

## Lease Heartbeat Lifecycle

The local Worker starts lease heartbeat immediately after lock and keeps it active through:

- input verification
- profile verification
- version verification
- `/slicing`
- PrusaSlicer execution
- G-code size/SHA checks
- `/sliced`
- `/parsing`
- parser execution
- result payload construction
- `/result`
- failure handling until `/failed`

Heartbeat stops only after terminal `/result`, terminal `/failed`, or confirmed ownership loss.

## Monotonic Lease Clock

The Worker no longer compares local epoch time directly to server `lease_expires_at_ms`.

It computes:

- `lease_ttl_ms = lease_expires_at_ms - lease_renewed_at_ms`
- `local_deadline = performance.now() + lease_ttl_ms`

This avoids false ownership decisions when WSL local time is skewed from server time. Tests cover local clock 10-minute fast/slow style skew by using server TTL plus monotonic time.

## Lease Ownership Loss

Lease failures are classified as:

- `409 LEASE_EXPIRED`, `404`, `401`, `403`: ownership lost.
- Network errors: tolerated only before the local monotonic deadline.
- Deadline reached without successful renewal: ownership lost.

After ownership loss, Worker stops `/sliced`, `/parsing`, `/result`, and `/failed` submissions and terminates the current slicer process.

## PrusaSlicer Process Handling

Worker keeps `shell: false` and uses argument arrays.

For real Worker slicing, PrusaSlicer is started as a terminable process group where supported. On lease ownership loss or Worker cleanup, termination is best-effort:

- `SIGTERM`
- short grace period
- `SIGKILL` if still running

Tests cover the cleanup path. The H-C local integration used a test-only slow slicer under `/srv/make3d-worker/test-integration/phase05-h-c/`; custom slicer binaries remain blocked unless `MAKE3D_WORKER_INTEGRATION_TEST_MODE=1` and the API URL is local.

## Local Integration

Integration script:

- `scripts/phase05-h-c-attempt-isolation-integration.sh`

Driver:

- `scripts/phase05-h-c-attempt-isolation-driver.mjs`

Isolated root:

- `/srv/make3d-worker/test-integration/phase05-h-c`

Isolated database:

- `/srv/make3d-worker/test-integration/phase05-h-c/db/make3d-test.db`

Driver summary:

- `/srv/make3d-worker/test-integration/phase05-h-c/logs/driver.json`

## Concurrent Old Attempt Scenario

Scenario `old_attempt_isolation` passed.

- Job id: `1`
- Attempt 1 directory: `processing/prusaslicer/1/attempt-1`
- Attempt 2 directory: `results/prusaslicer/1/attempt-2`
- Attempt 1 final status: `expired`
- Attempt 2 final status: `partial`
- Old attempt `/sliced` response: `409`
- Old slow slicer exit: code `0`, signal `null`

New attempt artifact:

- Path: `/srv/make3d-worker/test-integration/phase05-h-c/results/prusaslicer/1/attempt-2/output.gcode`
- Relative path: `results/prusaslicer/1/attempt-2/output.gcode`
- Size: `284994`
- SHA-256: `d009889b12ca2c4bf042fe22b6150b5f016646fb0665fa4bece3107d7544795f`
- mtime: `1784123276271.4578`

Validation:

- Attempt 1 only wrote under attempt 1 processing scope.
- Attempt 2 wrote under attempt 2 result scope.
- Old `lock_owner` could not submit `/sliced`.
- Database final artifact references attempt 2 only.
- Attempt 2 G-code SHA and mtime remained unchanged after stale attempt submission.

## Resume Scenario

Scenario `sliced_resume_attempt_path` passed.

- Job id: `2`
- Historical artifact: `results/prusaslicer/2/attempt-1/output.gcode`
- Worker attempt: `2`
- `resume_from`: `sliced`
- PrusaSlicer ran on resumed attempt: `false`
- Final status: `partial`
- Size: `284994`
- SHA-256: `ea791c25f27d4a4dae5ee0477946bf9b16864376758ac594ba15d3c4e742bc7b`
- mtime: `1784123306210.9524`

Validation:

- Attempt 2 read attempt 1 G-code as read-only input.
- Attempt 2 did not rerun PrusaSlicer.
- Attempt 1 G-code SHA and mtime remained unchanged.

## Existing File Sync Worker Protection

Before H-C integration:

- `make3d-file-sync-worker.service`: active
- Main PID: `2682`

After H-C integration:

- `make3d-file-sync-worker.service`: active
- Main PID: `2682`

The existing file sync Worker was not stopped, restarted, or modified.

## Tests

Targeted tests:

- `node --test tests/workerSlicingAttemptIsolation.test.mjs`: passed, 18/18
- `node --test tests/workerSlicingRecovery.test.mjs`: passed, 8/8
- `node --test tests/workerSlicingClient.test.mjs`: passed, 16/16
- `node --test tests/workerSlicingApi.test.mjs`: passed, 22/22
- `node --test tests/workerSlicingJobs.test.mjs`: passed, 46/46
- `node --test tests/prusaslicerResultParser.test.mjs`: passed, 24/24
- `node --test tests/workerLocalSync.test.mjs`: passed, 5/5
- `node --test tests/workerApi.test.mjs`: passed, 6/6

Full regression:

- `npm test`: passed, 318/318
- `npm run lint`: passed
- `npm run build`: passed

Local integration:

- `bash scripts/phase05-h-c-attempt-isolation-integration.sh`: passed

## Impact

- Order impact: none.
- Quote impact: none.
- Order amount impact: none.
- Payment impact: none.
- WeChat Pay impact: none.
- Upload limit impact: none.
- Automatic quote impact: none.
- Customer status update impact: none.
- Production database impact: none.
- Production token/config impact: none.
- Production deployment impact: none.

## Discovered Issues

- Initial H-C integration attempt used a full Worker process to claim attempt 1 while the local Next server and driver were still initializing SQLite, which exposed a local SQLite lock in the test harness. The final driver avoids that harness race by locking attempt 1 through the API and running the test-only slow slicer process directly under the isolated H-C root. Business logic was not changed for this harness adjustment.

## Rollback

- Revert attempt-scoped Worker artifact path changes in `worker/make3d-slicing-worker.mjs`.
- Revert `/sliced` path validation changes in `src/backend/workerSlicingApi.ts` and `src/app/api/worker/slicing/jobs/[id]/sliced/route.ts`.
- Revert resume artifact validation changes in `src/backend/workerSlicingJobs.ts` and lock response filtering in `src/app/api/worker/slicing/jobs/[id]/lock/route.ts`.
- Remove H-C tests and scripts if rolling back the phase harness.
- No production database rollback is required because this phase did not deploy or migrate production.

## Next Stage Recommendation

Phase05-H-C is ready for review.

After approval, it is reasonable to enter Phase05-I production pre-deploy audit. Do not deploy slicing to production until that audit is explicitly approved.

## Final Hardening Addendum

After review, Phase05-H-C received an additional final lease process fencing hardening pass.

See:

- `reports/phase05-h-c-final-lease-process-fencing-hardening.md`

That addendum fixed request-start anchored monotonic lease deadlines, added a 2000 ms safety margin, hardened Worker shutdown so SIGTERM/SIGINT cleanup does not post `/failed`, verified process-group SIGTERM/SIGKILL cleanup with a real Worker-managed slow slicer, verified long parser and resume parser heartbeat, added same-filesystem atomic publish checks, and passed `npm test` 336/336 plus lint, build, and isolated WSL integration.
