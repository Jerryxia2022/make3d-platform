# Phase05-D Design Revision Final Report

Date: 2026-07-14
Status: completed, design only

## Scope

Phase05-D Design Revision revised the approved slicing jobs database and Worker state design.

This revision did not:

- create a database migration
- modify any database
- implement Worker API
- modify Worker code
- deploy production
- modify quote logic
- modify orders
- modify payment or WeChat Pay
- modify upload limits

## Modified Files

```text
reports/phase05-d-slicing-jobs-design.md
reports/phase05-d-design-revision-final.md
changelog/CHANGELOG.md
```

## Revision Summary

The previous Phase05-D design was revised in these areas:

```text
1. Split one unified cache key into slice_cache_key_sha256 and parse_cache_key_sha256.
2. Added lease_expires_at and lease_renewed_at for long Worker slicing tasks.
3. Added slicing_job_attempts for per-attempt audit history.
4. Fixed lock_owner as a per-attempt secure random token, not worker_id.
5. Changed Worker task delivery to profile_key plus structured slice_params_json.
6. Limited first cache reuse to metrics_only.
7. Added /lease and /result API design.
8. Server, not Worker, decides completed versus partial.
9. Limited first cancellation policy to pending -> cancelled.
10. Renamed quote_ready to parser_quote_ready.
11. Added positive-value database constraints.
12. Clarified binary_path and profile_path are audit snapshots only.
```

## Final Cache Model

Slice cache key:

```text
slice_cache_key_sha256 =
sha256(input_sha256 + profile_sha256 + slice_params_sha256 + slicer_name + slicer_package_version)
```

Parse cache key:

```text
parse_cache_key_sha256 =
sha256(gcode_sha256 + parser_version)
```

Rule:

```text
Parser version changes may trigger re-parsing existing G-code.
Parser version changes must not force rerunning PrusaSlicer.
```

## Final Lease Model

Fields:

```text
lease_expires_at
lease_renewed_at
```

Endpoint:

```text
POST /api/worker/slicing/jobs/:id/lease
```

Lease renewal must validate:

```text
job_id
worker_id
lock_owner
active status: locked, slicing, sliced, parsing
```

Expired state handling:

```text
expired locked: reclaim by new lock attempt.
expired slicing: mark timeout and retry only if retryable.
expired sliced: validate G-code and resume parsing if possible.
expired parsing: retry parsing without rerunning PrusaSlicer if G-code SHA is valid.
```

## Final Attempt Audit Model

New future table:

```text
slicing_job_attempts
```

Purpose:

```text
Main slicing_jobs row stores current state and final result.
slicing_job_attempts stores each pickup, execution, failure, timeout, and retry.
Later attempts must not overwrite earlier evidence.
```

Minimum fields:

```text
id
slicing_job_id
attempt_no
worker_id
lock_owner
status
started_at
finished_at
lease_expires_at
slice_duration_ms
exit_code
stdout_relative_path
stderr_relative_path
gcode_relative_path
gcode_size_bytes
gcode_sha256
error_code
error_message
created_at
```

## Final API Model

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

Important rules:

```text
Worker Token required.
User/admin session cannot substitute Worker Token.
State conflicts return 409.
Worker must not select completed/partial directly.
Server validates /result and decides completed or partial.
```

## Final Worker Configuration Delivery

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
CLI argument string
```

Worker must:

```text
resolve profile_key through a local trusted whitelist
verify profile_sha256
validate slice_params_json schema
build argument arrays from structured data
avoid shell string concatenation
```

## Final Quote Boundary

Database field:

```text
parser_quote_ready
```

Meaning:

```text
Parser-level metric validation only.
```

Not allowed:

```text
parser_quote_ready = 1 directly triggering customer quote
parser_quote_ready = 1 updating order amount
parser_quote_ready = 1 updating payment amount
```

Future separate design:

```text
quote_eligibility
```

## Final Table References

The full revised SQL design is recorded in:

```text
reports/phase05-d-slicing-jobs-design.md
```

Key final structures:

```text
slicing_jobs
slicing_job_attempts
slice_cache_key_sha256
parse_cache_key_sha256
lease_expires_at
lease_renewed_at
parser_quote_ready
profile_key
```

## Verification

No code, migration, or production configuration was changed.

Tests were not run because this revision only changed design reports and changelog.

## Next Step

Do not enter Phase05-E until explicitly approved.

Recommended next phase:

```text
Phase05-E: database migration and database helper implementation only.
```

Phase05-E must still avoid:

```text
Worker slicing execution
automatic quote integration
order/payment mutation
WeChat Pay changes
production deployment unless separately approved
```
