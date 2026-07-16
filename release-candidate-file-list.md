# Phase05-J0 Release Candidate File List

Date: 2026-07-16

## Production Baseline

- Production HEAD: `5566384c8f42778df834737b92d5886392acf093`
- RC branch base: `5566384c8f42778df834737b92d5886392acf093`
- RC branch: `codex/phase05-j0-rc`

## Must Enter Phase05-J0 Release Commit

Database/schema:

- `.gitignore`
- `package.json`
- `src/backend/database.ts`
- `src/backend/workerSlicingJobs.ts`
- `src/backend/workerSlicingApi.ts`
- `src/backend/workerSlicingAuth.ts`
- `src/backend/workerFileSync.ts`

Cloud Worker API:

- `src/app/api/worker/jobs/[id]/download/route.ts`
- `src/app/api/worker/jobs/[id]/failed/route.ts`
- `src/app/api/worker/jobs/[id]/lock/route.ts`
- `src/app/api/worker/jobs/[id]/verified/route.ts`
- `src/app/api/worker/jobs/pending/route.ts`
- `src/app/api/worker/slicing/jobs/pending/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/lock/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/lease/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/slicing/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/sliced/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/parsing/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/result/route.ts`
- `src/app/api/worker/slicing/jobs/[id]/failed/route.ts`

Local Worker and parser:

- `worker/install-worker.sh`
- `worker/make3d-file-sync-worker.mjs`
- `worker/make3d-slicing-worker.mjs`
- `worker/make3d-worker.env.example`
- `worker/prusaslicer-result-parser.mjs`
- `worker/systemd/make3d-file-sync-worker.service`

Tests:

- `tests/fixtures/prusaslicer/README.md`
- `tests/prusaslicerResultParser.test.mjs`
- `tests/workerApi.test.mjs`
- `tests/workerLocalSync.test.mjs`
- `tests/workerSlicingApi.test.mjs`
- `tests/workerSlicingAttemptIsolation.test.mjs`
- `tests/workerSlicingClient.test.mjs`
- `tests/workerSlicingJobs.test.mjs`
- `tests/workerSlicingLeaseFencing.test.mjs`
- `tests/workerSlicingRecovery.test.mjs`

Scripts:

- `scripts/create-phase-report.mjs`
- `scripts/phase05-install-prusaslicer.sh`
- `scripts/phase05-h-a-local-integration.sh`
- `scripts/phase05-h-a-seed.mjs`
- `scripts/phase05-h-a-verify.mjs`
- `scripts/phase05-h-b-fault-inject.mjs`
- `scripts/phase05-h-b-integration-driver.mjs`
- `scripts/phase05-h-b-local-recovery-integration.sh`
- `scripts/phase05-h-c-attempt-isolation-driver.mjs`
- `scripts/phase05-h-c-attempt-isolation-integration.sh`
- `scripts/phase05-h-c-final-lease-process-fencing-driver.mjs`
- `scripts/phase05-h-c-final-lease-process-fencing-integration.sh`

Reports and release records:

- `release-candidate-file-list.md`
- `changelog/CHANGELOG.md`
- `changelog/README.md`
- `deployment/README.md`
- `deployment/deployment-report-template.md`
- `reports/README.md`
- `reports/phase-report-template.md`
- `reports/phase-final-template.md`
- `reports/phase03-final.md`
- `reports/phase03-worker-api-design.md`
- `reports/phase03-production-deploy.md`
- `reports/phase04-*.md`
- `reports/phase05-*.md`

## Development Auxiliary Files

These remain local and are excluded from the release commit:

- `logs/`
- `.vscode/`
- `design/mockups/`
- `docs/legal-source/`
- `docs/upgrade/`
- `libRich/`
- `tmp-wechat-regression-order24.png`

## Must Be Excluded

The release candidate must not include:

- `.env`
- `.env.local`
- `.env.production`
- `.env.*.local`
- Worker tokens
- WeChat Pay APIv3 keys
- private keys
- certificates
- production SQLite databases
- database backups
- temporary test databases
- raw runtime logs

## Security Scan Notes

Keyword scan found only placeholders, test tokens, test passwords, sanitized examples, and documentation references in the candidate files. No production token, APIv3 key, private key, payment certificate, production database, or `.env` file is included in the release candidate.
