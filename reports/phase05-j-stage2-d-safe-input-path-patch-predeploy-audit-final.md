# Phase05-J Stage 2-D Safe Input Path Patch Predeploy Audit Final

## 1. Audit Time

- Local audit timestamp: `2026-07-16 16:06:24 +08:00`
- Production read-only timestamp observed: `2026-07-16T15:55:21+0800`

This phase was an audit only.

Not performed:

- no production deployment
- no production `git pull`
- no Docker Compose build/up/down/restart
- no production container restart
- no Nginx restart
- no production database write or migration
- no production token or environment change
- no real customer file or real customer slicing task
- no order, quote, amount, payment, WeChat Pay, or upload-limit change
- no Slicing Worker systemd service creation or start
- no Stage 2 historical record modification

## 2. Local Candidate HEAD

- Local repository: `C:\Users\21899\Documents\make3d-platform`
- Branch: `phase05-worker-slicing-candidate`
- HEAD: `abca39e83bb959b7ba99ffde50d1c8532f9188d0`

Current local Stage 2-C patch is not committed.

Tracked modified files:

- `changelog/CHANGELOG.md`
- `scripts/phase05-h-a-seed.mjs`
- `scripts/phase05-h-b-integration-driver.mjs`
- `scripts/phase05-h-c-attempt-isolation-driver.mjs`
- `scripts/phase05-h-c-final-lease-process-fencing-driver.mjs`
- `src/backend/workerSlicingJobs.ts`
- `tests/workerSlicingApi.test.mjs`
- `tests/workerSlicingAttemptIsolation.test.mjs`
- `tests/workerSlicingClient.test.mjs`
- `tests/workerSlicingJobs.test.mjs`
- `tests/workerSlicingLeaseFencing.test.mjs`
- `tests/workerSlicingRecovery.test.mjs`
- `worker/make3d-slicing-worker.mjs`

Relevant untracked reports remain present and were not deleted:

- `reports/phase05-j-b-production-copy-migration-rehearsal-final.md`
- `reports/phase05-j-c-production-cloud-api-deploy-dry-plan-final.md`
- `reports/phase05-j-d-final-predeployment-checkpoint.md`
- `reports/phase05-j-stage1a-deployment-final.md`
- `reports/phase05-j-stage1b-readonly-validation-final.md`
- `reports/phase05-j-stage2-c-safe-input-path-contract-final.md`
- `reports/phase05-j-stage2-test-only-slicing-validation-final.md`
- `reports/phase05-j-stage2-d-safe-input-path-patch-predeploy-audit-final.md`

`git diff --check` passed with only line-ending warnings from the Windows checkout.

## 3. Production Current HEAD

Production repository:

- Path: `/opt/make3d-platform`
- HEAD: `abca39e83bb959b7ba99ffde50d1c8532f9188d0`

Production git status contains only known production-local untracked files:

- `.env.production.bak.20260618-102007.wechat-switch`
- `.env.production.bak.20260618-105719.wechat-secret-reset`
- `.env.production.bak.20260707-230014.wechat-pay-prod`
- `public/MP_verify_IYmXrtGcQEZ8dsuF.txt`

No production Git command that changes state was run.

## 4. Production Service Status

Production Docker:

- `make3d-platform`
- image: `make3d-platform-make3d`
- status: `Up 3 hours`
- port: `0.0.0.0:3000->3000/tcp`

Nginx:

- state: `active`
- MainPID: `110161`

Production Slicing Worker:

- no `make3d*slicing*` systemd unit listed
- no persistent Slicing Worker process found
- no `prusa-slicer` process found by exact process-name check

File sync Worker:

- The production cloud host does not have `make3d-file-sync-worker.service` installed.
- The established WSL file sync Worker on this machine remains active:
  - state: `active`
  - MainPID: `203`
  - SubState: `running`

No service was stopped or restarted.

## 5. Production Database Read-only Health

The production SQLite database was opened read-only from the running container through `node:sqlite`; no DB URL, token, customer private field, OpenID, payment流水, phone, or email was printed.

Results:

- `integrity_check`: `ok`
- `foreign_key_check_count`: `0`
- `orders`: `11`
- `files`: `13`
- `local_file_sync_jobs`: `2`
- `slicing_jobs`: `2`
- `slicing_job_attempts`: `2`
- `order_payments`: `8`
- `wechat_refunds`: `3`
- `payment_settings.wechat_enabled`: `0`

Production env presence check without secret output:

- `WECHAT_PAY_ENABLED=true`
- `WECHAT_PAY_TEST_ONLY=true`
- `MAKE3D_WORKER_INTEGRATION_TEST_MODE=absent_or_empty`
- `MAKE3D_WORKER_TOKEN=present_non_empty`

## 6. `local_file_sync_jobs` Path Field Check

Production schema includes the required path field:

| Field | Type | NOT NULL |
| --- | --- | --- |
| `relative_path` | `TEXT` | yes |

Observed production `local_file_sync_jobs` records:

- `relative_path_nonempty`: `2`
- `relative_path_empty`: `0`

Selected schema fields:

- `id INTEGER`
- `file_id INTEGER NOT NULL`
- `order_id INTEGER NOT NULL`
- `customer_id INTEGER`
- `order_no TEXT NOT NULL`
- `source_type TEXT NOT NULL DEFAULT 'order_file'`
- `source_version TEXT NOT NULL DEFAULT 'upload_v1'`
- `original_filename TEXT NOT NULL`
- `stored_filename TEXT NOT NULL`
- `relative_path TEXT NOT NULL`
- `file_size_bytes INTEGER NOT NULL`
- `sha256 TEXT`
- `sync_status TEXT NOT NULL DEFAULT 'pending'`
- `worker_id TEXT`
- `local_path TEXT`
- `local_sha256 TEXT`
- `local_synced_at DATETIME`
- `schema_version INTEGER NOT NULL DEFAULT 1`
- `worker_version TEXT`

No schema blocker was found for Stage 2-C safe input path behavior.

## 7. Phase04 File Sync Compatibility

The Phase04 file sync flow remains compatible:

- `tests/workerLocalSync.test.mjs`: 5/5 passed
- `local_file_sync_jobs.relative_path` already exists in production and is non-empty.
- Stage 2-C does not require changing `make3d-file-sync-worker.service` environment variables.
- Stage 2-C slicing helper can derive safe `files/...` input paths from verified local sync state without exposing absolute paths in the pending API.

Compatibility note:

- The cloud app server does not host the local WSL file sync Worker systemd unit.
- The local WSL Worker that was used in earlier operational validation remains active on PID `203`.

## 8. Pending API New Contract Audit

Candidate code confirms `GET /api/worker/slicing/jobs/pending` returns:

- `job_id`
- `file_id`
- `file_sync_job_id`
- `order_no`
- `input_worker_id`
- `input_relative_path`
- `input_size_bytes`
- `input_sha256`
- profile key/version/SHA
- `slice_params`
- `slice_params_sha256`
- `slice_cache_key_sha256`
- required slicer/parser versions
- `resume_from`

Candidate code confirms pending payload does not return:

- absolute Worker path
- database path
- token
- OpenID
- payment data
- full customer private fields

Candidate pending filtering rejects or omits:

- unverified sync jobs
- worker mismatch
- file size mismatch
- SHA mismatch
- unsafe relative paths
- absolute paths
- `..`
- backslashes
- URL-encoded traversal
- null bytes

## 9. Worker Input Parsing Audit

Candidate Worker formal mode now requires:

- `job.input_relative_path`

Formal mode no longer falls back to:

- `files/<file_id>-synthetic-cube.stl`

Failure behavior:

- missing `input_relative_path`: fail closed
- unsafe path: fail closed
- missing file: `/failed` with `WORKER_IO_ERROR`
- size mismatch: `/failed` with `WORKER_IO_ERROR`
- SHA mismatch: `/failed` with `WORKER_IO_ERROR`

Fallback remains available only when both are true:

- `MAKE3D_WORKER_INTEGRATION_TEST_MODE=1`
- API host is `localhost` or `127.0.0.1`

The local test `tests/workerSlicingClient.test.mjs` confirms production URL fallback is not available.

## 10. Stage 2 Historical Record Protection

Read-only production DB check confirmed:

- `stage2_order_30`: `1`
- `stage2_file_34`: `1`
- `stage2_sync_2`: `1`
- `stage2_slicing_job_1_status`: `failed`
- `stage2_slicing_job_1_error`: `WORKER_IO_ERROR`
- `stage2_slicing_job_2_status`: `partial`
- `stage2_slicing_job_2_error`: empty

These records were not modified, deleted, backfilled, or repaired.

They remain preserved as audit evidence of the old input-path contract behavior.

## 11. Database Compatibility

Stage 2-C requires no production schema change.

Reason:

- `local_file_sync_jobs.relative_path` already exists.
- The field is `TEXT NOT NULL`.
- Existing production records are non-empty.
- `slicing_jobs.input_relative_path` and `input_size_bytes` already exist from the deployed additive Phase05 schema.

No migration was designed or executed in Stage 2-D.

If Stage 2-E deploys only this patch, database rollback is not expected to require schema rollback. Application rollback should return to the previous production commit if needed.

## 12. Local Candidate Regression Results

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

Tests were run against local candidate/test databases only, not the production database.

## 13. Production Deployment Risk

### Blockers

1. Stage 2-C patch is not committed.

   Production deployment must reference a clear deployable commit. Current HEAD is still `abca39e83bb959b7ba99ffde50d1c8532f9188d0`, while the Safe Input Path patch exists as local uncommitted changes.

2. Historical Stage 2 records should remain untouched.

   Any Stage 2-E plan must explicitly avoid repairing or backfilling existing synthetic job 1/2 records.

### Must Fix Before Deploy

- Create a dedicated Stage 2-C/2-E release commit for the safe input path patch and reports/changelog.
- Confirm the release commit includes only the audited files and no `.env`, token, cert, key, database, backup, or test artifact.
- Prepare Stage 2-E deployment steps with a fresh production DB backup and pre/post commit capture.

### Acceptable Risks

- Deploying the cloud API patch before starting any Slicing Worker is safe: no resident Slicing Worker is running and no automatic slicing path exists.
- If a patched Worker sees an old pending API payload without `input_relative_path`, it fails closed instead of guessing a filename.
- Phase03 file sync Worker remains separate; Stage 2-C does not change its API or environment.
- Existing `local_file_sync_jobs.relative_path` is already present and populated.

### Post-deploy Observation Items

- Pending API returns no absolute path.
- Existing Stage 2 historical jobs are not repaired or mutated.
- `slicing_jobs` count does not change during read-only deploy validation.
- `make3d-file-sync-worker.service` on local WSL remains active.
- No PrusaSlicer or Slicing Worker resident process appears.
- Payment and WeChat TEST_ONLY settings remain unchanged.

## 14. Recommended Staged Patch Deployment Order

Do not execute in Stage 2-D. Recommended design only:

### Stage 2-E

Deploy cloud Safe Input Path API patch only.

Constraints:

- do not start Slicing Worker
- do not create slicing jobs
- do not modify historical Stage 2 records
- verify pending API authentication
- verify pending payload does not leak absolute paths
- verify old Stage 2 records are not returned as processable tasks

### Stage 2-F

Update or use the patched local one-shot Worker only after Stage 2-E is stable.

Constraints:

- create a new TEST synthetic record
- ensure explicit safe input relative path exists
- run one-shot only
- verify final `partial`
- verify no real customer files or orders are touched

### Stage 3

TEST-only failure/retry/recovery validation.

## 15. Blockers

Current Stage 2-D decision:

- Code safety: pass.
- Database compatibility: pass.
- Production read-only health: pass.
- Local regression: pass.
- Deployability as-is: blocked.

Reason:

- The patch is not committed as a deployable release commit.

No production service or database issue was introduced by this audit.

## 16. Stage 2-E Decision

Do not enter Stage 2-E deployment directly from the current uncommitted worktree.

Stage 2-E may proceed only after:

1. The Safe Input Path patch is committed as a clear release commit.
2. The release commit is reviewed against this report.
3. Stage 2-E deployment is explicitly approved.

Until then, production remains on `abca39e83bb959b7ba99ffde50d1c8532f9188d0` with no Stage 2-C patch deployed.
