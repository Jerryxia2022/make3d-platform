# Phase05-H-A Local Closed-Loop Worker Slicing Integration Final

Date: 2026-07-15
Status: completed, not deployed

## Lease Contract Correction Addendum

Date: 2026-07-15
Status: corrected and revalidated locally, not deployed

Phase05-H-A was re-run after the Worker Slicing lease contract correction. The previous run proved the closed loop but exposed an initial lease mismatch:

```text
old lease_expires_at_ms: 1784104861141
old lease_renewed_at_ms: 1784104561141
old delta: 300000 ms
frozen contract: 120000 ms
```

The corrected local closed-loop run used a new isolated test database and a new synthetic TEST task:

```text
Database: /srv/make3d-worker/test-integration/phase05-h-a/db/make3d-test.db
TEST order_no: M3D20260715171600827
slicing_job_id: 1
file_id: 1
file_sync_job_id: 1
```

Corrected initial lock and lease evidence:

```text
locked_at_ms: 1784107113766
lock_expires_at_ms: 1784107233766
lock delta: 120000 ms
lease_renewed_at_ms: 1784107113766
lease_expires_at_ms: 1784107233766
lease delta: 120000 ms
attempt_lease_renewed_at_ms: 1784107113766
attempt_lease_expires_at_ms: 1784107233766
attempt lease delta: 120000 ms
```

Corrected state chain and result:

```text
pending -> lock -> slicing -> sliced -> parsing -> result
final status: partial
attempt_status: partial
attempt_count: 1
worker_id: wsl-worker-01
artifact_worker_id: wsl-worker-01
```

Corrected G-code evidence:

```text
relative path: results/prusaslicer/1/output.gcode
size: 284994 bytes
SHA-256: ca9f8f75e027fa0d7bcf849674dff3572e4abf3335d9bbed3cbf210b9d96ea37
local SHA matches DB: yes
```

Existing file sync Worker service was observed before and after the corrected run and remained active:

```text
before: active
after: active
```

The original evidence below is retained for audit history.

## Scope

Phase05-H-A completed a local closed-loop integration using:

- local Make3D API on `127.0.0.1:3100`
- isolated SQLite database at `/srv/make3d-worker/test-integration/phase05-h-a/db/make3d-test.db`
- independent one-shot slicing Worker
- WSL PrusaSlicer CLI
- Phase05-C parser

No production deployment, SSH production access, production database access, real customer file, real customer slicing task, online order mutation, quote change, order amount change, payment change, WeChat Pay change, upload-limit change, production Worker Token change, automatic quote, or automatic customer-status change was performed.

## 1. Local Environment

```text
Repo: /mnt/c/Users/21899/Documents/make3d-platform
Worker root: /srv/make3d-worker
Phase test root: /srv/make3d-worker/test-integration/phase05-h-a
PrusaSlicer binary: /usr/bin/prusa-slicer
PrusaSlicer package version: 2.7.2+dfsg-1build2
Parser: worker/prusaslicer-result-parser.mjs
Parser version: phase05-c-parser-v1
Profile: /srv/make3d-worker/config/prusaslicer/bambu-p1s.ini
Profile SHA-256: 4437bf3e44534004aa51db7c6de16c13c130f62de3cd3b14d52194a7eb4f6e0f
```

The existing file sync Worker service was observed only and remained active:

```text
make3d-file-sync-worker.service: active
```

## 2. Test Database

```text
Database: /srv/make3d-worker/test-integration/phase05-h-a/db/make3d-test.db
Database type: isolated local SQLite
Production database used: no
Production database copy used: no
```

The local API process was started with `DATABASE_URL=file:/srv/make3d-worker/test-integration/phase05-h-a/db/make3d-test.db`.

## 3. Test Directory

```text
/srv/make3d-worker/test-integration/phase05-h-a/files
/srv/make3d-worker/test-integration/phase05-h-a/processing
/srv/make3d-worker/test-integration/phase05-h-a/results
/srv/make3d-worker/test-integration/phase05-h-a/failed
/srv/make3d-worker/test-integration/phase05-h-a/logs
/srv/make3d-worker/test-integration/phase05-h-a/db
```

The synthetic STL source expected at `/srv/make3d-worker/test-slicer/input/test-cube-20mm.stl` was missing during environment audit, so a new 20 mm cube ASCII STL was generated there for synthetic-only testing. No customer file directory was used or overwritten.

## 4. New Worker File

```text
worker/make3d-slicing-worker.mjs
```

The Worker is independent from `worker/make3d-file-sync-worker.mjs`. It supports one-shot mode only:

```text
node worker/make3d-slicing-worker.mjs --once
```

No slicing systemd service was created.

## 5. New Scripts

```text
scripts/phase05-h-a-local-integration.sh
scripts/phase05-h-a-seed.mjs
scripts/phase05-h-a-verify.mjs
```

The integration script creates a temporary local test token file, does not print the token, deletes the token file on exit, starts local Next.js from an existing build, runs the one-shot slicing Worker, verifies SQLite/G-code state, and stops the local Next.js process.

## 6. Test Task

Seed summary:

```text
TEST order_no: M3D20260715163354420
customer_id: 1
order_id: 1
file_id: 1
file_size_bytes: 1497
file_sha256: 18bf78f41a7019929e8043bd7a3e363f70450937effd51145319ecbf575bbaff
local_file_sync_job_id: 1
slicing_job_id: 1
worker_id: wsl-worker-01
```

The seed used `createSlicingJobForVerifiedFile`; slicing job data was not forged around the helper.

## 7. Full State Chain

Verified state chain:

```text
pending -> lock -> slicing -> sliced -> parsing -> result
```

Final state:

```text
slicing_jobs.status: partial
slicing_job_attempts.status: partial
attempt_count: 1
worker_id: wsl-worker-01
artifact_worker_id: wsl-worker-01
```

`partial` is expected and accepted because the parser returned `metrics_status=warning` and `parser_quote_ready=false`.

## 8. PrusaSlicer Command Summary

Command semantics:

```text
/usr/bin/prusa-slicer
--export-gcode
--load /srv/make3d-worker/config/prusaslicer/bambu-p1s.ini
--output /srv/make3d-worker/test-integration/phase05-h-a/results/prusaslicer/1/output.gcode
--filament-type PLA
--layer-height 0.2
--fill-density 50%
/srv/make3d-worker/test-integration/phase05-h-a/files/1-synthetic-cube.stl
```

The Worker builds arguments as an array and runs with `shell: false`.

## 9. Slice Duration

```text
slice_duration_ms: 3949
exit_code: 0
```

## 10. G-code

```text
relative path: results/prusaslicer/1/output.gcode
size: 284994 bytes
SHA-256: 1f21d43c30b7bbc08aff15fe816ec3002225c59cb4750ac072f737554a76f352
local SHA matches DB: yes
```

Logs were retained:

```text
stdout: results/prusaslicer/1/stdout.log
stderr: results/prusaslicer/1/stderr.log
```

## 11. Parser Result

```text
parse_status: parsed
metrics_status: warning
parser_quote_ready: false
print_time_seconds: 1496
filament_weight_mg: 0
parse_cache_key_sha256: a5b3947716be167b84fce232f671392a9562e2489801b7b63136d4a100338547
```

Warnings:

```text
duplicate fields encountered: prusaslicer_config
explicit source weight is zero while filament volume is nonzero
layer_count derived from LAYER_CHANGE markers
max_layer_z_microns derived from Z markers
```

No parser result was forged or manually changed to force `completed`.

## 12. Final Database State

```text
slicing_job_id: 1
status: partial
attempt_status: partial
attempt_count: 1
worker_id: wsl-worker-01
artifact_worker_id: wsl-worker-01
lease_expires_at_ms on final job: null
gcode_sha256: 1f21d43c30b7bbc08aff15fe816ec3002225c59cb4750ac072f737554a76f352
```

## 13. Attempt State

```text
attempt_no: 1
status: partial
lease_expires_at_ms: 1784104861141
lease_renewed_at_ms: 1784104561141
slice_duration_ms: 3949
exit_code: 0
```

## 14. Lease

Generic lease heartbeat logic was implemented. The 20 mm cube completed before a 30-second renewal was needed, but the Worker can post `/lease` during longer slicing work and does not submit lease expiry values.

## 15. Worker Exit Code

```text
Worker one-shot exit code: 0
Worker result: partial
```

Worker log summary:

```text
{"exitCode":0,"status":"partial","jobId":1,"attemptNo":1,"gcodeSizeBytes":284994,"gcodeSha256":"1f21d43c30b7bbc08aff15fe816ec3002225c59cb4750ac072f737554a76f352","parserQuoteReady":false}
```

No token was written to the Worker log.

## 16. Test Results

```text
node --test tests/workerSlicingClient.test.mjs
Result: passed, 13/13

node --test tests/workerSlicingApi.test.mjs
Result: passed, 22/22

node --test tests/workerSlicingJobs.test.mjs
Result: passed, 43/43

node --test tests/prusaslicerResultParser.test.mjs
Result: passed, 24/24

node --test tests/workerLocalSync.test.mjs
Result: passed, 5/5

node --test tests/workerApi.test.mjs
Result: passed, 6/6

npm test
Result: passed, 286/286

npm run lint
Result: passed

npm run build
Result: passed
```

## 17. Local Integration Run

```text
Script: scripts/phase05-h-a-local-integration.sh
Result: passed
Local API: 127.0.0.1:3100
Next.js process stopped after run: yes
Temporary test token file deleted: yes
```

Important operational note: WSL `next dev` attempted to download `@next/swc-linux-x64-gnu` and failed because WSL network access to npm timed out. The integration script was adjusted to use `next start` from an existing local build. A fresh `npm run build` created `.next/BUILD_ID`, after which local integration passed.

## 18. Order Impact

Only the isolated local SQLite database contains the synthetic order:

```text
M3D20260715163354420
```

No production order or online order was created or modified.

## 19. Quote Impact

No quote logic, automatic quote, customer quote page behavior, price calculation, or order amount was changed.

The slicing result remains parser metrics only and is not connected to pricing.

## 20. Payment Impact

No payment logic, payment records, refund records, or payment settings were changed.

## 21. WeChat Pay Impact

No WeChat Pay code, key, certificate, APIv3 key, JSAPI, Native, refund, callback, notification, test-only flag, or production Worker Token was changed.

## 22. Existing File Sync Worker Status

The existing service was not stopped, disabled, reconfigured, or pointed at local test API:

```text
make3d-file-sync-worker.service: active
```

The Phase04 file sync path was not changed.

## 23. Production Impact

No production deployment was performed.

No production database was accessed.

No production token was changed.

No real customer files were read.

## 24. Discovered Issues

- `/srv/make3d-worker/test-slicer/input/test-cube-20mm.stl` was missing and was recreated as a synthetic 20 mm cube STL.
- The current `codex` WSL user needed minimal ACL access to the Phase05-H-A test path and the existing verified profile file. Existing file sync service files and env were not changed.
- WSL `next dev` is blocked without the Linux Next SWC package and network access. The working local integration path is `npm run build` first, then local `next start`.
- The synthetic P1S profile produces a valid parser result with `partial` final status because filament weight is reported as zero while filament volume is nonzero. This is expected and not a failure.

## 25. Phase05-H-B Readiness

Phase05-H-A is ready for review.

After approval, Phase05-H-B can focus on local failure, retry, timeout, lease expiry, and resume recovery integration. It should remain local-only and should not connect slicing results to customer pricing or production automation.

## 26. Rollback

To roll back Phase05-H-A code changes:

```text
remove worker/make3d-slicing-worker.mjs
remove scripts/phase05-h-a-local-integration.sh
remove scripts/phase05-h-a-seed.mjs
remove scripts/phase05-h-a-verify.mjs
remove tests/workerSlicingClient.test.mjs
revert changelog entry
remove this report
```

To clean local audit artifacts only after approval:

```text
remove /srv/make3d-worker/test-integration/phase05-h-a
```

Do not remove the existing `/srv/make3d-worker/files` directory or the existing file sync Worker service.
