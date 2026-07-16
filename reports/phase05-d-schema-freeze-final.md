# Phase05-D Schema Freeze Final Report

Date: 2026-07-15
Status: completed, design only

## Scope

Phase05-D Final Schema Freeze freezes the future `slicing_jobs` and `slicing_job_attempts` schema/API design before Phase05-E.

This phase did not:

- create a database migration
- modify any database
- implement API
- modify Worker code
- deploy production
- modify quote logic
- modify orders
- modify payment or WeChat Pay
- modify upload limits

## Modified Files

```text
reports/phase05-d-slicing-jobs-design.md
reports/phase05-d-schema-freeze-final.md
changelog/CHANGELOG.md
```

## 1. Final Main Table

The final main table is:

```text
slicing_jobs
```

Final frozen additions:

```text
input_worker_id TEXT NOT NULL
artifact_worker_id TEXT
required_slicer_package_version TEXT NOT NULL
actual_slicer_package_version TEXT
required_parser_version TEXT NOT NULL
actual_parser_version TEXT
result_origin TEXT NOT NULL
cache_reused_at_ms INTEGER
locked_at_ms INTEGER
lock_expires_at_ms INTEGER
lease_expires_at_ms INTEGER
lease_renewed_at_ms INTEGER
started_at_ms INTEGER
finished_at_ms INTEGER
failed_at_ms INTEGER
slice_cache_key_version TEXT
parse_cache_key_version TEXT
```

Full SQL is frozen in:

```text
reports/phase05-d-slicing-jobs-design.md
```

## 2. Final Attempt Table

The final attempt audit table is:

```text
slicing_job_attempts
```

Required constraints:

```text
UNIQUE(slicing_job_id, attempt_no)
UNIQUE(lock_owner)
status CHECK: locked, slicing, sliced, parsing, completed, partial, failed, expired
updated_at included
lease_renewed_at_ms included
```

Purpose:

```text
Main table stores current state and final result.
Attempt table stores every pickup, execution, failure, timeout, lease renewal, and retry trail.
Later attempts must not overwrite earlier evidence.
```

## 3. Worker Ownership

Input ownership:

```text
input_worker_id
```

First version rule:

```text
Only request.worker_id == input_worker_id can see, lock, and execute a slicing task.
```

Pending API must filter by `input_worker_id`.

Lock API must recheck:

```text
worker_id = input_worker_id
```

Do not assume `/srv/make3d-worker/files` is shared across Workers.

Future design:

```text
worker_file_replicas
```

## 4. Artifact Ownership

Artifact ownership:

```text
artifact_worker_id
```

Meaning:

```text
Worker where G-code, stdout, stderr, result.json, and related artifacts physically exist.
```

Rules:

```text
Set artifact_worker_id when entering sliced.
expired sliced can continue only on same artifact_worker_id.
expired parsing can continue only on same artifact_worker_id.
Other Workers must not assume G-code exists locally.
```

## 5. Version Requirements

Required versions:

```text
required_slicer_package_version
required_parser_version
```

Actual versions:

```text
actual_slicer_package_version
actual_parser_version
```

Rules:

```text
Task creation stores required versions.
Worker verifies actual versions before execution.
Mismatch rejects execution.
```

Error codes:

```text
SLICER_VERSION_MISMATCH
PARSER_VERSION_MISMATCH
```

Slice cache uses required slicer version. Actual versions are audit evidence.

## 6. Result Origin

Result origin field:

```text
result_origin
```

Enum:

```text
executed
metrics_cache
```

Executed:

```text
result_origin = executed
```

Metrics cache:

```text
result_origin = metrics_cache
source_slicing_job_id is not null
attempt_count = 0
gcode_relative_path is null
stdout_relative_path is null
stderr_relative_path is null
slice_duration_ms is null
cache_reused_at_ms is set
```

## 7. Unix Millisecond Time

Worker state fields use Unix epoch milliseconds:

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

Forbidden for lease/state comparison:

```text
SQLite CURRENT_TIMESTAMP
ISO strings
local timezone strings
mixed timestamp formats
```

`created_at` and `updated_at` may remain fixed-format UTC text.

## 8. Transaction Boundaries

Lock acquisition must be one SQLite transaction:

```text
BEGIN
UPDATE slicing_jobs to locked and increment attempt_count
check changes = 1
read new attempt_count
INSERT slicing_job_attempts with attempt_no = attempt_count
COMMIT
```

Any failure:

```text
ROLLBACK
```

Lease renewal transaction:

```text
POST /lease updates slicing_jobs and current slicing_job_attempts together.
Requires now_ms < lease_expires_at_ms.
Expired lease returns 409.
```

Terminal transaction:

```text
POST /result and POST /failed update main job, finish current attempt, write result/error, set finished_at_ms or failed_at_ms, and clear lock/lease fields together.
```

No allowed split-brain state:

```text
main job terminal but attempt still running
attempt created but main job not locked
lease renewed only on one table
```

## 9. Lease Rules

Endpoint:

```text
POST /api/worker/slicing/jobs/:id/lease
```

Must verify:

```text
job_id
worker_id
lock_owner
active status
now_ms < lease_expires_at_ms
```

Active statuses:

```text
locked
slicing
sliced
parsing
```

Expired leases:

```text
return 409
old Worker cannot renew or recover itself
```

## 10. Cache Key Specification

Do not concatenate raw strings.

Slice cache identity:

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

Parse cache identity:

```json
{
  "schema_version": "1.0",
  "gcode_sha256": "",
  "parser_version": ""
}
```

Algorithm:

```text
stable JSON with fixed field order
UTF-8 bytes
SHA-256 hex
```

Version fields:

```text
slice_cache_key_version
parse_cache_key_version
```

## 11. Final API Structure

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

Pending API must return `slice_params` as an object, not a JSON string:

```json
{
  "slice_params": {
    "material": "PLA",
    "printer_model": "Bambu Lab P1S",
    "nozzle_diameter_microns": 400,
    "layer_height_microns": 200,
    "fill_density_percent": 50,
    "support_mode": "none",
    "brim_width_microns": 0
  }
}
```

## 12. Final Test Checklist

Phase05-E/F tests must include:

```text
1. Worker A synced file; Worker B cannot see slicing task.
2. Worker B cannot lock Worker A task.
3. artifact on Worker A; Worker B cannot continue parsing.
4. required slicer version mismatch.
5. required parser version mismatch.
6. metrics_cache task has no attempt and no G-code/log paths.
7. executed result_origin.
8. metrics_cache result_origin.
9. attempt insert failure rolls back main lock.
10. main update failure prevents attempt creation.
11. expired lease renewal returns 409.
12. lease updates main job and attempt together.
13. result transaction failure rolls back both tables.
14. Unix ms comparisons.
15. slice_params API returns object.
16. cache key field order change does not change SHA.
17. cache key value change changes SHA.
18. terminal state clears lock and lease fields.
19. metrics_cache constraint enforces source row and null artifact paths.
20. no quote/order/payment/WeChat/upload changes.
```

## 13. Phase05-E Readiness

Phase05-E can start after explicit approval.

Recommended Phase05-E scope:

```text
database migration
database helpers
schema and transaction tests
```

Phase05-E must not:

```text
implement Worker slicing execution
implement automatic quote
modify order amount
modify payment or WeChat Pay
modify upload limits
deploy production unless separately approved
```

## Verification

No code, migration, database, Worker, API, production, quote, order, payment, WeChat Pay, or upload logic was changed.

Tests were not run because this phase only modified design documents and changelog.
