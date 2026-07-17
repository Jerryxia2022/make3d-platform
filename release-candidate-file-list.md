# Phase05-J-A Release Candidate File List

Date: 2026-07-16

## Production Baseline

- Production HEAD: `5566384c8f42778df834737b92d5886392acf093`
- Candidate branch base: `5566384c8f42778df834737b92d5886392acf093`
- Candidate branch: `phase05-worker-slicing-candidate`
- Candidate code commit before J-A report closeout: `9a5377e114bb7ac46fdea0c2e007d4fdf2c097d2`
- Previous preparation branch: `codex/phase05-j0-rc`

## Must Enter Phase05-J-A Release Candidate

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

---

# Phase05-L3-RC Release Candidate Addendum

Date: 2026-07-17

## Baseline

- Baseline HEAD: `052ab1aa28676087f246b2d4659048868cdb5147`
- Branch: `phase05-worker-slicing-candidate`
- Release commit message: `Phase05-L approval candidate schema helpers`
- Production deploy: not included
- Live production migration: not included

## Included Candidate Files

Backend schema and helpers:

- `src/backend/productionCandidateTypes.ts`
- `src/backend/productionCandidateCanonicalJson.ts`
- `src/backend/productionCandidateSchema.ts`
- `src/backend/productionCandidateHelpers.ts`

Scripts:

- `scripts/phase05-l2-local-schema-helper-integration.mjs`
- `scripts/phase05-l3-readonly-migration-rehearsal.mjs`
- `scripts/phase05-l4-apply-approval-candidate-schema.mjs`

Tests:

- `tests/productionCandidateTestUtils.mjs`
- `tests/productionCandidateSchema.test.mjs`
- `tests/productionCandidateCanonicalJson.test.mjs`
- `tests/productionCandidateApprovalHelpers.test.mjs`
- `tests/productionCandidateHelpers.test.mjs`
- `tests/productionCandidateMigration.test.mjs`
- `tests/productionCandidateMigrationScript.test.mjs`

Reports and changelog:

- `reports/phase05-l1-approval-candidate-schema-freeze-final.md`
- `reports/phase05-l2-local-schema-helper-implementation-final.md`
- `reports/phase05-l3-production-readonly-migration-rehearsal-final.md`
- `changelog/CHANGELOG.md`

## Excluded Files and Artifacts

- `.env`, `.env.local`, `.env.production`, and all environment files
- `/etc/make3d-worker.env` content
- Worker Token, Authorization values, OpenID values, phone numbers, email addresses, payment identifiers, private keys, certificates, and APIv3 key material
- `make3d.db`, `*.db`, `*.sqlite`, `*.bak`, and database backups
- G-code, STL, STEP/STP, uploaded customer models, and slicing output artifacts
- `node_modules`, temporary directories, local test databases, and `/tmp` artifacts
- Production deployment commands, production schema execution results, and any live production database writes

## Safety Boundaries

- No Worker start.
- No PrusaSlicer run.
- No real approval creation.
- No real production candidate creation.
- No `slicing_job` creation.
- No order, quote, payment, refund, WeChat Pay, upload, file, or customer-status modification.
