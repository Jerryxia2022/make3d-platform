# Phase05-D Slicing Jobs Database And Worker State Design

Date: 2026-07-14
Last updated: 2026-07-15
Status: final schema frozen, not implemented

## Scope

Phase05-D designs the database model and Worker state model for future PrusaSlicer slicing jobs.

This phase does not:

- create a database migration
- modify production database data
- modify order amounts
- modify quote logic
- modify payment or WeChat Pay
- modify upload limits
- deploy production automatic slicing
- use real customer files
- automatically generate customer G-code
- implement Worker code
- implement Worker API routes

Revision note:

```text
The Phase05-D design was reviewed and revised before Phase05-E.
The Revision sections in this report supersede earlier unified cache-key, lock-owner, cancellation, and quote_ready wording.
The Final Schema Freeze section supersedes earlier timestamp, Worker ownership, version, result-origin, and transaction-boundary wording.
```

## 1. Existing Implementation Reviewed

Read:

```text
reports/phase05-c-slicing-result-parsing-design.md
reports/phase05-c-parser-implementation-final.md
worker/prusaslicer-result-parser.mjs
worker/make3d-file-sync-worker.mjs
src/backend/workerFileSync.ts
src/backend/database.ts
```

Confirmed:

```text
Phase04 Worker sync operational chain:
pending -> locked -> verified
```

Important meaning:

```text
local_file_sync_jobs.sync_status = verified
means only that the local file exists and its SHA-256 was verified after sync.
```

Current `local_file_sync_jobs` table also permits:

```text
pending
locked
downloaded
verified
local_synced
failed
```

Those statuses must not be reused to represent slicing progress.

Existing `slice_jobs` table exists, but it is not suitable for the Phase05-D target because it:

- uses legacy statuses: `queued`, `processing`, `success`, `failed`
- stores price fields such as `material_fee`, `time_fee`, and `estimated_price`
- stores floating-point material metrics
- has `ON DELETE CASCADE` foreign keys
- belongs to earlier quote/slicer test behavior, not the new Worker audit model

Recommendation:

```text
Create a new future table named slicing_jobs.
Do not reuse or silently mutate legacy slice_jobs for this Worker slicing audit model.
```

## 2. Table Design

Future table:

```text
slicing_jobs
```

Design SQL, not executed in this phase:

```sql
CREATE TABLE IF NOT EXISTS slicing_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  file_id INTEGER NOT NULL,
  file_sync_job_id INTEGER NOT NULL,
  source_slicing_job_id INTEGER,

  customer_id_snapshot INTEGER,
  order_id_snapshot INTEGER,
  order_no_snapshot TEXT,

  worker_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  lock_owner TEXT,
  locked_at DATETIME,
  lock_expires_at DATETIME,
  lease_expires_at DATETIME,
  lease_renewed_at DATETIME,
  started_at DATETIME,
  finished_at DATETIME,
  failed_at DATETIME,

  slicer_name TEXT NOT NULL DEFAULT 'PrusaSlicer',
  slicer_package_version TEXT,
  slicer_banner_version TEXT,
  binary_path TEXT,
  profile_key TEXT NOT NULL,
  profile_name TEXT,
  profile_version TEXT,
  profile_path TEXT,
  profile_sha256 TEXT NOT NULL,
  slice_params_json TEXT NOT NULL,
  slice_params_sha256 TEXT NOT NULL,
  slice_cache_key_sha256 TEXT NOT NULL,
  parse_cache_key_sha256 TEXT,

  input_filename TEXT NOT NULL,
  input_relative_path TEXT NOT NULL,
  input_size_bytes INTEGER NOT NULL,
  input_sha256 TEXT NOT NULL,

  slice_duration_ms INTEGER,
  exit_code INTEGER,
  stdout_relative_path TEXT,
  stderr_relative_path TEXT,
  gcode_relative_path TEXT,
  gcode_size_bytes INTEGER,
  gcode_sha256 TEXT,

  parser_version TEXT,
  parse_status TEXT,
  metrics_status TEXT,
  parser_quote_ready INTEGER NOT NULL DEFAULT 0,

  print_time_seconds INTEGER,
  silent_print_time_seconds INTEGER,
  filament_length_microns INTEGER,
  filament_volume_mm3 INTEGER,
  filament_weight_mg INTEGER,
  layer_count INTEGER,
  max_layer_z_microns INTEGER,
  filament_type TEXT,
  printer_model TEXT,
  nozzle_diameter_microns INTEGER,
  layer_height_microns INTEGER,

  metric_sources_json TEXT,
  metric_validation_json TEXT,
  missing_fields_json TEXT,
  warnings_json TEXT,

  weight_source TEXT,
  weight_policy_version TEXT,
  derived_weight_mg INTEGER,

  retention_status TEXT NOT NULL DEFAULT 'active',
  retention_until DATETIME,
  deleted_at DATETIME,

  last_error_code TEXT,
  last_error TEXT,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
  FOREIGN KEY (file_sync_job_id) REFERENCES local_file_sync_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_slicing_job_id) REFERENCES slicing_jobs(id) ON DELETE RESTRICT,

  CHECK (status IN (
    'pending',
    'locked',
    'slicing',
    'sliced',
    'parsing',
    'completed',
    'partial',
    'failed',
    'cancelled'
  )),
  CHECK (attempt_count >= 0),
  CHECK (max_attempts >= 1),
  CHECK (parser_quote_ready IN (0, 1)),
  CHECK (input_size_bytes > 0),
  CHECK (slice_duration_ms IS NULL OR slice_duration_ms >= 0),
  CHECK (gcode_size_bytes IS NULL OR gcode_size_bytes > 0),
  CHECK (print_time_seconds IS NULL OR print_time_seconds >= 0),
  CHECK (silent_print_time_seconds IS NULL OR silent_print_time_seconds >= 0),
  CHECK (filament_length_microns IS NULL OR filament_length_microns >= 0),
  CHECK (filament_volume_mm3 IS NULL OR filament_volume_mm3 >= 0),
  CHECK (filament_weight_mg IS NULL OR filament_weight_mg >= 0),
  CHECK (layer_count IS NULL OR layer_count >= 0),
  CHECK (max_layer_z_microns IS NULL OR max_layer_z_microns >= 0),
  CHECK (retention_status IN ('active', 'retain_until', 'legal_hold', 'deleted')),
  CHECK (metrics_status IS NULL OR metrics_status IN ('valid', 'warning', 'invalid')),
  CHECK (parse_status IS NULL OR parse_status IN ('parsed', 'partial', 'failed'))
);
```

Do not add a unique constraint on `file_id`.

The same `file_id` must be allowed to have separate slicing rows for different:

- material
- printer profile
- layer height
- infill
- support mode
- brim setting
- PrusaSlicer version
- parser version

## 3. Field Definitions

Identity and lineage:

```text
id: primary key.
file_id: source uploaded file id. RESTRICT delete.
file_sync_job_id: verified local sync job used as input. RESTRICT delete.
source_slicing_job_id: when a cache result is reused, points to the original slicing job.
customer_id_snapshot: copied value for audit; not a permission source.
order_id_snapshot: copied value for audit; not used to change order status.
order_no_snapshot: copied order number for diagnostics and directory naming.
```

State and locking:

```text
worker_id: Worker id that last handled the job.
status: slicing lifecycle status.
attempt_count: number of lock/slice attempts.
max_attempts: retry ceiling.
lock_owner: per-attempt random lock token. Must be UUID or at least 128-bit secure random value. Do not use worker_id as lock_owner.
locked_at: lock acquisition time.
lock_expires_at: time after which another Worker may reclaim the job.
lease_expires_at: active lease expiry while the Worker is slicing/parsing.
lease_renewed_at: last successful lease renewal time.
started_at: actual slicing start time.
finished_at: terminal success/partial completion time.
failed_at: terminal failure time.
```

Slicer and profile:

```text
slicer_name: usually PrusaSlicer.
slicer_package_version: Ubuntu package version, for example 2.7.2+dfsg-1build2.
slicer_banner_version: banner parsed from CLI/help/G-code.
binary_path: execution audit snapshot only. Server must not use this as an instruction to Worker.
profile_key: server-approved profile identifier that Worker resolves through its local whitelist.
profile_name: human profile label, for example bambu-p1s.
profile_version: Make3D profile version.
profile_path: execution audit snapshot only. Server must not send arbitrary absolute profile paths to Worker.
profile_sha256: SHA-256 of the actual profile content.
slice_params_json: canonical JSON of CLI/material/process parameters.
slice_params_sha256: SHA-256 of canonical slice params.
slice_cache_key_sha256: SHA-256 over input/profile/params/slicer identity.
parse_cache_key_sha256: SHA-256 over generated G-code and parser version.
```

Input and output:

```text
input_filename: safe display/source filename.
input_relative_path: path under /srv/make3d-worker/files.
input_size_bytes: input file size.
input_sha256: verified local input SHA-256.
slice_duration_ms: PrusaSlicer process duration.
exit_code: PrusaSlicer exit code.
stdout_relative_path: Worker relative stdout log path.
stderr_relative_path: Worker relative stderr log path.
gcode_relative_path: Worker relative G-code output path.
gcode_size_bytes: generated G-code size.
gcode_sha256: generated G-code SHA-256.
```

Parser metrics:

```text
parser_version: Phase05-C parser version.
parse_status: parser status, separate from job status.
metrics_status: valid, warning, or invalid.
parser_quote_ready: parser validation result only; not an instruction to quote.
metric_sources_json: source of each parsed metric.
metric_validation_json: validation object from parser.
missing_fields_json: parser missing fields.
warnings_json: parser warnings.
```

Weight policy placeholders:

```text
weight_source: explicit_source, derived_policy, missing, or reserved future value.
weight_policy_version: future Material Metrics Policy version.
derived_weight_mg: reserved future derived value.
```

Current rule:

```text
Do not calculate material weight in the database layer.
Do not derive filament_weight_mg from filament_volume_mm3 in Phase05-D.
```

Retention:

```text
retention_status: active, retain_until, legal_hold, or deleted.
retention_until: date after which cleanup can be considered.
deleted_at: set only when output artifacts are actually removed in a future approved cleanup phase.
```

## 4. Index Design

Design SQL, not executed:

```sql
CREATE INDEX IF NOT EXISTS idx_slicing_jobs_pickup
ON slicing_jobs(status, lock_expires_at, attempt_count, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_file
ON slicing_jobs(file_id, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_file_sync
ON slicing_jobs(file_sync_job_id, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_order_snapshot
ON slicing_jobs(order_id_snapshot, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_worker
ON slicing_jobs(worker_id, status, locked_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_cache_lookup
ON slicing_jobs(slice_cache_key_sha256, parse_cache_key_sha256, status, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_parse_cache_lookup
ON slicing_jobs(parse_cache_key_sha256, parser_version, status, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_retention
ON slicing_jobs(retention_status, retention_until);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slicing_jobs_active_lock_owner
ON slicing_jobs(lock_owner)
WHERE lock_owner IS NOT NULL
  AND status IN ('locked', 'slicing', 'sliced', 'parsing');
```

Optional cache reuse index:

```sql
CREATE INDEX IF NOT EXISTS idx_slicing_jobs_reusable_cache
ON slicing_jobs(slice_cache_key_sha256, status, parser_quote_ready, created_at)
WHERE status IN ('completed', 'partial');
```

Do not make `slice_cache_key_sha256` or `parse_cache_key_sha256` globally unique.

Reason:

```text
Cache reuse should create a new audit row with source_slicing_job_id.
Historical source rows must not be overwritten.
```

## 5. State Machine

Statuses:

```text
pending: waiting for Worker pickup.
locked: atomically claimed by one Worker.
slicing: PrusaSlicer process is running.
sliced: G-code was generated and output file SHA/size were captured.
parsing: parser is reading G-code and producing metrics.
completed: slicing and parsing succeeded, metrics_status is valid.
partial: G-code is valid but metrics are incomplete or warnings exist.
failed: slicing or parsing failed.
cancelled: manually cancelled before processing.
```

Allowed main path:

```text
pending -> locked -> slicing -> sliced -> parsing -> completed
```

Allowed partial path:

```text
parsing -> partial
```

Allowed failure path:

```text
pending -> failed
locked -> failed
slicing -> failed
sliced -> failed
parsing -> failed
```

Allowed cancellation path:

```text
pending -> cancelled
```

First version cancellation rule:

```text
Only pending -> cancelled is allowed.
Do not allow locked -> cancelled in the first version to avoid races while the Worker may already be running.
Future running cancellation requires a separate cancel_requested design.
```

Do not allow:

```text
completed -> failed
partial -> failed
completed -> slicing
partial -> slicing
cancelled -> locked
cancelled -> slicing
```

Terminal states:

```text
completed
partial
failed after max_attempts
cancelled
```

Retryable states:

```text
pending
locked with expired lock
failed when attempt_count < max_attempts and failure code is retryable
```

Not retryable by default:

```text
completed
partial
cancelled
failed with attempt_count >= max_attempts
failed with non-retryable error such as unsafe path or invalid SHA
```

## 6. Atomic Lock Design

Worker pickup must be atomic and use `UPDATE ... WHERE ...` plus `changes` check.

Design SQL:

```sql
UPDATE slicing_jobs
SET status = 'locked',
    worker_id = :worker_id,
    lock_owner = :lock_owner,
    locked_at = :now,
    lock_expires_at = :lock_expires_at,
    attempt_count = attempt_count + 1,
    last_error_code = NULL,
    last_error = NULL,
    updated_at = :now
WHERE id = :id
  AND (
    status = 'pending'
    OR (
      status = 'locked'
      AND lock_expires_at < :now
    )
    OR (
      status = 'failed'
      AND attempt_count < max_attempts
      AND last_error_code IN ('SLICER_TIMEOUT', 'WORKER_EXIT', 'PARSER_TEMPORARY')
    )
  );
```

If `changes !== 1`, the API returns `409`.

Each subsequent transition must include current status and `lock_owner`:

```sql
UPDATE slicing_jobs
SET status = 'slicing',
    started_at = :now,
    updated_at = :now
WHERE id = :id
  AND status = 'locked'
  AND lock_owner = :lock_owner;
```

## 7. Retry Design

Default:

```text
max_attempts = 3
```

Retryable error examples:

```text
SLICER_TIMEOUT
WORKER_EXIT
PARSER_TEMPORARY
OUTPUT_MISSING_TEMPORARY
```

Non-retryable error examples:

```text
UNSAFE_PATH
INPUT_SHA_MISMATCH
PROFILE_SHA_MISMATCH
SLICE_PARAMS_MISMATCH
GCODE_SHA_MISMATCH_AFTER_MOVE
PARSER_UNRECOGNIZED_GCODE
```

Rules:

- never retry forever
- preserve the latest sanitized error in `last_error`
- do not store secrets, full tokens, or full customer private data in `last_error`
- do not overwrite `completed` or `partial` rows with failed retry results
- for a new attempt after terminal failure, create a new row if human/operator policy requires separate audit

## 8. Idempotency And Cache Design

Phase05-D revised cache rule:

```text
Slicing cache and parsing cache are separate.
Do not use one unified cache_key_sha256.
```

Slice cache identity:

```text
input_sha256
profile_sha256
slice_params_sha256
slicer_name
slicer_package_version
```

Slice cache key:

```text
slice_cache_key_sha256 = sha256(canonical JSON of the slice identity above)
```

Parse cache identity:

```text
gcode_sha256
parser_version
```

Parse cache key:

```text
parse_cache_key_sha256 = sha256(canonical JSON of the parse identity above)
```

Rule:

```text
Parser version changes allow re-parsing an existing G-code.
Parser version changes must not force PrusaSlicer to run again.
```

Same slice cache key and existing reusable result:

```text
status = completed
or
status = partial and metrics_status = warning and operator policy accepts reuse
```

Cache reuse must:

- create a new `slicing_jobs` audit row
- set `source_slicing_job_id` to the reused source row
- copy parser metrics, metric sources, validation, and warnings only in first version
- not modify the historical source row

Cache reuse must not:

- rely on `file_id` uniqueness
- cross profile, slicer, parser, material, layer height, infill, support, or brim changes
- imply quote readiness
- implicitly share the same `gcode_relative_path`, `stdout_relative_path`, or `stderr_relative_path` without an explicit artifact ownership design

First version cache reuse mode:

```text
metrics_only
```

Future artifact sharing needs separate design:

```text
slicing_artifacts
reference counts
hard-link or copy strategy
artifact retention ownership
```

## 9. Directory Design

Input:

```text
/srv/make3d-worker/files
```

Processing:

```text
/srv/make3d-worker/processing/prusaslicer/<job_id>/
```

Successful output:

```text
/srv/make3d-worker/results/prusaslicer/<job_id>/
```

Failed output:

```text
/srv/make3d-worker/failed/prusaslicer/<job_id>/
```

Designed files:

```text
input.json
slice-params.json
stdout.log
stderr.log
result.json
summary.json
output.gcode
```

Rules:

- do not implement directory migration in Phase05-D
- never write outside `/srv/make3d-worker`
- use temporary `.part` files before atomic moves
- store relative paths in the database, not absolute paths, unless a later audit reason requires otherwise
- do not overwrite customer source files

## 10. G-code Retention Design

Retention policy fields:

```text
retention_status
retention_until
deleted_at
```

Recommended policy:

```text
Unpaid quote/test slicing: short-term retention.
Paid order production slicing: retain according to production and evidence needs.
Completed orders: follow the file retention policy already used for uploaded/model files.
Legal hold/dispute: set retention_status = legal_hold and do not delete.
```

Do not directly delete G-code in Phase05-D.

Any cleanup job must be a future separately approved phase.

## 11. Material Weight Boundary

Current Phase05-C parser can produce:

```text
filament_volume_mm3 > 0
filament_weight_mg = 0
metrics_status = warning
parser_quote_ready = false
```

Phase05-D database design must store facts only.

Do not:

- calculate material density
- derive weight from volume
- store pricing weight policy as if approved
- treat parsed G-code size or STL volume as material usage

Reserved fields for later policy:

```text
weight_source
weight_policy_version
derived_weight_mg
```

Future phase:

```text
Material Metrics Policy
```

## 12. Quote Boundary

`slicing_jobs` stores slicing facts only.

It must not store:

```text
price
estimated_price
material_fee
time_fee
order_total
payment_amount
```

Future quote logic may read only:

- approved profile
- approved material policy
- parser metrics with `metrics_status`
- explicit quote readiness policy

Quote logic must not infer:

```text
parse_status = parsed means safe to quote
```

`parser_quote_ready` is advisory parser validation only, not a price approval flag.

## 13. API Design

Design only. Do not implement in Phase05-D.

Future endpoints:

```text
GET  /api/worker/slicing/jobs/pending
POST /api/worker/slicing/jobs/:id/lock
POST /api/worker/slicing/jobs/:id/lease
POST /api/worker/slicing/jobs/:id/slicing
POST /api/worker/slicing/jobs/:id/sliced
POST /api/worker/slicing/jobs/:id/parsing
POST /api/worker/slicing/jobs/:id/result
POST /api/worker/slicing/jobs/:id/failed
```

Requirements:

- Worker Token authentication
- no user session access
- no admin session substitution
- atomic state transitions
- idempotent retry-safe responses
- state conflict returns `409`
- unsafe input returns `400` or `403`
- missing job returns `404`
- logs must not include Worker Token, full customer data, full paths with private names, or full raw G-code
- server must not send arbitrary binary paths, profile absolute paths, shell commands, or CLI argument strings
- Worker must resolve `profile_key` through a trusted local whitelist
- Worker must build structured argument arrays from schema-validated `slice_params_json`
- never use shell string concatenation

Pending response should include only safe job data:

```json
{
  "jobs": [
    {
      "job_id": 1,
      "file_id": 10,
      "file_sync_job_id": 20,
      "order_no": "M3D...",
      "input_relative_path": "M3D.../10-model.stl",
      "input_sha256": "...",
      "input_size_bytes": 12345,
      "profile_key": "bambu-p1s",
      "profile_version": "phase05-b",
      "profile_sha256": "...",
      "slice_params_json": "{\"material\":\"PLA\"}",
      "slice_params_sha256": "...",
      "slice_cache_key_sha256": "..."
    }
  ]
}
```

`POST /lease`:

```text
Must validate job_id, worker_id, lock_owner, and current active status.
Allowed active statuses: locked, slicing, sliced, parsing.
Refreshes lease_expires_at and lease_renewed_at.
```

Expired active state recovery:

```text
expired locked: may be reclaimed as locked by a new attempt.
expired slicing: mark current attempt timed out, then retry only if retryable and attempt_count < max_attempts.
expired sliced: may resume from generated G-code validation/parsing if artifacts are intact; otherwise retry by policy.
expired parsing: may retry parsing without rerunning PrusaSlicer if G-code SHA is valid.
```

Do not restore every expired state directly to `locked`.

`POST /result`:

```text
Worker uploads G-code metadata, parse result, metric sources, and metric validation.
Server validates payload and decides completed or partial.
Worker must not choose final completed/partial state directly.
```

Completed/result payload should carry parser output fields but not price fields.

## 14. Security Design

Worker may process only files whose sync job is verified:

```sql
SELECT *
FROM local_file_sync_jobs
WHERE id = :file_sync_job_id
  AND file_id = :file_id
  AND sync_status = 'verified'
  AND local_sha256 = :input_sha256;
```

Before slicing:

- verify local input file is inside `/srv/make3d-worker/files`
- verify local file SHA-256 equals `input_sha256`
- verify profile file SHA-256 equals `profile_sha256`
- verify canonical slice params SHA-256 equals `slice_params_sha256`

After slicing:

- verify G-code exists
- verify G-code size is nonzero and within limit
- compute G-code SHA-256
- parse with Phase05-C parser
- store metric sources and validation warnings

Do not:

- read `/app/uploads` from the local slicer Worker
- move or delete production upload files
- expose arbitrary file download paths
- place secrets in stdout/stderr summaries

## 15. Test Design

At least:

```text
1. verified file can create a slicing job.
2. unverified file cannot create a slicing job.
3. two Workers competing for the same job result in one lock and one 409.
4. expired lock can be reclaimed.
5. same cache key can reuse an existing completed result by source_slicing_job_id.
6. changed slice params create a new job/cache key.
7. changed profile SHA creates a new job/cache key.
8. changed slicer version creates a new job/cache key.
9. retryable failure increments attempt_count.
10. max attempts stops retry.
11. completed cannot be overwritten by failed.
12. input SHA mismatch fails safely.
13. G-code missing fails safely.
14. G-code SHA mismatch fails safely.
15. parser partial creates partial job state.
16. parser failed creates failed job state.
17. path traversal is rejected.
18. wrong Worker Token is rejected.
19. database idempotency preserves source rows.
20. historical orders are not backfilled in this phase.
21. quote/order/payment fields remain unchanged.
22. WeChat Pay tests remain unchanged.
```

Recommended commands for implementation phase:

```text
node --test tests/workerSlicingJobs.test.mjs
node --test tests/prusaslicerResultParser.test.mjs
node --test tests/workerLocalSync.test.mjs
npm test
npm run lint
npm run build
```

## 16. Migration Risks

Risks:

- old `slice_jobs` table name is similar and may confuse implementation
- old `slice_jobs` stores price fields and has cascade delete
- `local_file_sync_jobs.verified` can be misread as slicing verification
- cache reuse can accidentally overwrite audit rows if uniqueness is too strict
- G-code retention can grow disk usage quickly
- partial parser results may be misused as quote-ready

Mitigation:

- create new `slicing_jobs` table in a future approved migration
- do not reuse old `slice_jobs`
- add explicit comments/tests for `verified` meaning local file SHA only
- avoid global unique constraint on `slice_cache_key_sha256` and `parse_cache_key_sha256`
- use `source_slicing_job_id` for reuse lineage
- keep price/order/payment fields out of `slicing_jobs`
- keep cleanup in a later separate design phase

## 17. Implementation Order

Future implementation should be split:

```text
Phase05-E: slicing_jobs migration and database helpers only.
Phase05-F: Worker slicing API design and implementation.
Phase05-G: local Worker slicing execution using synthetic or TEST-only files.
Phase05-H: operational validation with TEST files.
Phase05-I: Material Metrics Policy design.
Phase05-J: quote integration design, still gated and TEST-only.
```

Phase05-E should:

- add migration/table/indexes
- add typed database helpers
- add unit tests for transitions, locks, retries, cache lineage, and constraints
- not implement Worker slicing execution
- not modify quote/order/payment logic
- not deploy production unless separately approved

## 18. Phase05-D Result

Design completed.

No migration created.

No API implemented.

No Worker code modified.

No production deployment performed.

## 19. Phase05-D Design Revision

Revision status:

```text
Phase05-D Design Revision completed before Phase05-E.
This section is the final implementation reference for the next phase.
```

Old design issues corrected:

```text
1. Unified cache_key_sha256 mixed slicing cache and parsing cache.
2. lock_owner allowed ambiguous Worker identity semantics.
3. No Worker lease renewal was defined for long slicing tasks.
4. Attempt history could be overwritten by later retries.
5. Pending API could be misread as allowing arbitrary profile/binary/CLI paths.
6. Cache reuse could imply shared G-code ownership without retention design.
7. Worker final-state authority was too broad.
8. locked -> cancelled introduced a running-worker race.
9. quote_ready naming could be confused with real quote eligibility.
10. Numeric and timestamp constraints were incomplete.
```

Corrected decisions:

```text
1. Use slice_cache_key_sha256 and parse_cache_key_sha256.
2. lock_owner is a per-attempt secure random token, not worker_id.
3. Add lease_expires_at and lease_renewed_at.
4. Add slicing_job_attempts.
5. Use profile_key and local Worker whitelist mapping.
6. First cache reuse mode is metrics_only.
7. Worker submits /result; server decides completed or partial.
8. First cancellation version allows only pending -> cancelled.
9. Rename quote_ready to parser_quote_ready.
10. Add positive-value CHECK constraints.
```

## 20. Revised Final Table Structure

Final design SQL, not executed:

```sql
CREATE TABLE IF NOT EXISTS slicing_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  file_id INTEGER NOT NULL,
  file_sync_job_id INTEGER NOT NULL,
  source_slicing_job_id INTEGER,

  customer_id_snapshot INTEGER,
  order_id_snapshot INTEGER,
  order_no_snapshot TEXT,

  worker_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  lock_owner TEXT,
  locked_at DATETIME,
  lock_expires_at DATETIME,
  lease_expires_at DATETIME,
  lease_renewed_at DATETIME,
  started_at DATETIME,
  finished_at DATETIME,
  failed_at DATETIME,

  slicer_name TEXT NOT NULL DEFAULT 'PrusaSlicer',
  slicer_package_version TEXT,
  slicer_banner_version TEXT,
  binary_path TEXT,
  profile_key TEXT NOT NULL,
  profile_name TEXT,
  profile_version TEXT NOT NULL,
  profile_path TEXT,
  profile_sha256 TEXT NOT NULL,
  slice_params_json TEXT NOT NULL,
  slice_params_sha256 TEXT NOT NULL,
  slice_cache_key_sha256 TEXT NOT NULL,
  parse_cache_key_sha256 TEXT,

  input_filename TEXT NOT NULL,
  input_relative_path TEXT NOT NULL,
  input_size_bytes INTEGER NOT NULL,
  input_sha256 TEXT NOT NULL,

  slice_duration_ms INTEGER,
  exit_code INTEGER,
  stdout_relative_path TEXT,
  stderr_relative_path TEXT,
  gcode_relative_path TEXT,
  gcode_size_bytes INTEGER,
  gcode_sha256 TEXT,

  parser_version TEXT,
  parse_status TEXT,
  metrics_status TEXT,
  parser_quote_ready INTEGER NOT NULL DEFAULT 0,

  print_time_seconds INTEGER,
  silent_print_time_seconds INTEGER,
  filament_length_microns INTEGER,
  filament_volume_mm3 INTEGER,
  filament_weight_mg INTEGER,
  layer_count INTEGER,
  max_layer_z_microns INTEGER,
  filament_type TEXT,
  printer_model TEXT,
  nozzle_diameter_microns INTEGER,
  layer_height_microns INTEGER,

  metric_sources_json TEXT,
  metric_validation_json TEXT,
  missing_fields_json TEXT,
  warnings_json TEXT,

  weight_source TEXT,
  weight_policy_version TEXT,
  derived_weight_mg INTEGER,

  retention_status TEXT NOT NULL DEFAULT 'active',
  retention_until DATETIME,
  deleted_at DATETIME,

  last_error_code TEXT,
  last_error TEXT,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
  FOREIGN KEY (file_sync_job_id) REFERENCES local_file_sync_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_slicing_job_id) REFERENCES slicing_jobs(id) ON DELETE RESTRICT,

  CHECK (status IN (
    'pending',
    'locked',
    'slicing',
    'sliced',
    'parsing',
    'completed',
    'partial',
    'failed',
    'cancelled'
  )),
  CHECK (attempt_count >= 0),
  CHECK (max_attempts >= 1),
  CHECK (parser_quote_ready IN (0, 1)),
  CHECK (input_size_bytes > 0),
  CHECK (slice_duration_ms IS NULL OR slice_duration_ms >= 0),
  CHECK (gcode_size_bytes IS NULL OR gcode_size_bytes > 0),
  CHECK (print_time_seconds IS NULL OR print_time_seconds >= 0),
  CHECK (silent_print_time_seconds IS NULL OR silent_print_time_seconds >= 0),
  CHECK (filament_length_microns IS NULL OR filament_length_microns >= 0),
  CHECK (filament_volume_mm3 IS NULL OR filament_volume_mm3 >= 0),
  CHECK (filament_weight_mg IS NULL OR filament_weight_mg >= 0),
  CHECK (derived_weight_mg IS NULL OR derived_weight_mg >= 0),
  CHECK (layer_count IS NULL OR layer_count >= 0),
  CHECK (max_layer_z_microns IS NULL OR max_layer_z_microns >= 0),
  CHECK (retention_status IN ('active', 'retain_until', 'legal_hold', 'deleted')),
  CHECK (metrics_status IS NULL OR metrics_status IN ('valid', 'warning', 'invalid')),
  CHECK (parse_status IS NULL OR parse_status IN ('parsed', 'partial', 'failed'))
);
```

Helper update rule:

```text
All database helpers must explicitly set updated_at = CURRENT_TIMESTAMP on every row update.
```

## 21. Revised Attempt Audit Table

Final design SQL, not executed:

```sql
CREATE TABLE IF NOT EXISTS slicing_job_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slicing_job_id INTEGER NOT NULL,
  attempt_no INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  lock_owner TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at DATETIME,
  finished_at DATETIME,
  lease_expires_at DATETIME,
  slice_duration_ms INTEGER,
  exit_code INTEGER,
  stdout_relative_path TEXT,
  stderr_relative_path TEXT,
  gcode_relative_path TEXT,
  gcode_size_bytes INTEGER,
  gcode_sha256 TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (slicing_job_id) REFERENCES slicing_jobs(id) ON DELETE RESTRICT,
  UNIQUE (slicing_job_id, attempt_no),
  CHECK (attempt_no >= 1),
  CHECK (slice_duration_ms IS NULL OR slice_duration_ms >= 0),
  CHECK (gcode_size_bytes IS NULL OR gcode_size_bytes > 0)
);
```

Attempt table purpose:

```text
The main slicing_jobs row stores current state and final result.
slicing_job_attempts stores each pickup, execution, timeout, failure, and retry.
Later attempts must not overwrite earlier attempt evidence.
```

## 22. Revised Final Indexes

Design SQL, not executed:

```sql
CREATE INDEX IF NOT EXISTS idx_slicing_jobs_pickup
ON slicing_jobs(status, lease_expires_at, lock_expires_at, attempt_count, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_file
ON slicing_jobs(file_id, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_file_sync
ON slicing_jobs(file_sync_job_id, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_order_snapshot
ON slicing_jobs(order_id_snapshot, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_worker
ON slicing_jobs(worker_id, status, locked_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_slice_cache
ON slicing_jobs(slice_cache_key_sha256, status, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_parse_cache
ON slicing_jobs(parse_cache_key_sha256, parser_version, status, created_at);

CREATE INDEX IF NOT EXISTS idx_slicing_jobs_reusable_metrics
ON slicing_jobs(slice_cache_key_sha256, status, parser_quote_ready, created_at)
WHERE status IN ('completed', 'partial');

CREATE UNIQUE INDEX IF NOT EXISTS idx_slicing_jobs_active_lock_owner
ON slicing_jobs(lock_owner)
WHERE lock_owner IS NOT NULL
  AND status IN ('locked', 'slicing', 'sliced', 'parsing');

CREATE INDEX IF NOT EXISTS idx_slicing_job_attempts_job
ON slicing_job_attempts(slicing_job_id, attempt_no);

CREATE INDEX IF NOT EXISTS idx_slicing_job_attempts_worker
ON slicing_job_attempts(worker_id, status, created_at);
```

No global unique constraint:

```text
Do not make file_id, slice_cache_key_sha256, or parse_cache_key_sha256 globally unique.
```

## 23. Revised Final State Machine

Allowed main path:

```text
pending -> locked -> slicing -> sliced -> parsing -> completed
```

Allowed partial path:

```text
parsing -> partial
```

Allowed retry path:

```text
failed retryable -> locked
```

Retry conditions:

```text
attempt_count < max_attempts
error_code belongs to the retryable list
previous terminal state is not completed, partial, cancelled, or failed non-retryable
```

Allowed cancellation path:

```text
pending -> cancelled
```

First version does not allow:

```text
locked -> cancelled
slicing -> cancelled
sliced -> cancelled
parsing -> cancelled
```

All terminal states must clear:

```text
lock_owner
locked_at
lock_expires_at
lease_expires_at
```

Terminal states:

```text
completed
partial
failed non-retryable
failed after max_attempts
cancelled
```

## 24. Revised Lease Model

Fields:

```text
lease_expires_at
lease_renewed_at
```

Lease endpoint:

```text
POST /api/worker/slicing/jobs/:id/lease
```

Each renewal must verify:

```text
job_id
worker_id
lock_owner
current status in locked, slicing, sliced, parsing
```

Expired state recovery:

```text
expired locked: recover by allowing a new lock attempt.
expired slicing: mark current attempt timeout; retry only if retryable and attempts remain.
expired sliced: verify G-code artifact; resume parsing if valid, otherwise retry by policy.
expired parsing: retry parsing if G-code SHA is valid; do not rerun PrusaSlicer just because parser work expired.
```

Rule:

```text
Do not convert all expired states directly back to locked.
```

## 25. Revised Worker Configuration Delivery

Pending API must include:

```text
profile_key
profile_version
profile_sha256
slice_params_json
slice_params_sha256
```

Server must not send:

```text
arbitrary profile absolute path
arbitrary binary path
shell command
CLI parameter string
```

Worker must:

```text
maintain a local whitelist from profile_key to trusted config path
verify profile_sha256 before execution
validate slice_params_json against schema
build an argument array from structured parameters
avoid shell string concatenation
```

Audit-only fields:

```text
binary_path
profile_path
```

These may be saved after execution, but must not be treated as execution instructions.

## 26. Revised API Model

Future API list:

```text
GET  /api/worker/slicing/jobs/pending
POST /api/worker/slicing/jobs/:id/lock
POST /api/worker/slicing/jobs/:id/lease
POST /api/worker/slicing/jobs/:id/slicing
POST /api/worker/slicing/jobs/:id/sliced
POST /api/worker/slicing/jobs/:id/parsing
POST /api/worker/slicing/jobs/:id/result
POST /api/worker/slicing/jobs/:id/failed
```

`POST /result`:

```text
Worker uploads G-code information, parser result, metric sources, and metric validity.
Server validates the payload and decides completed or partial.
Worker must not directly choose completed or partial as an arbitrary terminal state.
```

`POST /failed`:

```text
Server classifies the failure as retryable or non-retryable by error_code.
If retryable and attempts remain, the job can later move failed -> locked.
If non-retryable or max attempts reached, failed is terminal.
```

## 27. Revised Cache And Artifact Ownership Model

Slice cache:

```text
slice_cache_key_sha256 = sha256(input_sha256 + profile_sha256 + slice_params_sha256 + slicer_name + slicer_package_version)
```

Parse cache:

```text
parse_cache_key_sha256 = sha256(gcode_sha256 + parser_version)
```

Parser version changes:

```text
Allowed: reparse existing G-code.
Forbidden: force rerun PrusaSlicer solely because parser_version changed.
```

First cache reuse mode:

```text
metrics_only
```

When reusing:

```text
create a new slicing_jobs row
set source_slicing_job_id
copy parser metrics, sources, validation, missing fields, and warnings
do not copy gcode_relative_path, stdout_relative_path, or stderr_relative_path in first version
```

Reason:

```text
Multiple jobs must not implicitly share the same G-code path without independent retention and artifact ownership.
```

Future artifact design:

```text
slicing_artifacts
reference counts
hard-link/copy strategy
artifact retention policy
```

## 28. Revised Quote Boundary

Database field:

```text
parser_quote_ready
```

Meaning:

```text
Only parser-level metric validation readiness.
```

Not meaning:

```text
customer quote eligibility
price approval
automatic order amount update
payment amount update
```

Future separate concept:

```text
quote_eligibility
```

Rule:

```text
parser_quote_ready = 1 must never directly trigger customer quoting.
```

## 29. Phase05-D Revision Result

Design revision completed.

No migration created.

No database modified.

No API implemented.

No Worker modified.

No quote, order, payment, WeChat Pay, or upload logic changed.

No production deployment performed.

## 30. Phase05-D Final Schema Freeze

Freeze status:

```text
Phase05-D Final Schema Freeze completed on 2026-07-15.
This section is the final schema/API/test reference for Phase05-E.
Do not implement older Phase05-D table drafts.
```

Additional corrections frozen here:

```text
1. Add input_worker_id so slicing jobs are visible only to the Worker that owns the verified local input file.
2. Add artifact_worker_id so generated G-code/log/result ownership is explicit.
3. Split required slicer/parser versions from actual execution versions.
4. Add result_origin to distinguish executed results from metrics-only cache reuse.
5. Use Unix epoch milliseconds for lock, lease, execution, failure, and cache reuse comparisons.
6. Lock acquisition and attempt row creation must happen in one SQLite transaction.
7. Lease renewal must update main job and current attempt in one SQLite transaction.
8. Result/failure finalization must update main job and current attempt in one SQLite transaction.
9. Pending API returns slice_params as a JSON object, not JSON embedded in a string.
10. Cache key algorithms use stable canonical JSON, UTF-8, and SHA-256.
```

## 31. Frozen Main Table

Final design SQL, not executed:

```sql
CREATE TABLE IF NOT EXISTS slicing_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  file_id INTEGER NOT NULL,
  file_sync_job_id INTEGER NOT NULL,
  source_slicing_job_id INTEGER,

  customer_id_snapshot INTEGER,
  order_id_snapshot INTEGER,
  order_no_snapshot TEXT,

  input_worker_id TEXT NOT NULL,
  artifact_worker_id TEXT,

  worker_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  lock_owner TEXT,
  locked_at_ms INTEGER,
  lock_expires_at_ms INTEGER,
  lease_expires_at_ms INTEGER,
  lease_renewed_at_ms INTEGER,
  started_at_ms INTEGER,
  finished_at_ms INTEGER,
  failed_at_ms INTEGER,

  slicer_name TEXT NOT NULL DEFAULT 'PrusaSlicer',
  required_slicer_package_version TEXT NOT NULL,
  actual_slicer_package_version TEXT,
  slicer_banner_version TEXT,
  binary_path TEXT,

  profile_key TEXT NOT NULL,
  profile_name TEXT,
  profile_version TEXT NOT NULL,
  profile_path TEXT,
  profile_sha256 TEXT NOT NULL,

  slice_params_json TEXT NOT NULL,
  slice_params_sha256 TEXT NOT NULL,
  slice_cache_key_version TEXT NOT NULL DEFAULT '1.0',
  slice_cache_key_sha256 TEXT NOT NULL,

  input_filename TEXT NOT NULL,
  input_relative_path TEXT NOT NULL,
  input_size_bytes INTEGER NOT NULL,
  input_sha256 TEXT NOT NULL,

  result_origin TEXT NOT NULL DEFAULT 'executed',
  cache_reused_at_ms INTEGER,

  slice_duration_ms INTEGER,
  exit_code INTEGER,
  stdout_relative_path TEXT,
  stderr_relative_path TEXT,
  gcode_relative_path TEXT,
  gcode_size_bytes INTEGER,
  gcode_sha256 TEXT,

  required_parser_version TEXT NOT NULL,
  actual_parser_version TEXT,
  parse_cache_key_version TEXT,
  parse_cache_key_sha256 TEXT,
  parse_status TEXT,
  metrics_status TEXT,
  parser_quote_ready INTEGER NOT NULL DEFAULT 0,

  print_time_seconds INTEGER,
  silent_print_time_seconds INTEGER,
  filament_length_microns INTEGER,
  filament_volume_mm3 INTEGER,
  filament_weight_mg INTEGER,
  layer_count INTEGER,
  max_layer_z_microns INTEGER,
  filament_type TEXT,
  printer_model TEXT,
  nozzle_diameter_microns INTEGER,
  layer_height_microns INTEGER,

  metric_sources_json TEXT,
  metric_validation_json TEXT,
  missing_fields_json TEXT,
  warnings_json TEXT,

  weight_source TEXT,
  weight_policy_version TEXT,
  derived_weight_mg INTEGER,

  retention_status TEXT NOT NULL DEFAULT 'active',
  retention_until DATETIME,
  deleted_at DATETIME,

  last_error_code TEXT,
  last_error TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
  FOREIGN KEY (file_sync_job_id) REFERENCES local_file_sync_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_slicing_job_id) REFERENCES slicing_jobs(id) ON DELETE RESTRICT,

  CHECK (status IN (
    'pending',
    'locked',
    'slicing',
    'sliced',
    'parsing',
    'completed',
    'partial',
    'failed',
    'cancelled'
  )),
  CHECK (attempt_count >= 0),
  CHECK (max_attempts >= 1),
  CHECK (parser_quote_ready IN (0, 1)),
  CHECK (input_size_bytes > 0),
  CHECK (slice_duration_ms IS NULL OR slice_duration_ms >= 0),
  CHECK (cache_reused_at_ms IS NULL OR cache_reused_at_ms >= 0),
  CHECK (gcode_size_bytes IS NULL OR gcode_size_bytes > 0),
  CHECK (print_time_seconds IS NULL OR print_time_seconds >= 0),
  CHECK (silent_print_time_seconds IS NULL OR silent_print_time_seconds >= 0),
  CHECK (filament_length_microns IS NULL OR filament_length_microns >= 0),
  CHECK (filament_volume_mm3 IS NULL OR filament_volume_mm3 >= 0),
  CHECK (filament_weight_mg IS NULL OR filament_weight_mg >= 0),
  CHECK (derived_weight_mg IS NULL OR derived_weight_mg >= 0),
  CHECK (layer_count IS NULL OR layer_count >= 0),
  CHECK (max_layer_z_microns IS NULL OR max_layer_z_microns >= 0),
  CHECK (result_origin IN ('executed', 'metrics_cache')),
  CHECK (retention_status IN ('active', 'retain_until', 'legal_hold', 'deleted')),
  CHECK (metrics_status IS NULL OR metrics_status IN ('valid', 'warning', 'invalid')),
  CHECK (parse_status IS NULL OR parse_status IN ('parsed', 'partial', 'failed')),
  CHECK (
    result_origin = 'executed'
    OR (
      result_origin = 'metrics_cache'
      AND source_slicing_job_id IS NOT NULL
      AND attempt_count = 0
      AND gcode_relative_path IS NULL
      AND stdout_relative_path IS NULL
      AND stderr_relative_path IS NULL
      AND slice_duration_ms IS NULL
    )
  )
);
```

## 32. Frozen Attempt Table

Final design SQL, not executed:

```sql
CREATE TABLE IF NOT EXISTS slicing_job_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slicing_job_id INTEGER NOT NULL,
  attempt_no INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  lock_owner TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at_ms INTEGER,
  finished_at_ms INTEGER,
  lease_expires_at_ms INTEGER,
  lease_renewed_at_ms INTEGER,
  slice_duration_ms INTEGER,
  exit_code INTEGER,
  stdout_relative_path TEXT,
  stderr_relative_path TEXT,
  gcode_relative_path TEXT,
  gcode_size_bytes INTEGER,
  gcode_sha256 TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (slicing_job_id) REFERENCES slicing_jobs(id) ON DELETE RESTRICT,
  UNIQUE (slicing_job_id, attempt_no),
  UNIQUE (lock_owner),
  CHECK (attempt_no >= 1),
  CHECK (status IN (
    'locked',
    'slicing',
    'sliced',
    'parsing',
    'completed',
    'partial',
    'failed',
    'expired'
  )),
  CHECK (started_at_ms IS NULL OR started_at_ms >= 0),
  CHECK (finished_at_ms IS NULL OR finished_at_ms >= 0),
  CHECK (lease_expires_at_ms IS NULL OR lease_expires_at_ms >= 0),
  CHECK (lease_renewed_at_ms IS NULL OR lease_renewed_at_ms >= 0),
  CHECK (slice_duration_ms IS NULL OR slice_duration_ms >= 0),
  CHECK (gcode_size_bytes IS NULL OR gcode_size_bytes > 0)
);
```

## 33. Frozen Worker Ownership Rules

Input ownership:

```text
input_worker_id TEXT NOT NULL
```

Meaning:

```text
The Worker that completed local_file_sync_jobs.verified and actually owns the local input file under /srv/make3d-worker/files.
```

First version rule:

```text
Only the Worker whose request worker_id equals input_worker_id can see pending slicing jobs, lock jobs, or execute slicing.
```

Required API behavior:

```text
GET /api/worker/slicing/jobs/pending filters by input_worker_id = request.worker_id.
POST /api/worker/slicing/jobs/:id/lock rechecks request.worker_id = input_worker_id.
```

Do not assume different Workers share:

```text
/srv/make3d-worker/files
```

Future design:

```text
worker_file_replicas
```

Artifact ownership:

```text
artifact_worker_id TEXT
```

Meaning:

```text
The Worker where G-code, stdout, stderr, result.json, and related output artifacts physically exist.
```

Rules:

```text
Set artifact_worker_id when entering sliced.
expired sliced may continue from existing G-code only on the same artifact_worker_id.
expired parsing may continue parsing existing G-code only on the same artifact_worker_id.
Other Workers must not assume local G-code exists.
```

Future shared artifacts need separate design.

## 34. Frozen Version Rules

Required versions:

```text
required_slicer_package_version TEXT NOT NULL
required_parser_version TEXT NOT NULL
```

Actual versions:

```text
actual_slicer_package_version TEXT
actual_parser_version TEXT
```

Rules:

```text
Task creation stores required versions.
Worker checks actual versions before execution/parsing.
Version mismatch rejects execution.
```

Error codes:

```text
SLICER_VERSION_MISMATCH
PARSER_VERSION_MISMATCH
```

Cache rule:

```text
slice_cache_key_sha256 uses required_slicer_package_version.
actual_* versions are runtime evidence and audit data.
```

## 35. Frozen Result Origin Rules

Field:

```text
result_origin TEXT NOT NULL
```

Allowed values:

```text
executed
metrics_cache
```

Executed result:

```text
result_origin = executed
```

Metrics cache reuse:

```text
result_origin = metrics_cache
source_slicing_job_id IS NOT NULL
attempt_count = 0
gcode_relative_path IS NULL
stdout_relative_path IS NULL
stderr_relative_path IS NULL
slice_duration_ms IS NULL
cache_reused_at_ms is set
```

Completed and partial states may originate from either:

```text
executed
metrics_cache
```

The origin must always be explicit.

## 36. Frozen Time Model

Worker state and lease comparison fields use Unix epoch milliseconds:

```text
locked_at_ms
lock_expires_at_ms
lease_expires_at_ms
lease_renewed_at_ms
started_at_ms
finished_at_ms
failed_at_ms
cache_reused_at_ms
```

Node source:

```text
Date.now()
```

Forbidden for lease/state comparisons:

```text
SQLite CURRENT_TIMESTAMP
ISO strings
local timezone strings
mixed date formats
```

Allowed audit text fields:

```text
created_at
updated_at
```

Rule:

```text
created_at and updated_at may remain UTC text, but every helper must use one fixed format consistently.
```

## 37. Frozen Transaction Boundaries

Lock acquisition and attempt creation must be one SQLite transaction:

```text
BEGIN
UPDATE slicing_jobs to locked with worker_id, lock_owner, attempt_count + 1, and ms lease fields
check changes = 1
read new attempt_count
INSERT slicing_job_attempts with attempt_no = new attempt_count
COMMIT
```

Any failure:

```text
ROLLBACK
```

Invariant:

```text
Main job lock state and attempt audit record must never diverge.
```

Lease renewal transaction:

```text
POST /lease updates slicing_jobs and current slicing_job_attempts in the same transaction.
It must verify job_id, worker_id, lock_owner, active status, and now_ms < lease_expires_at_ms.
If the lease is expired, return 409.
Old Workers must not renew expired leases or recover themselves.
```

Terminal transaction:

```text
POST /result and POST /failed update the main job, complete the current attempt, write result/error fields, set finished_at_ms or failed_at_ms, and clear lock/lease fields in one transaction.
```

Terminal cleanup fields:

```text
lock_owner = NULL
locked_at_ms = NULL
lock_expires_at_ms = NULL
lease_expires_at_ms = NULL
```

Invariant:

```text
No state where the main job is completed/partial/failed but the attempt remains running.
```

## 38. Frozen Pending API Shape

Pending API must return `slice_params` as a JSON object:

```json
{
  "jobs": [
    {
      "job_id": 1,
      "file_id": 10,
      "file_sync_job_id": 20,
      "order_no": "M3D...",
      "input_worker_id": "wsl-worker-01",
      "input_relative_path": "M3D.../10-model.stl",
      "input_sha256": "...",
      "input_size_bytes": 12345,
      "profile_key": "bambu-p1s",
      "profile_version": "phase05-b",
      "profile_sha256": "...",
      "slice_params": {
        "material": "PLA",
        "printer_model": "Bambu Lab P1S",
        "nozzle_diameter_microns": 400,
        "layer_height_microns": 200,
        "fill_density_percent": 50,
        "support_mode": "none",
        "brim_width_microns": 0
      },
      "slice_params_sha256": "...",
      "slice_cache_key_version": "1.0",
      "slice_cache_key_sha256": "...",
      "required_slicer_package_version": "2.7.2+dfsg-1build2",
      "required_parser_version": "phase05-c-parser-v1"
    }
  ]
}
```

Database still stores:

```text
canonical slice_params_json
```

API must not return:

```text
JSON string embedded inside JSON for slice_params
```

## 39. Frozen Cache Key Algorithm

Do not concatenate raw strings.

Slice cache identity object:

```json
{
  "schema_version": "1.0",
  "input_sha256": "",
  "profile_sha256": "",
  "slice_params_sha256": "",
  "slicer_name": "",
  "slicer_package_version": ""
}
```

Parse cache identity object:

```json
{
  "schema_version": "1.0",
  "gcode_sha256": "",
  "parser_version": ""
}
```

Algorithm:

```text
1. Build the identity object.
2. Serialize with fixed field order and stable JSON.
3. Encode as UTF-8.
4. Compute SHA-256 hex.
```

Version fields:

```text
slice_cache_key_version
parse_cache_key_version
```

Field-order rule:

```text
Changing object construction order must not change SHA.
Changing field value must change SHA.
```

## 40. Frozen API List

Future API list:

```text
GET  /api/worker/slicing/jobs/pending
POST /api/worker/slicing/jobs/:id/lock
POST /api/worker/slicing/jobs/:id/lease
POST /api/worker/slicing/jobs/:id/slicing
POST /api/worker/slicing/jobs/:id/sliced
POST /api/worker/slicing/jobs/:id/parsing
POST /api/worker/slicing/jobs/:id/result
POST /api/worker/slicing/jobs/:id/failed
```

Still forbidden in Phase05-D:

```text
Do not implement these APIs.
```

## 41. Frozen Test Checklist

Add these to Phase05-E/F implementation tests:

```text
1. Worker A synced file; Worker B cannot see slicing task.
2. Worker B cannot lock Worker A input task.
3. artifact on Worker A; Worker B cannot continue parsing.
4. required slicer version mismatch fails with SLICER_VERSION_MISMATCH.
5. required parser version mismatch fails with PARSER_VERSION_MISMATCH.
6. metrics_cache task has no attempt and no G-code/log paths.
7. executed result sets result_origin = executed.
8. cache result sets result_origin = metrics_cache.
9. lock transaction attempt insert failure rolls back main job lock.
10. main job update failure prevents attempt creation.
11. expired lease renewal by old Worker returns 409.
12. lease renewal updates main job and attempt together.
13. result transaction failure rolls back main job and attempt together.
14. Unix millisecond comparison works without timezone string comparison.
15. Pending API returns slice_params object.
16. cache key field order changes do not change SHA.
17. cache key field value changes change SHA.
18. terminal result clears lock_owner, locked_at_ms, lock_expires_at_ms, lease_expires_at_ms.
19. metrics_cache rows enforce source_slicing_job_id and null G-code/log paths.
20. Phase05-E migration does not touch quote/order/payment/WeChat/upload logic.
```

## 42. Phase05-E Readiness

Phase05-E may start only after explicit approval.

Phase05-E should be limited to:

```text
database migration
database helpers
unit tests for schema, constraints, transactions, ownership, cache keys, and state transitions
```

Phase05-E must still not:

```text
implement Worker slicing execution
implement production automatic slicing
modify quote logic
modify order amounts
modify payment or WeChat Pay
modify upload limits
deploy production unless separately approved
```

## 43. Phase05-D Freeze Result

Final schema freeze completed.

No migration created.

No database modified.

No API implemented.

No Worker modified.

No quote, order, payment, WeChat Pay, or upload logic changed.

No production deployment performed.
