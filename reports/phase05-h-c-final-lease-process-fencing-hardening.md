# Phase05-H-C Final Lease Process Fencing Hardening

Date: 2026-07-15

## Scope

This final H-C hardening pass fixed Worker Slicing lease deadline anchoring, shutdown fencing, process cleanup, atomic publish filesystem validation, and long parser heartbeat verification.

No production deployment was performed. This phase did not SSH production, access production database/token, use real customer files, create real customer slicing tasks, modify orders, quotes, order amounts, payment, WeChat Pay, upload limits, automatic quote behavior, customer status updates, or create a slicing systemd service.

## Modified Files

- `worker/make3d-slicing-worker.mjs`
- `tests/workerSlicingLeaseFencing.test.mjs`
- `tests/workerSlicingAttemptIsolation.test.mjs`
- `scripts/phase05-h-c-final-lease-process-fencing-driver.mjs`
- `scripts/phase05-h-c-final-lease-process-fencing-integration.sh`
- `reports/phase05-h-c-attempt-isolation-lease-fencing-final.md`
- `reports/phase05-h-c-final-lease-process-fencing-hardening.md`
- `changelog/CHANGELOG.md`

## Old Deadline Risk

Before this hardening pass, the local monotonic lease deadline was derived from response receipt time plus the full server TTL:

- `lease_ttl_ms = lease_expires_at_ms - lease_renewed_at_ms`
- old local deadline: response received monotonic time + full TTL

That failed to deduct network round-trip time. Slow lock or lease responses could make the Worker believe it owned the lease longer than the server-side lease window.

## New Deadline Formula

The Worker now records request start time before both `/lock` and `/lease` calls.

New local deadline:

- `request_started_monotonic_ms = performance.now()` before request send
- `lease_ttl_ms = lease_expires_at_ms - lease_renewed_at_ms`
- `local_deadline_ms = request_started_monotonic_ms + lease_ttl_ms - LEASE_SAFETY_MARGIN_MS`

Safety margin:

- `LEASE_SAFETY_MARGIN_MS = 2000`
- margin must be greater than `0`
- margin must be smaller than the server TTL

The expected server TTL remains `120000 ms`.

## Network RTT Tests

`tests/workerSlicingLeaseFencing.test.mjs` covers:

- request start at monotonic `1000`
- response receipt at monotonic `6000`
- server TTL `120000 ms`
- deadline is `1000 + 120000 - 2000`, not `6000 + 120000`
- 1 second, 5 second, and 30 second simulated RTTs reduce remaining local lease after response
- local `Date.now()` 10 minutes fast or slow does not affect ownership

## Process Fencing

The Worker now:

- tracks spawned slicer children for cleanup
- sets shutdown ownership loss on `SIGTERM` and `SIGINT`
- stops active lease timers during shutdown cleanup
- sends `SIGTERM` to the slicer process group on Linux/WSL
- schedules `SIGKILL` after the grace period if the process group remains
- avoids reporting `/failed` after shutdown-triggered slicer termination
- avoids immediate `process.exit()` after `runOnce`, allowing cleanup timers to run

## Atomic Publish Filesystem Check

Before slicing, the Worker checks:

- `processing` root `stat.dev`
- `results` root `stat.dev`

If they differ, the Worker fails closed. The phase does not claim cross-filesystem `rename` is atomic.

## Local Integration

Integration script:

- `scripts/phase05-h-c-final-lease-process-fencing-integration.sh`

Driver:

- `scripts/phase05-h-c-final-lease-process-fencing-driver.mjs`

Isolated root:

- `/srv/make3d-worker/test-integration/phase05-h-c-final`

Isolated database:

- `/srv/make3d-worker/test-integration/phase05-h-c-final/db/make3d-test.db`

Driver summary:

- `/srv/make3d-worker/test-integration/phase05-h-c-final/logs/driver.json`

## Lease Loss Process Termination

Scenario: `lease_loss_process_termination`

- Job id: `1`
- Worker PID: `12057`
- Slicer parent PID: `12070`
- Slicer child PID: `12077`
- Lease error status: `409`
- SIGTERM sent: yes
- SIGKILL scheduled: yes
- Parent PID exists final: no
- Child PID exists final: no
- Worker exit: code `0`, status `ownership-lost`
- Forbidden state report count after loss: `0`
- Formal G-code exists: no
- Final job status before scenario retirement: `failed`

## Worker Signal Cleanup

Scenario: `worker_sigterm_cleanup`

- Job id: `2`
- Worker PID: `12085`
- Slicer parent PID: `12098`
- Slicer child PID: `12105`
- SIGTERM sent to Worker: yes
- SIGTERM sent to slicer group: yes
- SIGKILL scheduled: yes
- Parent PID exists final: no
- Child PID exists final: no
- Worker exit code: `143`
- Forbidden state report count after signal: `0`
- Formal G-code exists: no
- Final job status before scenario retirement: `slicing`

## Long Parser Heartbeat

Scenario: `long_parser_heartbeat`

- Job id: `3`
- Attempt no: `1`
- Initial lease delta: `120000 ms`
- Initial lock delta: `120000 ms`
- PrusaSlicer ran: yes
- Parser delay: `35000 ms`
- Lease calls after `/parsing`: `35`
- `/result` called: yes
- Final status: `partial`
- G-code size: `284994`
- G-code SHA-256: `f3b6b971557e87c9fc20b993a3cd196570fc71bfdf32804e1e748b159eb19c7d`

## Resume Parser Heartbeat

Scenario: `resume_parser_heartbeat`

- Job id: `4`
- Attempt no: `2`
- `resume_from`: `parsing`
- Initial lease delta: `120000 ms`
- Initial lock delta: `120000 ms`
- PrusaSlicer ran: no
- Parser delay: `35000 ms`
- Lease calls after lock: `35`
- G-code SHA preserved: yes
- Final status: `partial`
- G-code SHA-256: `a2f80dfebe8249dcc183637b79d90e72be9ac80ec22814672a2381c90b41f254`

## Existing File Sync Worker Protection

Before integration:

- `make3d-file-sync-worker.service`: active
- Main PID: `2682`

After integration:

- `make3d-file-sync-worker.service`: active
- Main PID: `2682`

The existing file sync Worker was not stopped, restarted, or modified.

## Tests

Targeted tests:

- `node --test tests/workerSlicingLeaseFencing.test.mjs`: passed, 18/18
- `node --test tests/workerSlicingAttemptIsolation.test.mjs`: passed, 18/18
- `node --test tests/workerSlicingRecovery.test.mjs`: passed, 8/8
- `node --test tests/workerSlicingClient.test.mjs`: passed, 16/16
- `node --test tests/workerSlicingApi.test.mjs`: passed, 22/22
- `node --test tests/workerSlicingJobs.test.mjs`: passed, 46/46
- `node --test tests/prusaslicerResultParser.test.mjs`: passed, 24/24
- `node --test tests/workerLocalSync.test.mjs`: passed, 5/5
- `node --test tests/workerApi.test.mjs`: passed, 6/6

Full regression:

- `npm test`: passed, 336/336
- `npm run lint`: passed
- `npm run build`: passed

Local integration:

- `bash scripts/phase05-h-c-final-lease-process-fencing-integration.sh`: passed

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

## Issues Found And Fixed

- The previous local deadline used response receipt time and failed to deduct network RTT.
- Worker shutdown could clean the slicer process but still attempt `/failed`; shutdown now marks ownership lost and prevents terminal state reports.
- Immediate `process.exit()` could cancel SIGKILL cleanup; Worker now sets `process.exitCode` and exits naturally after `runOnce`.
- The integration harness originally allowed retryable failed test jobs to be picked by later scenarios; each scenario now retires its own test job to a non-retryable failed state.
- The integration root now clears stale files before each run so old artifacts cannot produce false positives.

## Rollback

- Revert the lease deadline and safety margin changes in `worker/make3d-slicing-worker.mjs`.
- Revert shutdown ownership fencing, active child tracking, request logging, and atomic filesystem checks in `worker/make3d-slicing-worker.mjs`.
- Remove `tests/workerSlicingLeaseFencing.test.mjs`.
- Remove `scripts/phase05-h-c-final-lease-process-fencing-driver.mjs`.
- Remove `scripts/phase05-h-c-final-lease-process-fencing-integration.sh`.
- No production database rollback is required because this phase did not deploy or migrate production.

## Next Stage Recommendation

Phase05-H-C Final Lease Process Fencing Hardening passed.

It is reasonable to enter Phase05-I production pre-deploy audit after review. Do not deploy slicing to production until Phase05-I is explicitly approved.
