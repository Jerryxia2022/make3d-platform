# Phase05-I Production Pre-Deploy Audit Final

Date: 2026-07-15

## 1. Scope

This phase performed a production pre-deploy audit for the Phase05 Worker Slicing work through Phase05-H-C.

No production deployment was performed. Production was accessed only for read-only inspection, except for creating an allowed SQLite audit backup copy. No production code was pulled, built, restarted, or changed. No Docker/Nginx/service restart was performed. No production token, environment value, live database row, order, quote, payment, WeChat Pay setting, upload limit, or customer file was modified. No production slicing task was created and no slicing systemd service was created.

## 2. Local Candidate Freeze

- Local branch: `feature/quote-page-redesign-sample`
- Local HEAD: `957c56a81727f7a9550e8235c2d19c8f5f2b596a`
- Local recent commits:
  - `957c56a feat: redesign quote checkout sample flow`
  - `7ef6616 fix: remove company contact block from legal overview`
  - `24a4f49 feat: launch legal v1 invoice evidence flow`
  - `343baa3 fix: send wechat refund success notifications`
  - `0ca6e26 fix: sync wechat refund query to payment`
- Local status: not clean.
- Tracked modified files include `package.json`, `src/backend/database.ts`, `tests/orders.test.mjs`.
- Many project reports, scripts, Worker API files, Worker files, and tests are still untracked.

Important deployment risk: local candidate is not currently a clean, reproducible deployment commit.

## 3. Local vs Production Git Relationship

- Production HEAD: `5566384c8f42778df834737b92d5886392acf093`
- Local HEAD: `957c56a81727f7a9550e8235c2d19c8f5f2b596a`
- Merge base: `7ef66166755766e337493ebe74028779e84285dc`

The local branch diverges from production Phase03. The local committed history does not contain production commit `5566384`; Phase03/Phase05 files are present mainly as working-tree changes/untracked files. This is a blocker for direct Phase05-J deployment. The candidate must be rebased/merged onto production HEAD and committed before any production rollout.

## 4. Candidate File Categories

Database/schema:

- `src/backend/database.ts`
- `src/backend/workerSlicingJobs.ts`

Worker Slicing API:

- `src/backend/workerSlicingApi.ts`
- `src/backend/workerSlicingAuth.ts`
- `src/app/api/worker/slicing/jobs/pending/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/lock/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/lease/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/slicing/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/sliced/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/parsing/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/result/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/failed/route.ts`

Worker local files:

- `worker/make3d-slicing-worker.mjs`
- `worker/prusaslicer-result-parser.mjs`
- existing Phase04 file sync Worker remains separate.

Tests and scripts:

- `tests/workerSlicing*.test.mjs`
- `tests/prusaslicerResultParser.test.mjs`
- `scripts/phase05-h-*.mjs`
- `scripts/phase05-h-*.sh`

Reports/changelog:

- `reports/phase05-*.md`
- `changelog/CHANGELOG.md`

## 5. Production Runtime Audit

- Production path: `/opt/make3d-platform`
- Production branch: `main`
- Production HEAD: `5566384c8f42778df834737b92d5886392acf093`
- Production recent commits include `5566384 feat: deploy phase03 worker api`, `7ef6616`, `24a4f49`, `343baa3`.
- Production git status contains untracked `.env.production.bak.*`, `backups/`, and `public/MP_verify_IYmXrtGcQEZ8dsuF.txt`.
- Docker: `make3d-platform` running, image `make3d-platform-make3d`, up approximately 34 hours.
- Docker version: `29.5.2`
- Compose version: `v5.1.4`
- Nginx: active, running since 2026-06-23 06:55:15 CST.
- Disk: `/` 40G total, 32G used, 5.9G available, 85% used.
- Memory: 1.6Gi total, 657Mi available, 4.0Gi swap with 159Mi used.
- Uptime: 33 days.

## 6. Production SQLite Audit

- Container DB URL path: `/app/data/make3d.db`
- Host DB path from compose volume: `/opt/make3d-platform/data/make3d.db`
- Host DB size: `380928` bytes.
- Host DB owner: `root:root`
- Host DB mode: `644`
- Host DB mtime: 2026-07-15 23:57 CST.
- Live DB `PRAGMA integrity_check`: `ok`
- Live DB `PRAGMA foreign_key_check`: `0`

Production table counts checked without customer data:

- `customers`: 4
- `orders`: 10
- `files`: 12
- `local_file_sync_jobs`: 1
- `slicing_jobs`: missing
- `slicing_job_attempts`: missing
- `order_payments`: 8
- `wechat_refunds`: 3
- `wechat_notifications`: 8
- `payment_settings.wechat_enabled`: `0`

## 7. Production DB Backup

- Backup path: `/opt/make3d-platform/backups/make3d.db.phase05-i-audit.20260715-235824.bak`
- Backup method: file copy because host `sqlite3` CLI was not present.
- Backup mode: `600`
- Backup size: `380928` bytes.
- Backup `PRAGMA integrity_check`: `ok`
- Backup `PRAGMA foreign_key_check`: `0`

## 8. DB Compatibility and Migration Rehearsal

Production currently does not have `slicing_jobs` or `slicing_job_attempts`, so Phase05-E schema would create these tables on startup/schema init.

Candidate local synthetic schema rehearsal:

- Initialized a local temporary SQLite database twice through candidate `initDatabase`.
- Rehearsal `PRAGMA integrity_check`: `ok`
- `slicing_jobs` table created.
- `slicing_job_attempts` table created.
- `idx_slicing_jobs_file_sync_unique`: absent.
- `idx_slicing_jobs_file_sync`: present as ordinary index.
- `idx_slicing_jobs_active_identity_unique`: present as partial unique index on active statuses.
- `idx_slicing_jobs_active_lock_owner`: present as partial unique index on active lock owners.
- Foreign keys use `ON DELETE RESTRICT` for slicing audit rows.

Full production-copy migration rehearsal with candidate code was not executed because the candidate code is not present on production as a clean commit, and uploading or deploying candidate code during this audit was forbidden.

## 9. Final Slicing Schema Summary

New audit tables:

- `slicing_jobs`
- `slicing_job_attempts`

Important constraints:

- `file_id` -> `files(id)` uses `ON DELETE RESTRICT`.
- `file_sync_job_id` -> `local_file_sync_jobs(id)` uses `ON DELETE RESTRICT`.
- `source_slicing_job_id` -> `slicing_jobs(id)` uses `ON DELETE RESTRICT`.
- Status CHECK constraints cover active, terminal, failed, and cache states.
- Unix millisecond timing fields reject negative values.
- Metrics cache rows require terminal completed/partial status and cache reuse timestamp.

Important indexes:

- `idx_slicing_jobs_pickup`
- `idx_slicing_jobs_file`
- `idx_slicing_jobs_file_sync`
- `idx_slicing_jobs_active_identity_unique`
- `idx_slicing_jobs_active_lock_owner`
- `idx_slicing_jobs_order_snapshot`
- `idx_slicing_jobs_worker`
- `idx_slicing_jobs_slice_cache`
- `idx_slicing_jobs_parse_cache`
- `idx_slicing_jobs_reusable_metrics`
- `idx_slicing_job_attempts_job`
- `idx_slicing_job_attempts_worker`

Active duplicate prevention:

- Partial unique identity applies only when status is `pending`, `locked`, `slicing`, `sliced`, or `parsing`.
- Terminal statuses `completed`, `partial`, `failed`, and `cancelled` can be followed by new identical audit rows.

## 10. Environment Audit

Only presence/non-empty status was checked. No secret values or token hashes were output.

- `DATABASE_URL`: present, non-empty.
- `MAKE3D_WORKER_TOKEN`: present, non-empty.
- `WECHAT_PAY_ENABLED`: present, non-empty.
- `WECHAT_PAY_TEST_ONLY`: present, non-empty.
- `WECHAT_PAY_TEST_CUSTOMER_IDS`: present, non-empty.
- `WECHAT_PAY_JSAPI_AUTH_READY`: present, non-empty.
- `WECHAT_PAY_MCH_ID`: present, non-empty.
- `SMTP_HOST`: present, non-empty.
- `REDIS_URL`: absent.
- `MAKE3D_WORKER_INTEGRATION_TEST_MODE`: absent.
- `WECHAT_PAY_APPID` and `WECHAT_PAY_API_V3_KEY` by those exact names were absent; WeChat Pay key material is mounted as Docker secrets and was not read.

WeChat payment isolation remains:

- `payment_settings.wechat_enabled=0`
- No WeChat payment certificate, key, APIv3 key, or production env value was modified.

## 11. Integration Test Mode Isolation

Production does not set `MAKE3D_WORKER_INTEGRATION_TEST_MODE=1`.

Candidate Worker permits custom slicer binaries, custom parser delay, and local request logging only when integration test mode is enabled and the API URL is local (`127.0.0.1` or `localhost`). Production does not satisfy those conditions.

## 12. Lease and Heartbeat Contract

Server-side Worker Slicing lease:

- `WORKER_SLICING_LEASE_DURATION_MS = 120000`
- Initial lock sets both lease and lock expiry from the same frozen rule.
- Lease renewal uses the same frozen duration and does not shorten an existing lease.

Local Worker heartbeat:

- Default heartbeat interval: 30 seconds.
- Local lease safety margin: 2000 ms.
- Maximum accepted server TTL: 10 minutes.
- H-C long parser rapid heartbeat behavior was local test acceleration, not a production default.

## 13. Worker Execution Safety

Confirmed in candidate code/tests:

- Default PrusaSlicer path is `/usr/bin/prusa-slicer`.
- Custom slicer binary is rejected outside local integration test mode.
- `spawn` uses argument arrays and `shell: false`.
- Profile whitelist currently maps `bambu-p1s` to `/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini`.
- Profile SHA is verified before slicing.
- Input path and artifact paths are constrained under `/srv/make3d-worker`.
- Attempt paths use `attempt-<attempt_no>` directories.
- G-code/stdout/stderr are first written as `.part`, then atomically renamed.
- Processing/results same-filesystem check exists.
- G-code size and SHA are verified before reporting sliced/result.
- Resume only uses verified historical same-job same-artifact-worker attempt paths.
- Lease loss stops publishing/reporting and attempts process group cleanup.

## 14. Resource Limit Findings

Implemented:

- Single one-shot Worker process behavior; no production slicing systemd service exists.
- Parser max G-code read size: 256MiB.
- Parser tail windows and max comment line limits exist.
- Process group SIGTERM/SIGKILL cleanup exists on lease loss/shutdown.

Missing or incomplete before enabling production slicing Worker:

- No explicit PrusaSlicer process timeout is enforced around the main slicer spawn.
- No explicit stdout/stderr log file size cap is enforced during slicer execution.
- No explicit local disk-free minimum is enforced before slicing.
- No explicit G-code maximum is enforced before SHA/publish; parser later rejects files above its max size.
- No explicit CPU or memory cgroup/systemd resource limit exists because no slicing systemd service has been created.

Classification: these are blockers before starting a production slicing Worker/service or creating real production slicing tasks. They are not blockers for a cloud API-only deployment that creates no slicing jobs and has no running slicing Worker.

## 15. Log Security Audit

Candidate code includes sanitizers for Bearer tokens, token/secret/key query text, phone numbers, email addresses, and path-like details. API tests include console secret leakage checks. The Worker strips token from CLI JSON output.

No intentional logging of APIv3 keys, merchant private keys, full Authorization headers, customer phone/email, OpenID, payment data, or full request payloads was found in the Worker Slicing API/Worker path.

Remaining caution:

- Lock owners are returned to authenticated Workers as part of the protocol.
- stdout/stderr are stored as artifact files; they are not printed by default, but size caps should be added before production Worker enablement.

## 16. API and Nginx Audit

Production Nginx:

- Reverse proxies to `http://127.0.0.1:3000`.
- No explicit `proxy_set_header Authorization` stripping was observed in the filtered config.
- `client_max_body_size 60M` is present.

Candidate API:

- `/api/worker/slicing/jobs/pending`
- `/api/worker/slicing/jobs/:id/lock`
- `/api/worker/slicing/jobs/:id/lease`
- `/api/worker/slicing/jobs/:id/slicing`
- `/api/worker/slicing/jobs/:id/sliced`
- `/api/worker/slicing/jobs/:id/parsing`
- `/api/worker/slicing/jobs/:id/result`
- `/api/worker/slicing/jobs/:id/failed`

API behavior:

- Bearer token authentication only.
- No customer/admin session substitute.
- `Cache-Control: no-store`.
- Body size/content-type validation covered by tests.
- Worker API is short-request oriented; no long HTTP streaming is required.

## 17. Build Compatibility

Local:

- Node: `v22.22.3`
- npm: `10.9.8`
- SQLite in Node: `3.51.3`

Production container:

- Node: `v22.23.1`
- npm: `10.9.8`
- SQLite in Node: `3.51.3`

Build output:

- Next.js `15.5.18`
- Worker Slicing routes appeared in the build route list.

## 18. WSL Worker Host Pre-Deploy Audit

WSL:

- Ubuntu `24.04`
- systemd: running
- Existing file sync Worker: active, MainPID `2682`
- No slicing systemd service was found.

PrusaSlicer:

- Binary: `/usr/bin/prusa-slicer`
- Package: `prusa-slicer 2.7.2+dfsg-1build2`
- Help banner: `PrusaSlicer-2.7.2+UNKNOWN based on Slic3r`
- Dynamic dependency check: no `not found` lines.

Worker filesystem:

- `/srv/make3d-worker`: `make3d-worker:make3d-worker`, mode `751`, device `2096`
- `/srv/make3d-worker/processing`: `make3d-worker:make3d-worker`, mode `750`, device `2096`
- `/srv/make3d-worker/files`: `make3d-worker:make3d-worker`, mode `750`, device `2096`
- `/srv/make3d-worker/config/prusaslicer`: `make3d-worker:make3d-worker`, mode `751`, device `2096`
- `/srv/make3d-worker/processing/prusaslicer`: `make3d-worker:make3d-worker`, mode `750`, device `2096`
- `/srv/make3d-worker/results/prusaslicer`: missing.
- Profile SHA: `/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini` = `4437bf3e44534004aa51db7c6de16c13c130f62de3cd3b14d52194a7eb4f6e0f`
- Disk for `/srv/make3d-worker`: 1007G total, 950G available.

Before enabling a production slicing Worker, create/verify `/srv/make3d-worker/results/prusaslicer` and confirm it shares the same filesystem device as processing.

## 19. Deployment Boundary

Candidate Worker Slicing helper creation functions are referenced by tests and local Phase05 scripts, not by customer quote/order/payment flows.

Deploying only the cloud API/schema without creating `slicing_jobs` and without starting a slicing Worker should not automatically slice files, change quotes, change order status, or touch payments.

Existing legacy/admin `/api/admin/orders/[id]/slice-test` remains outside the new Worker Slicing path and was not modified in this audit.

## 20. Test Results

Targeted regression:

- `node --test tests/workerSlicingClient.test.mjs tests/workerSlicingApi.test.mjs tests/workerSlicingJobs.test.mjs tests/prusaslicerResultParser.test.mjs tests/workerLocalSync.test.mjs tests/workerApi.test.mjs`
- Result: 119/119 passed.

Full regression:

- `npm test`
- Result: 336/336 passed.

Lint/build:

- `npm run lint`: passed.
- `npm run build`: passed.

## 21. Production Impact Assessment

Expected impact if only cloud API/schema is deployed:

- Creates missing `slicing_jobs` and `slicing_job_attempts` tables/indexes on schema init.
- Adds authenticated Worker Slicing API routes.
- Does not create slicing jobs automatically.
- Does not run PrusaSlicer.
- Does not start a slicing Worker.
- Does not change order, quote, payment, refund, WeChat Pay, upload limit, or public customer payment entry behavior.

Risks:

- Schema init runs at app startup; even idempotent DDL should be rehearsed from a production backup once the candidate exists as a clean deployable commit.
- Production disk is 85% used, leaving limited margin for future G-code artifacts on the server if any server-side artifacts are introduced.
- Worker runtime resource limits must be hardened before production Worker enablement.

## 22. Stop Conditions

Do not proceed to direct Phase05-J deployment until:

- Candidate branch is rebased/merged onto production HEAD `5566384`.
- Phase05 files are committed and the working tree is clean except approved local-only artifacts.
- Deployment target commit is recorded.
- Production-copy migration rehearsal is run against the exact target commit.
- `/srv/make3d-worker/results/prusaslicer` is created and same-filesystem checked before Worker enablement.
- PrusaSlicer timeout, stdout/stderr size cap, disk-free guard, and service resource limits are designed before starting a production slicing Worker.

## 23. Recommended Staged Deployment Plan

Stage 0: prepare deployable candidate

- Rebase/merge local work onto production `main`.
- Commit Phase05 reports, schema, API, Worker, tests, and changelog.
- Push target commit.
- Re-run local tests/lint/build.

Stage 1: production cloud API/schema only

- Backup DB.
- Record pre-deploy commit.
- Pull exact target commit.
- Build/start app container.
- Verify DB integrity and schema.
- Verify `/api/worker/slicing/jobs/pending` returns JSON with wrong token 401 and correct token 200.
- Do not create slicing jobs.
- Do not start slicing Worker.

Stage 2: production read-only smoke

- Confirm no slicing jobs exist unless intentionally seeded later.
- Confirm orders/quotes/payments unchanged.
- Confirm WeChat TEST_ONLY and `payment_settings.wechat_enabled=0`.

Stage 3: Worker preparation only

- Create results directory and resource-limited slicing service design.
- Add missing resource guards before service start.

Stage 4: future controlled TEST slicing

- Only after explicit approval, create one TEST slicing job from a TEST synced file.
- Run one-shot Worker and verify result.
- Do not connect result to automatic quote until a later approved phase.

## 24. Rollback Plan Design

Cloud API/schema deployment rollback:

- Stop app changes by redeploying previous production commit `5566384`.
- Keep newly created `slicing_jobs` and `slicing_job_attempts` tables unless an explicit DB rollback is approved.
- If a DB restore is required, restore from the deployment-time backup after confirming no newer required production writes must be preserved.
- Verify `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, Docker status, Nginx status, customer order access, and WeChat TEST_ONLY payment visibility.

Worker rollback:

- Do not start slicing Worker in Phase05-J unless separately approved.
- If a future Worker is started and must be rolled back, stop/disable only the slicing Worker service; do not stop existing `make3d-file-sync-worker.service`.

## 25. Acceptance Checklist for Future Phase05-J

- Clean target commit exists and is based on production HEAD.
- Production DB backup path recorded.
- Pre/post deploy commits recorded.
- DB integrity and foreign key checks pass.
- `slicing_jobs` and `slicing_job_attempts` exist with expected indexes.
- Wrong Worker token returns 401.
- Correct Worker token returns 200 JSON.
- No jobs created automatically.
- No production slicing Worker running.
- Existing file sync Worker remains active.
- `WECHAT_PAY_ENABLED=true`, `WECHAT_PAY_TEST_ONLY=true`, `WECHAT_PAY_TEST_CUSTOMER_IDS=5` confirmed by presence/non-empty and application behavior.
- `payment_settings.wechat_enabled=0`.
- No sustained 500s or migration errors in logs.
- No secret values in logs.

## 26. Phase05-J Readiness Decision

Direct production deployment is not approved as-is.

Reason:

- Candidate is not a clean deployable commit and diverges from production HEAD.
- Production-copy migration rehearsal against the exact target commit was not possible under the audit-only boundary.
- Worker runtime resource guards are incomplete for production Worker/service enablement.
- WSL `results/prusaslicer` directory is missing.

Allowed next step:

- Prepare a clean Phase05-J deployment candidate and deployment plan.
- Do not deploy or start a slicing Worker until the blockers above are resolved and explicitly approved.
