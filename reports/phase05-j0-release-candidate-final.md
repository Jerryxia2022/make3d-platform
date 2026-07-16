# Phase05-J0 Release Candidate Final

Date: 2026-07-16

## 1. Objective

Phase05-J0 prepared a clean, reproducible, rollback-friendly release candidate for the Phase05 Worker Slicing cloud API, database schema, local Worker code, tests, scripts, reports, and deployment records.

No production deployment was performed. No SSH modification of production was performed. No Docker command that starts, stops, restarts, builds, or deploys production was run. No production database, production environment variable, Worker token, WeChat Pay setting, order, quote, payment, upload limit, or Slicing Worker service was modified.

## 2. Release Branch and Baseline

- Production baseline HEAD: `5566384c8f42778df834737b92d5886392acf093`
- RC branch: `codex/phase05-j0-rc`
- RC branch base: `5566384c8f42778df834737b92d5886392acf093`
- Previous mixed local branch: `feature/quote-page-redesign-sample`
- Safety snapshot: local stash `phase05-j0-prep-snapshot-before-rc` was created before branch preparation.

The Phase05-J0 branch was created directly from production Phase03 commit `5566384`, then Phase05 candidate files were restored and narrowed to the Worker/Slicing release scope. The earlier quote page redesign commit was intentionally not included.

Because Git commit hashes include the report contents themselves, the exact release commit hash is recorded after committing in the operator final response and by `git rev-parse HEAD`. This report is included in that release commit.

## 3. File Classification

Detailed file classification is in:

- `release-candidate-file-list.md`

Included release categories:

- database/schema: `src/backend/database.ts`, Worker slicing helpers, Worker auth/API helpers
- cloud Worker API: Phase03 file sync routes and Phase05 Worker Slicing routes
- local Worker code: `worker/`
- tests: Worker API, local sync, slicing API, slicing jobs, parser, lease/recovery/isolation tests
- scripts: Phase05 local integration and install validation scripts
- reports/changelog/deployment templates: `reports/`, `changelog/`, `deployment/`

Excluded local artifacts:

- `.vscode/`
- `design/mockups/`
- `docs/legal-source/`
- `docs/upgrade/`
- `libRich/`
- `logs/`
- `tmp-wechat-regression-order24.png`
- `public/MP_verify_IYmXrtGcQEZ8dsuF.txt`

## 4. Git State

Preparation changes were staged for a single release commit on `codex/phase05-j0-rc`.

Global project ignore rules were tightened to exclude:

- logs
- tmp
- database files
- backups
- key/certificate bundles

Local-only `.git/info/exclude` was used to hide unrelated local workspace artifacts without committing or deleting them.

Expected post-commit status:

- `git status`: clean
- production baseline retained in history as direct parent

## 5. Security and Exclusion Check

Staged filename scan found no `.env`, `.pem`, `.key`, `.p12`, `.pfx`, `.db`, `.sqlite`, `.bak`, `logs/`, `data/`, `uploads/`, or `secrets/` paths in the release commit.

Keyword scan found only placeholders, test tokens, test passwords, sanitized examples, and documentation references. No production token, APIv3 key, private key, payment certificate, production database, or env file was included.

## 6. Database Rehearsal

Live production database was not connected to or modified.

Local schema rehearsal using the Phase05-J0 candidate code:

- created temporary SQLite database `tmp-phase05-j0-schema-rehearsal.db`
- executed `initDatabase`
- executed `initDatabase` again to confirm idempotency
- removed the temporary database after the rehearsal

Result:

- `PRAGMA integrity_check`: `ok`
- `PRAGMA foreign_key_check`: `0`
- `slicing_jobs`: created
- `slicing_job_attempts`: created
- `idx_slicing_jobs_file_sync`: present
- `idx_slicing_jobs_active_identity_unique`: present
- `idx_slicing_jobs_active_lock_owner`: present
- `idx_slicing_job_attempts_job`: present
- `idx_slicing_job_attempts_worker`: present
- old bad `idx_slicing_jobs_file_sync_unique`: absent

Production-copy migration rehearsal was not executed in J0 because J0 explicitly forbids SSH modification of production and forbids deployment. Phase05-J1 must perform a production backup and rehearse against a copied database before starting the app container.

## 7. Test Results

Runtime:

- Node: `v22.22.3`
- npm: `10.9.8`
- Next.js build output: `15.5.18`

Commands:

- `npm test`: passed, `335/335`
- `npm run lint`: passed
- `npm run build`: passed

The test count is intentionally `335`, not the prior `336`, because the quote page redesign sample test from the previous mixed local branch is not part of this Phase05 release candidate.

## 8. Worker Host Pre-Deploy Check

Read-only WSL check:

- PrusaSlicer path: `/usr/bin/prusa-slicer`
- Package version: `prusa-slicer 2.7.2+dfsg-1build2`
- Help banner: `PrusaSlicer-2.7.2+UNKNOWN based on Slic3r`
- Profile SHA: `/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini` = `4437bf3e44534004aa51db7c6de16c13c130f62de3cd3b14d52194a7eb4f6e0f`
- Existing file sync Worker: active, MainPID `2682`
- New slicing systemd service: not present
- `/srv/make3d-worker/results/prusaslicer`: missing

Before any Worker slicing execution in production, create and verify `/srv/make3d-worker/results/prusaslicer`, then confirm `processing/prusaslicer` and `results/prusaslicer` are on the same filesystem.

## 9. Resource Guard Review

Current implemented protections:

- one-shot Worker execution path
- argument-array `spawn` with `shell: false`
- fixed default PrusaSlicer binary
- profile whitelist and SHA verification
- path containment under Worker root
- attempt-isolated `.part` artifacts
- atomic rename after verification
- same-filesystem check in Worker code
- parser max file read size
- lease heartbeat and ownership fencing
- process-group cleanup on lease loss or shutdown

Still required before enabling a production Slicing Worker:

- explicit PrusaSlicer wall-clock timeout around the main slicing process
- stdout/stderr artifact size cap
- disk-free guard before slicing
- explicit G-code maximum before publish/result
- systemd CPU/memory/process limits for a future slicing service

Classification:

- not a blocker for Phase05-J1 cloud API/schema deployment with no jobs and no slicing Worker
- blocker before Phase05 Worker execution against production files or any slicing systemd service

## 10. Deployment Plan

Stage 1: cloud API/schema deployment only

- create production DB backup
- record pre-deploy commit
- pull exact Phase05-J0 release commit
- run production-copy migration rehearsal
- build/start app container
- verify DB integrity and schema
- verify Worker Slicing API auth:
  - no token: `401`
  - wrong token: `401`
  - correct token: `200` JSON with empty `jobs`
- do not create slicing jobs
- do not start Slicing Worker

Stage 2: read-only production verification

- home page, login, legal pages, order read, order submit regression
- WeChat Pay TEST_ONLY regression
- `payment_settings.wechat_enabled=0`
- no automatic `slicing_jobs`
- file sync Worker still active

Stage 3: TEST Worker one-shot

- only after explicit approval
- use TEST-only file/job
- run Worker manually with `--once`
- verify result state and artifacts
- do not create a slicing systemd service

Stage 4: future production Worker service

- only after resource guards and directory checks are complete
- create dedicated slicing systemd design/report
- deploy as a separate approved phase

## 11. Rollback Plan

Cloud/API rollback:

- redeploy previous production commit `5566384`
- preserve additive `slicing_jobs` and `slicing_job_attempts` tables unless a separately approved DB restore is required
- if restore is required, restore from the deployment-time backup after confirming no newer production writes must be retained
- verify integrity, Docker, Nginx, customer order access, file sync Worker, and WeChat TEST_ONLY behavior

Worker rollback:

- no slicing service is created in J0 or J1
- future Worker rollback should stop/disable only the slicing service, never the existing file sync Worker

## 12. Blockers and Risks

Resolved in J0:

- candidate is now based on production HEAD `5566384`
- unrelated quote page redesign is excluded
- Phase05 files are staged for a single release commit
- logs and local artifacts are excluded
- tests/lint/build pass
- schema idempotency rehearsal passes locally

Still blocking Worker execution:

- `/srv/make3d-worker/results/prusaslicer` is missing
- PrusaSlicer timeout/stdout/stderr/disk/systemd resource guards are not yet implemented

Still required in Phase05-J1 before app start:

- production DB backup
- production-copy migration rehearsal against the exact release commit
- production env presence check without outputting secrets

## 13. Production Impact

J0 production impact: none.

This phase did not deploy production, modify production database, modify production files, restart services, change environment variables, change tokens, change payment settings, or start any Worker.

## 14. Phase05-J1 Decision

Allowed next phase:

- Phase05-J1 cloud API/schema staged deployment only.

Not allowed yet:

- starting a production Slicing Worker
- creating production slicing jobs
- running PrusaSlicer against production customer files
- creating slicing systemd service

Phase05-J1 must stop before Worker execution unless the remaining Worker resource/directory blockers are resolved in a separately approved phase.
