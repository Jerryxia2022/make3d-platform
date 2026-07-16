# Phase05-H-B Local Failure Retry Recovery Final

Date: 2026-07-15

## Scope

Phase05-H-B validated Worker Slicing failure, retry, lease expiry, resume, and recovery behavior in a fully local isolated environment.

This phase did not deploy production code, did not SSH to production, did not use production database or production token, did not use real customer files, did not create real customer slicing tasks, did not modify orders, quotes, payment, WeChat Pay, upload limits, or create a slicing systemd service.

## Modified Files

- `worker/make3d-slicing-worker.mjs`
- `src/app/api/worker/slicing/jobs/[id]/lock/route.ts`
- `tests/workerSlicingClient.test.mjs`
- `tests/workerSlicingRecovery.test.mjs`
- `scripts/phase05-h-b-fault-inject.mjs`
- `scripts/phase05-h-b-integration-driver.mjs`
- `scripts/phase05-h-b-local-recovery-integration.sh`
- `reports/phase05-h-b-local-failure-retry-recovery-final.md`
- `changelog/CHANGELOG.md`

## Local Environment

- WSL distribution: Ubuntu-24.04
- Existing file sync service: `make3d-file-sync-worker.service`
- Existing file sync service before validation: active, Main PID 2682
- Existing file sync service after validation: active, Main PID 2682
- PrusaSlicer was used only through the local isolated Worker slicing validation.
- No production Worker slicing service was created.

## Isolated Test Storage

- Test root: `/srv/make3d-worker/test-integration/phase05-h-b`
- Test database: `/srv/make3d-worker/test-integration/phase05-h-b/db/make3d-test.db`
- Driver summary: `/srv/make3d-worker/test-integration/phase05-h-b/logs/driver.json`
- Driver log: `/srv/make3d-worker/test-integration/phase05-h-b/logs/driver.log`
- Local API log: `/srv/make3d-worker/test-integration/phase05-h-b/logs/next.log`
- Input model: synthetic cube only, no customer file.

## Fault Injection Method

- `scripts/phase05-h-b-fault-inject.mjs` was added for isolated lease expiry testing.
- The script requires `--db` and `--job`.
- It refuses database paths outside `/srv/make3d-worker/test-integration/phase05-h-b/`.
- It sets active job `lock_expires_at_ms` and `lease_expires_at_ms` to an expired value for local recovery scenarios.
- It does not touch production database, production uploads, orders, quotes, or payments.

## Worker Changes

- The local slicing Worker now supports `resume_from=sliced` and `resume_from=parsing`.
- Resume validates existing G-code path, file existence, size, and SHA-256 before parsing.
- Resume skips PrusaSlicer and skips duplicate `/sliced` submission.
- Missing or mismatched resume artifact fails closed with `WORKER_IO_ERROR`.
- Worker run result now records `resumedFrom` and `prusaSlicerRan` for diagnostics.
- Profile whitelist validation was added for tests without changing default production behavior.

## API Changes

- Lock API response now includes job-owned artifact diagnostics:
  - `gcode_relative_path`
  - `gcode_size_bytes`
  - `gcode_sha256`
  - `stdout_relative_path`
  - `stderr_relative_path`
- This supports safe local resume validation without exposing arbitrary file paths.

## Local Integration Results

| Scenario | Result | Attempts | Final State | Notes |
| --- | --- | --- | --- | --- |
| retryable_failure | passed | 1 failed `SLICER_TIMEOUT`, 2 partial | partial | Retryable failure returned to pending and completed on second attempt. |
| non_retryable_failure | passed | 1 failed `SLICER_NON_ZERO_EXIT` | failed | Non-retryable failure did not create attempt 2. |
| locked_expiry | passed | 1 expired `WORKER_LEASE_EXPIRED_LOCKED`, 2 partial | partial | Expired locked job was recovered into a new attempt. |
| slicing_expiry | passed | 1 expired `WORKER_LEASE_EXPIRED_SLICING`, 2 partial | partial | Expired slicing job was recovered into a new slicing attempt. |
| sliced_resume | passed | 1 expired `WORKER_LEASE_EXPIRED_SLICED`, 2 partial | partial | Reused existing G-code; PrusaSlicer did not run on attempt 2. |
| parsing_resume | passed | 1 expired `WORKER_LEASE_EXPIRED_PARSING`, 2 partial | partial | Reused existing G-code; PrusaSlicer did not run on attempt 2. |
| different_artifact_worker | passed | local isolated validation | validated | Different artifact Worker did not receive sliced/parsing resume ownership. |
| lease_renewal | passed | local isolated validation | validated | Lease heartbeat kept ownership and did not shorten lease. |
| missing_resume_artifact | passed | 1 expired `WORKER_LEASE_EXPIRED_SLICED`, 2 failed `WORKER_IO_ERROR` | failed | Missing artifact failed closed without parser/result submission. |

## Old Lock Owner Invalidation

- Unit/API coverage confirms wrong `lock_owner` is rejected for lease, state, result, and failure transitions.
- The local integration `different_artifact_worker` scenario passed and confirmed a different artifact Worker does not receive `resume_from=sliced` or `resume_from=parsing`.
- Existing file sync Worker behavior was not modified.

## Lease Heartbeat

- Lease heartbeat was validated by unit/API tests and local integration.
- It renews with the frozen slicing lease duration and does not shorten an existing lease.
- Expired lease paths return recovery behavior instead of silently continuing with stale ownership.

## G-code Reuse Evidence

Total local PrusaSlicer runs during the integration driver: 6.

| Scenario | G-code Path | Size | SHA-256 | mtime before | mtime after | PrusaSlicer on resumed attempt |
| --- | --- | ---: | --- | ---: | ---: | --- |
| sliced_resume | `/srv/make3d-worker/test-integration/phase05-h-b/results/prusaslicer/5/output.gcode` | 284994 | `5e7bccb6c35e4e645c30f71cd0ae6452415c36d38c1697af02a915ca84e354d1` | 1784111253156.724 | 1784111253156.724 | no |
| parsing_resume | `/srv/make3d-worker/test-integration/phase05-h-b/results/prusaslicer/6/output.gcode` | 284994 | `d55a65e702d574a664e2b1f50115b7ea51aab324f268b5a0bfb3f08b5a4f865f` | 1784111255361.946 | 1784111255361.946 | no |

Additional successful recovery G-code SHA-256 values:

- retryable failure recovery: `72c66999b8896fbf1fccb448fa2e37d6cffc40ed9342839f38cb66f596f1a312`
- locked expiry recovery: `a666a6655ebe47d7d07feb57c14079d05fa86e234a7ae370a309dc771ff549f2`
- slicing expiry recovery: `b927788a8a870bf96b1f9cba08b4e9c3c3faa7119973fab476e11d1760c7aee7`

## Automated Tests

Targeted tests:

- `node --test tests/workerSlicingRecovery.test.mjs`: passed, 8/8
- `node --test tests/workerSlicingClient.test.mjs`: passed, 16/16
- `node --test tests/workerSlicingApi.test.mjs`: passed, 22/22
- `node --test tests/workerSlicingJobs.test.mjs`: passed, 46/46
- `node --test tests/prusaslicerResultParser.test.mjs`: passed, 24/24
- `node --test tests/workerLocalSync.test.mjs`: passed, 5/5
- `node --test tests/workerApi.test.mjs`: passed, 6/6

Full regression:

- `npm test`: passed, 300/300
- `npm run lint`: passed
- `npm run build`: passed

Local integration:

- `bash scripts/phase05-h-b-local-recovery-integration.sh`: passed

## Order, Quote, Payment, And Upload Impact

- Order impact: none.
- Quote impact: none.
- Payment impact: none.
- WeChat Pay impact: none.
- Upload limit impact: none.
- Production database impact: none.
- Production token/config impact: none.
- Production deployment impact: none.

## Discovered Issues

- Initial local script run could not create the isolated H-B directory without elevated setup. The script now creates and chowns the isolated test directory safely.
- Early local driver retries could be affected by earlier retryable local test tasks. The driver now cleans up isolated test queue records after specific validation scenarios so later scenarios cannot accidentally claim stale local jobs.
- These were local validation harness issues only; no production behavior was changed.

## Rollback

- Revert the Worker resume changes in `worker/make3d-slicing-worker.mjs`.
- Revert the lock response artifact diagnostics in `src/app/api/worker/slicing/jobs/[id]/lock/route.ts`.
- Remove `tests/workerSlicingRecovery.test.mjs` and the H-B test additions if rolling back the phase only.
- Remove H-B scripts under `scripts/phase05-h-b-*` if the local validation harness is no longer needed.
- No database rollback is required for production because this phase did not migrate or touch production data.

## Next Stage Recommendation

Phase05-H-B is ready for review.

The system is technically ready to enter either:

- Phase05-I production pre-deploy audit, or
- a local admin/operator design phase before production pre-deploy.

Do not deploy slicing to production until a separate production pre-deploy audit is approved.
