# Phase05-F Worker Slicing API Design

Date: 2026-07-15
Status: design only

## Scope

Phase05-F designs the future Worker Slicing API contract for cloud-side slicing job pickup and state reporting.

This phase does not:

- implement API routes
- modify the WSL Worker
- start PrusaSlicer
- create real slicing jobs
- use real customer files
- modify orders
- modify quote logic
- modify order amounts
- modify payment or WeChat Pay
- modify upload limits
- deploy production

## Existing Implementation Read

Design basis reviewed:

- `reports/phase05-d-schema-freeze-final.md`
- `reports/phase05-e-database-helpers-implementation-final.md`
- `reports/phase05-e-atomic-idempotency-final.md`
- `src/backend/workerSlicingJobs.ts`
- `src/backend/workerFileSync.ts`
- Existing Phase03 Worker file sync routes under `src/app/api/worker/jobs`
- Existing `tests/workerApi.test.mjs`

Confirmed current Phase05-E status:

- `npm test`: 251/251 passed in Phase05-E Atomic Idempotency Hardening.
- Phase05-E is helper/database only.
- Phase05-F is API design only.

## 1. Authentication Identity

Worker identity must be determined by authentication, not by request body, query, or arbitrary headers.

First implementation design:

```text
MAKE3D_WORKER_TOKEN -> authenticated_worker_id = wsl-worker-01
```

Rules:

- Missing token returns `401`.
- Wrong token returns `401`.
- Disabled Worker returns `403`.
- Token comparison must use constant-time comparison.
- Token must never be logged.
- `worker_id` fields in query/body/ordinary headers are ignored for identity.
- All Worker ownership checks use `authenticated_worker_id`.

Compatibility note:

- Existing Phase03 file sync `requireWorkerAuth` accepts `x-make3d-worker-id`.
- The slicing API must not inherit that trust model.
- Future multi-Worker design may use a Worker credential mapping:

```text
worker_id
token_hash
enabled
created_at
last_used_at
```

This phase does not create that table and does not modify production token configuration.

## 2. API List

Worker slicing API routes:

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

Not included:

- public customer API
- automatic quote API
- payment API
- Worker task creation API

## 3. Request Structures

### Pending

```http
GET /api/worker/slicing/jobs/pending
Authorization: Bearer <token>
```

No `worker_id` parameter is accepted.

### Lock

```http
POST /api/worker/slicing/jobs/:id/lock
Authorization: Bearer <token>
```

Worker must not submit:

- `lock_owner`
- `lock_expires_at_ms`
- `lease_expires_at_ms`
- `worker_id`

### Lease

```json
{
  "lock_owner": "server-generated-lock-owner"
}
```

Worker must not submit a new lease expiry time.

### Slicing

```json
{
  "lock_owner": "server-generated-lock-owner",
  "actual_slicer_package_version": "2.7.2+dfsg-1build2",
  "actual_parser_version": "phase05-c-parser-v1",
  "input_sha256": "<64 hex>",
  "profile_sha256": "<64 hex>",
  "slice_params_sha256": "<64 hex>"
}
```

This API records state only. It must not start PrusaSlicer.

### Sliced

```json
{
  "lock_owner": "server-generated-lock-owner",
  "actual_slicer_package_version": "2.7.2+dfsg-1build2",
  "slicer_banner_version": "PrusaSlicer-2.7.2",
  "slice_duration_ms": 12345,
  "exit_code": 0,
  "gcode_relative_path": "results/prusaslicer/1/output.gcode",
  "gcode_size_bytes": 123456,
  "gcode_sha256": "<64 hex>",
  "stdout_relative_path": "results/prusaslicer/1/stdout.log",
  "stderr_relative_path": "results/prusaslicer/1/stderr.log"
}
```

The Worker uploads metadata only. It must not upload G-code, stdout, or stderr contents.

For Phase05-F implementation, `/sliced` artifact paths are fixed to the current job id:

```text
results/prusaslicer/<job_id>/output.gcode
results/prusaslicer/<job_id>/stdout.log
results/prusaslicer/<job_id>/stderr.log
```

The endpoint must reject paths outside the current `<job_id>` result directory.

### Parsing

```json
{
  "lock_owner": "server-generated-lock-owner",
  "actual_parser_version": "phase05-c-parser-v1",
  "gcode_sha256": "<64 hex>"
}
```

The web server must not read the Worker-local G-code file.

### Result

```json
{
  "lock_owner": "server-generated-lock-owner",
  "gcode_sha256": "<64 hex>",
  "parse_cache_key_version": "1.0",
  "parse_cache_key_sha256": "<64 hex>",
  "parse_status": "parsed",
  "metrics_status": "valid",
  "parser_quote_ready": true,
  "metrics": {
    "print_time_seconds": 0,
    "silent_print_time_seconds": 0,
    "filament_length_microns": 0,
    "filament_volume_mm3": 0,
    "filament_weight_mg": 0,
    "layer_count": 0,
    "max_layer_z_microns": 0,
    "filament_type": "PLA",
    "printer_model": "Bambu Lab P1S",
    "nozzle_diameter_microns": 400,
    "layer_height_microns": 200
  },
  "metric_sources": {},
  "metric_validation": {},
  "missing_fields": [],
  "warnings": []
}
```

Forbidden request fields:

- `status`
- `completed`
- `partial`
- price
- material fee
- labor fee
- order amount
- payment amount
- payment status

### Failed

```json
{
  "lock_owner": "server-generated-lock-owner",
  "stage": "slicing",
  "error_code": "SLICER_TIMEOUT",
  "error_message": "short sanitized summary"
}
```

Worker must not submit `retryable`.

## 4. Response Structures

### Pending Response

```json
{
  "jobs": [
    {
      "job_id": 1,
      "file_id": 10,
      "file_sync_job_id": 20,
      "order_no": "M3D...",
      "input_relative_path": "files/order/model.stl",
      "input_sha256": "<64 hex>",
      "input_size_bytes": 123,
      "profile_key": "bambu-p1s",
      "profile_version": "phase05-b",
      "profile_sha256": "<64 hex>",
      "slice_params": {},
      "slice_params_sha256": "<64 hex>",
      "slice_cache_key_version": "1.0",
      "slice_cache_key_sha256": "<64 hex>",
      "required_slicer_package_version": "2.7.2+dfsg-1build2",
      "required_parser_version": "phase05-c-parser-v1"
    }
  ]
}
```

Pending response must not include:

- absolute paths
- Worker token
- database path
- payment data
- complete customer private information

### Lock Response

```json
{
  "job_id": 1,
  "attempt_no": 1,
  "lock_owner": "server-generated-lock-owner",
  "lease_expires_at_ms": 0,
  "created_attempt": true
}
```

### Lease Response

```json
{
  "job_id": 1,
  "lease_expires_at_ms": 0,
  "lease_renewed_at_ms": 0
}
```

### State Transition Response

```json
{
  "job_id": 1,
  "status": "slicing",
  "lease_expires_at_ms": 0
}
```

### Result Response

```json
{
  "job_id": 1,
  "status": "completed",
  "parser_quote_ready": true,
  "parse_cache_key_sha256": "<64 hex>"
}
```

`status` is decided by the server:

- `completed` when metrics are valid and quote-ready.
- `partial` otherwise.

## 5. State Transitions

Allowed state path:

```text
pending -> locked -> slicing -> sliced -> parsing -> completed
pending -> locked -> slicing -> sliced -> parsing -> partial
pending -> locked/slicing/sliced/parsing -> failed
failed -> locked, only for retryable failure and attempts remaining
```

Disallowed:

- Worker directly setting `completed` or `partial`.
- `completed` overwritten by `failed`.
- `partial` overwritten by `failed`.
- changing order status from any slicing API.
- changing quote or payment records from any slicing API.

Helper mapping:

- pending list: `listPendingSlicingJobsForWorker(db, authenticated_worker_id)`
- lock: `claimSlicingJob`
- lease: `renewSlicingJobLease`
- slicing: `markSlicingJobSlicing`
- sliced: `markSlicingJobSliced`
- parsing: `markSlicingJobParsing`
- result: `completeSlicingJobResult`
- failed: `failSlicingJob`

## 6. Lock Replay

First-version lock replay behavior:

If the same authenticated Worker repeats `/lock` for a job that is:

- `locked`
- owned by the same `authenticated_worker_id`
- current lease is not expired

then return the current lock:

```json
{
  "job_id": 1,
  "attempt_no": 1,
  "lock_owner": "existing-lock-owner",
  "lease_expires_at_ms": 0,
  "created_attempt": false
}
```

Must not:

- increment `attempt_count`
- create a new attempt row
- rotate `lock_owner`

Other states return `409`.

Security boundary:

- replay is allowed only for the same authenticated Worker.
- replay is not accepted from another Worker even if the request body knows `job_id`.

## 7. Lease

Lease design:

- Server-controlled lease duration: 120 seconds.
- Worker renew interval recommendation: every 30 seconds.
- Future implementation may move the duration to configuration.

Rules:

- request body contains only `lock_owner`.
- server uses `authenticated_worker_id`.
- `now_ms < lease_expires_at_ms` is required.
- expired lease returns `409`.
- old Worker cannot revive an expired lease by itself.
- each valid `/lease` call updates `lease_renewed_at_ms`.
- new expiry is `MAX(current_expiry, now_ms + configured_lease_duration)`.
- lease renewal must never shorten an existing lease.
- repeated `/lease` is a safe heartbeat, not a fixed-response idempotency operation.

## 8. Version And SHA Validation

Before entering `slicing`, the server validates:

- `actual_slicer_package_version === required_slicer_package_version`
- `actual_parser_version === required_parser_version`
- `input_sha256 === slicing_jobs.input_sha256`
- `profile_sha256 === slicing_jobs.profile_sha256`
- `slice_params_sha256 === slicing_jobs.slice_params_sha256`

Suggested error status:

- `422` for version/SHA validation mismatch.
- `409` for state or lease conflict.

Error codes:

```text
SLICER_VERSION_MISMATCH
PARSER_VERSION_MISMATCH
INPUT_SHA_MISMATCH
PROFILE_SHA_MISMATCH
SLICE_PARAMS_MISMATCH
```

## 9. Path Safety

API accepts relative metadata paths only.

For `/sliced`, allowed paths are fixed to:

```text
results/prusaslicer/<job_id>/output.gcode
results/prusaslicer/<job_id>/stdout.log
results/prusaslicer/<job_id>/stderr.log
```

Reject:

- absolute paths
- Windows drive paths
- backslash traversal
- URL encoded traversal
- `..`
- null bytes
- empty path where a path is required
- any path under another job id
- any `processing/` path
- any `failed/` path

The web server must not read arbitrary files based on Worker-submitted artifact paths.

## 10. Result Schema

Result schema limits:

- `parse_status`: `parsed` or `partial`.
- `metrics_status`: `valid` or `warning`.
- `parser_quote_ready`: boolean.
- numeric metrics must be integer and non-negative when present.
- arrays such as `warnings` and `missing_fields` have count limits.
- object fields such as `metric_sources` and `metric_validation` have size limits.

Server decides final status:

```text
parse_status = parsed AND metrics_status = valid AND server_validated_parser_quote_ready = true -> completed
parse_status IN (parsed, partial) AND (metrics_status = warning OR parser_quote_ready = false) -> partial
```

`parse_status=failed` and `metrics_status=invalid` are forbidden on `/result`. Parser failure or invalid metrics must be reported through `/failed`.

`parser_quote_ready` submitted by the Worker is validated by the server. The database stores the server-validated value.

Server must not write quote/order/payment values from this result.

## 11. Error Structure

Unified error response:

```json
{
  "error": {
    "code": "STATE_CONFLICT",
    "message": "Job state does not allow this transition",
    "retryable": false
  }
}
```

HTTP mapping:

- `400`: invalid JSON or malformed request.
- `401`: Worker authentication failed.
- `403`: Worker disabled or Worker ownership not allowed.
- `404`: job not found.
- `409`: state conflict, lock conflict, or lease expired.
- `413`: request body too large.
- `422`: version, SHA, or business field validation failed.
- `500`: internal server error.

Error response must not include:

- SQL
- server filesystem path
- token
- stack trace
- private key or payment diagnostic data

## 12. Request Limits

Design limits:

- Result endpoint max body: 256 KB.
- Other state endpoints max body: 32 KB.
- `warnings`: max 50 items.
- each warning: max 500 characters.
- `error_message`: max 500 characters after sanitization.
- all string fields have explicit length limits.
- reject unbounded arrays and deeply nested JSON.

## 13. Idempotency

Idempotent endpoints:

- `/lease`
- `/slicing`
- `/sliced`
- `/parsing`
- `/result`
- `/failed`

Same `job_id`, `lock_owner`, and same payload:

- return original result, or
- return a safe idempotent success response.

Different payload after a prior accepted payload:

- return `409`.
- use `IDEMPOTENCY_PAYLOAD_CONFLICT`.

Rules:

- compare normalized schema fields, not raw JSON strings.
- never increment attempt count on repeated state report.
- never create a new attempt on repeated state report.
- never overwrite terminal `completed` or `partial`.
- never let `failed` overwrite `completed` or `partial`.

## 14. Logging

Allowed logs:

- `job_id`
- `worker_id`
- endpoint/action
- state
- error code
- HTTP status
- duration

Forbidden logs:

- Worker token
- full customer file name
- complete customer private information
- full G-code
- full stdout/stderr
- WeChat secrets
- payment data
- private keys

## 15. Task Creation Boundary

Phase05-F does not add a Worker task creation API.

Worker can only:

- list pending slicing jobs
- lock/lease jobs
- report execution state
- report metadata/result/failure

Slicing task creation remains a future Operator API or internal server workflow.

Worker must not be allowed to arbitrarily create a `file_id` slicing task.

## 16. Test Design

Phase05-F implementation should include at least:

1. Missing token returns `401`.
2. Wrong token returns `401`.
3. Worker identity comes from token/auth context.
4. Body-forged `worker_id` is ignored.
5. Worker A cannot see Worker B jobs.
6. Worker A cannot lock Worker B jobs.
7. Pending response does not include sensitive fields.
8. Lock owner is generated by server.
9. Client cannot specify lease times.
10. Lock replay does not increase attempt count.
11. Two Workers competing: one succeeds, one returns `409`.
12. Lease renewal succeeds before expiry.
13. Expired lease returns `409`.
14. Version mismatch returns `422`.
15. Input SHA mismatch returns validation error.
16. Profile SHA mismatch returns validation error.
17. Slice params SHA mismatch returns validation error.
18. Absolute artifact path is rejected.
19. Path traversal is rejected.
20. Zero-size G-code metadata is rejected.
21. Oversized result payload returns `413`.
22. Worker cannot submit `completed` as status.
23. Server decides `completed`.
24. Server decides `partial`.
25. Failed retryability is decided by server.
26. Error message is sanitized.
27. Repeated result with same payload is idempotent.
28. Repeated result with different payload returns `409`.
29. `completed` cannot be overwritten by `failed`.
30. API does not modify orders.
31. API does not modify quote data.
32. API does not modify payment data.
33. WeChat Pay regression tests still pass.
34. Existing Phase03 file sync API still passes.
35. `npm test`, `npm run lint`, and `npm run build` pass.

## 17. Production Impact

Design-only phase.

Production impact:

- no production deployment
- no runtime configuration change
- no database migration
- no Worker service change
- no PrusaSlicer execution
- no payment or WeChat Pay change
- no upload limit change
- no quote/order change

Future implementation impact to review before deployment:

- Worker token identity model must be made explicit.
- Existing Phase03 `x-make3d-worker-id` behavior must not leak into slicing ownership.
- Body limits and error sanitization must be enforced before accepting result payloads.

## 18. Phase05-F Implementation Recommendation

Recommended implementation order after approval:

1. Add a slicing-specific Worker auth helper that maps `MAKE3D_WORKER_TOKEN` to `wsl-worker-01`.
2. Add shared response/error helpers for slicing Worker API.
3. Add request body limit and JSON schema validation helpers.
4. Add relative artifact path validation.
5. Add lock replay helper or route logic before implementing `/lock`.
6. Implement pending and lock routes first.
7. Implement lease and state transition routes.
8. Implement result and failed routes last.
9. Add tests for security, ownership, idempotency, and non-interference with orders/quotes/payments.
10. Run full test/lint/build before any production deployment discussion.

Stop condition:

- Do not implement Phase05-F routes until this design is approved.

## 19. Revision: API Design Correction

Date: 2026-07-15
Status: design revision only

This revision supersedes any broader or ambiguous text above where it conflicts with the rules below.

### Result Terminal Matrix

`POST /api/worker/slicing/jobs/:id/result` accepts only:

- `parse_status=parsed`
- `parse_status=partial`
- `metrics_status=valid`
- `metrics_status=warning`

It rejects:

- `parse_status=failed`
- `metrics_status=invalid`

Terminal mapping:

```text
parse_status=parsed AND metrics_status=valid AND server_validated_parser_quote_ready=true
  -> completed

parse_status IN (parsed, partial) AND (metrics_status=warning OR parser_quote_ready=false)
  -> partial

all other combinations allowed into /result
  -> partial

parse_status=failed OR metrics_status=invalid
  -> must use /failed
```

The server must not convert parser failure into `partial`.

The server validates submitted `parser_quote_ready`; it is not trusted unconditionally.

### Server-Computed Parse Cache Key

The Worker may submit `parse_cache_key_version` and `parse_cache_key_sha256`, but the server recomputes and stores the authoritative value.

Canonical input object:

```json
{
  "schema_version": "1.0",
  "gcode_sha256": "",
  "parser_version": ""
}
```

Rules:

- stable JSON serialization
- UTF-8 bytes
- SHA-256 digest
- mismatch returns `422`
- error code: `PARSE_CACHE_KEY_MISMATCH`
- database stores only the server-computed parse cache key

### Artifact Path Binding

`POST /sliced` accepts only job-owned result paths:

```text
results/prusaslicer/<job_id>/output.gcode
results/prusaslicer/<job_id>/stdout.log
results/prusaslicer/<job_id>/stderr.log
```

Reject:

- any other job directory
- `processing/` paths
- `failed/` paths
- absolute paths
- backslashes
- URL-encoded traversal
- `..`
- null bytes

### Expired Job Reconciliation

Design an internal helper:

```text
reconcileExpiredSlicingJobs
```

This helper is not a public Worker API.

Recovery model:

```text
expired locked:
  current attempt -> expired
  main job -> failed
  error -> WORKER_LEASE_EXPIRED_LOCKED
  retryable -> true

expired slicing:
  current attempt -> expired
  main job -> failed
  error -> WORKER_LEASE_EXPIRED_SLICING
  retryable -> true

expired sliced:
  preserve existing G-code metadata
  expire current attempt
  main job remains retryable
  next pending payload may include resume_from=sliced

expired parsing:
  expire current attempt
  main job remains retryable
  next pending payload may include resume_from=parsing
```

Artifact reuse rule:

- only the same `artifact_worker_id` may reuse local artifacts.
- a different Worker must not assume G-code exists locally.
- an old Worker cannot recover itself through `/lease`.

New lock behavior after reconciliation:

- creates a new attempt.
- issues a new `lock_owner`.
- increments attempt accounting according to the retry policy.
- may include `resume_from` in the pending payload only when artifact reuse is valid.

### Lease Semantics

`/lease` is a safe retryable heartbeat, not a fixed-response idempotency endpoint.

Each valid call:

- updates `lease_renewed_at_ms`.
- computes `new_expiry = MAX(current_expiry, now_ms + configured_lease_duration)`.
- never shortens the lease.

Expired lease:

- returns `409`.
- error code: `LEASE_EXPIRED`.

### Per-Endpoint Idempotency Comparison

Do not compare raw JSON strings. Compare normalized schema fields.

`/slicing` compares:

- `actual_slicer_package_version`
- `actual_parser_version`
- `input_sha256`
- `profile_sha256`
- `slice_params_sha256`

`/sliced` compares:

- `actual_slicer_package_version`
- `slicer_banner_version`
- `slice_duration_ms`
- `exit_code`
- `gcode_relative_path`
- `gcode_size_bytes`
- `gcode_sha256`
- `stdout_relative_path`
- `stderr_relative_path`

`/parsing` compares:

- `actual_parser_version`
- `gcode_sha256`

`/result` compares:

- `gcode_sha256`
- server-computed `parse_cache_key_sha256`
- `parse_status`
- `metrics_status`
- `parser_quote_ready`
- normalized `metrics`
- normalized `metric_sources`
- normalized `metric_validation`
- `missing_fields`
- `warnings`

`/failed` compares:

- normalized `stage`
- `error_code`
- sanitized `error_message`

Same normalized payload returns idempotent success. Different normalized payload returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`.

### Strict JSON Schema

All request schemas use `additionalProperties=false`.

Rules:

- unknown top-level fields are rejected.
- unknown nested fields are rejected.
- forbidden fields are rejected, not silently ignored.
- SHA format is `^[a-f0-9]{64}$`; uppercase SHA is rejected.
- integers must be JavaScript safe integers.
- numeric fields must have explicit maximum values.
- nested object key count, key length, value length, and depth must be limited.

### Streaming Body Limit

Implementation must not call `request.json()` before size enforcement.

Required approach:

- read the request body stream.
- count raw bytes while reading.
- stop immediately when the configured limit is exceeded.
- return `413`.

Limits:

- `/result`: 256 KB.
- other state endpoints: 32 KB.

`Content-Length` may be used only as a pre-check and must not be trusted alone.

First version accepts only:

```text
Content-Type: application/json
```

Reject compressed requests:

- `gzip`
- `br`
- `deflate`
- any other `Content-Encoding`

### Worker Ownership Hiding

Ownership errors avoid task enumeration:

- job does not exist -> `404`.
- job exists but does not belong to authenticated Worker -> `404`.
- `403` is reserved for authenticated but disabled Worker credentials.

### Response Cache Policy

All Worker slicing API responses include:

```text
Cache-Control: no-store
```

Responses containing `lock_owner` additionally include:

```text
Pragma: no-cache
```

Logging must not record `lock_owner`.

### Worker Error Code Policy

Design a `WorkerErrorCodePolicy` with:

- `error_code`
- `allowed_stage`
- `retryable`
- `public_message`

Rules:

- Worker cannot submit `retryable`.
- unknown `error_code` returns `422 UNKNOWN_WORKER_ERROR_CODE`.
- submitted `stage` must match the current task state.
- `error_message` is sanitized and truncated.

### Constant-Time Token Comparison

Do not compare variable-length token buffers directly.

Implementation design:

1. SHA-256 hash the expected token.
2. SHA-256 hash the received token.
3. Compare the fixed 32-byte hashes with `timingSafeEqual`.

Do not log:

- raw token
- token hash

### Additional Implementation Tests

Future Phase05-F implementation must add at least:

1. `parse_status=failed` cannot pass `/result`.
2. `metrics_status=invalid` cannot pass `/result`.
3. parser failure uses `/failed`.
4. server recomputes parse cache key.
5. wrong parse cache key returns `422`.
6. job 100 cannot submit job 99 artifact path.
7. `/sliced` rejects `failed/` directory paths.
8. `/sliced` rejects `processing/` directory paths.
9. expired `locked` recovery.
10. expired `slicing` recovery.
11. expired `sliced` recovery.
12. expired `parsing` recovery.
13. different `artifact_worker_id` cannot reuse G-code.
14. repeated `/lease` extends but never shortens.
15. expired `/lease` returns `409`.
16. same semantic JSON with different field order is idempotent.
17. different payload returns `409`.
18. unknown field is rejected.
19. nested unknown field is rejected.
20. uppercase SHA is rejected.
21. value over safe integer is rejected.
22. missing `Content-Length` with oversized body still returns `413`.
23. compressed request is rejected.
24. Worker A querying Worker B job returns `404`.
25. Worker API response includes `Cache-Control: no-store`.
26. `lock_owner` is not written to logs.
27. unknown Worker error code returns `422`.
28. stage mismatch returns `422`.

### Implementation Readiness

This revision is design-only and makes the Phase05-F API contract stricter. It is suitable to enter API implementation only after explicit approval.

## 20. Final Contract Freeze

Date: 2026-07-15
Status: final contract freeze, design only

This section is the authoritative Phase05-F API contract. If earlier sections conflict with this section, this section wins.

### Final Result Matrix

`completed` is allowed only when all conditions are true:

```text
parse_status = parsed
metrics_status = valid
server_validated_parser_quote_ready = true
```

All other combinations that are allowed to enter `/result` produce `partial`.

Examples:

```text
parse_status=partial AND metrics_status=valid AND parser_quote_ready=true
  -> partial
```

`/result` still rejects:

- `parse_status=failed`
- `metrics_status=invalid`

Parser failure or invalid metrics must use `/failed`.

### Parser Quote Ready Consistency

Design helper:

```text
validateParserResultConsistency
```

The Worker submits `parser_quote_ready`, but the server must validate consistency across:

- `parse_status`
- `metrics_status`
- `parser_quote_ready`
- `metric_validation`
- `missing_fields`
- `invalid_fields`

At minimum, reject:

- `parser_quote_ready=true` when `invalid_fields` is non-empty.
- `parser_quote_ready=true` when `metric_validation.quote_ready=false`.
- `metrics_status=valid` when `metric_validation` contains invalid fields.

Failure response:

```text
422 PARSER_VALIDATION_INCONSISTENT
```

The database stores the server-validated `parser_quote_ready` value, not the Worker-submitted value blindly.

### Expired State Recovery

Internal helper:

```text
reconcileExpiredSlicingJobs
```

For all active states with expired lease:

- current attempt `status=expired`.
- main job `status=failed`.
- clear `lock_owner`.
- clear `locked_at_ms`.
- clear `lock_expires_at_ms`.
- clear `lease_expires_at_ms`.

Server-generated internal error codes:

- `WORKER_LEASE_EXPIRED_LOCKED`
- `WORKER_LEASE_EXPIRED_SLICING`
- `WORKER_LEASE_EXPIRED_SLICED`
- `WORKER_LEASE_EXPIRED_PARSING`

These error codes have `source=server` and must not be accepted from the Worker.

For expired `sliced` and `parsing`, preserve:

- G-code metadata.
- `artifact_worker_id`.

These preserved fields are used only to decide whether resume is allowed.

### Pending Includes Retryable Failed Jobs

`GET /pending` returns:

- `pending` jobs.
- `failed` jobs where `error_code` is retryable and `attempt_count < max_attempts`.

Worker ownership remains mandatory:

```text
input_worker_id = authenticated_worker_id
```

Jobs owned by another Worker are hidden as `404` or omitted from pending results.

### Resume From

Pending payload includes:

```json
{
  "resume_from": null
}
```

Allowed values:

- `null`
- `sliced`
- `parsing`

Rules:

- ordinary `pending`: `null`.
- expired `locked`: `null`.
- expired `slicing`: `null`.
- `WORKER_LEASE_EXPIRED_SLICED`: `resume_from=sliced` only when `artifact_worker_id=authenticated_worker_id` and G-code metadata is complete.
- `WORKER_LEASE_EXPIRED_PARSING`: `resume_from=parsing` only when `artifact_worker_id=authenticated_worker_id` and G-code metadata is complete.
- different Worker: `resume_from=null`; local artifacts must not be reused.

### Recovery State Path

A new `/lock` after retryable failure:

- creates a new attempt.
- generates a new `lock_owner`.

Normal path:

```text
locked -> slicing
```

Resume path:

```text
locked -> parsing
```

The resume path is allowed only when:

- `resume_from` is `sliced` or `parsing`.
- `authenticated_worker_id = artifact_worker_id`.
- Worker resubmits and the server validates `gcode_sha256`.

Ordinary jobs must not move directly from `locked` to `parsing`.

Resume parsing must not rerun PrusaSlicer.

### Terminal Replay Through Attempt Table

Terminal replay applies to:

- `/result`
- `/failed`

After a terminal state, the main job `lock_owner` is cleared. Replay must validate the request `lock_owner` against `slicing_job_attempts`.

Required checks:

- `attempt.slicing_job_id = URL job_id`.
- `attempt.worker_id = authenticated_worker_id`.

Same normalized payload returns the original terminal result.

Different normalized payload returns:

```text
409 IDEMPOTENCY_PAYLOAD_CONFLICT
```

Replay must not:

- create a new attempt.
- overwrite terminal state.

### Sliced Success Conditions

`/sliced` success requires:

- `exit_code === 0`.
- `gcode_size_bytes > 0`.
- `gcode_sha256` is exactly 64 lowercase hex characters.
- paths exactly equal:

```text
results/prusaslicer/<job_id>/output.gcode
results/prusaslicer/<job_id>/stdout.log
results/prusaslicer/<job_id>/stderr.log
```

If `exit_code` is non-zero, the Worker must use `/failed`.

### Final Error Code Policy

`WorkerErrorCodePolicy` entries must include:

- unique `error_code`.
- unique `stage`.
- `retryable`.
- `public_message`.
- `source`: `worker` or `server`.

Server-only error codes:

- `WORKER_LEASE_EXPIRED_LOCKED`
- `WORKER_LEASE_EXPIRED_SLICING`
- `WORKER_LEASE_EXPIRED_SLICED`
- `WORKER_LEASE_EXPIRED_PARSING`

Worker-submitted error codes must be on the whitelist.

Unknown Worker error code returns:

```text
422 UNKNOWN_WORKER_ERROR_CODE
```

### Content Type And Encoding

Allowed content types:

- `application/json`
- `application/json; charset=utf-8`

Media type must be parsed, not compared as a raw string.

Allowed content encodings:

- missing header.
- `identity`.

Rejected content encodings:

- `gzip`
- `br`
- `deflate`
- any other encoding.

### Final Test Checklist

Future Phase05-F API implementation must add:

1. `partial + valid + true` finalizes as `partial`.
2. `parser_quote_ready` contradicting `metric_validation` returns `422`.
3. non-empty `invalid_fields` with `parser_quote_ready=true` returns `422`.
4. expired `locked`: main job `failed`, attempt `expired`.
5. expired `slicing`: main job `failed`, attempt `expired`.
6. expired `sliced`: pending returns `resume_from=sliced` when same artifact Worker and metadata is complete.
7. expired `parsing`: pending returns `resume_from=parsing` when same artifact Worker and metadata is complete.
8. different `artifact_worker_id`: `resume_from=null`.
9. ordinary locked job cannot directly enter `parsing`.
10. resume job may enter `parsing` under the restricted conditions.
11. `/result` terminal replay succeeds through attempt `lock_owner`.
12. `/failed` terminal replay succeeds through attempt `lock_owner`.
13. terminal replay with different payload returns `409`.
14. `/sliced` rejects non-zero `exit_code`.
15. `application/json; charset=utf-8` is accepted.
16. `Content-Encoding=identity` is accepted.
17. `Content-Encoding=gzip` is rejected.

### Permission To Enter Implementation

Phase05-F may enter API implementation only after explicit user approval. This freeze itself does not implement any API, Worker behavior, database schema change, PrusaSlicer execution, real task creation, order change, quote change, payment change, WeChat Pay change, upload-limit change, or production deployment.

## 21. Implementation Specification Addendum

Date: 2026-07-15
Status: implementation specification addendum, design only

This addendum freezes implementation-ready details derived from the current parser implementation in `worker/prusaslicer-result-parser.mjs` and `reports/phase05-c-parser-implementation-final.md`.

### Parser Output Mapping

Current parser output maps into the Worker `/result` payload as follows:

- parser `result` -> API `metrics`
- parser `metric_sources` -> API `metric_sources`
- parser `validation` -> API `metric_validation`
- parser `parse.missing_fields` -> API `missing_fields`
- parser `parse.warnings` plus validation warnings -> API `warnings`

The API schema must not invent fields that the current parser does not produce.

### Complete Result Schema

Top-level `/result` request fields:

| field | type | required | nullable | constraints |
| --- | --- | --- | --- | --- |
| `lock_owner` | string | yes | no | lowercase UUID v4, 36 chars |
| `gcode_sha256` | string | yes | no | 64 lowercase hex |
| `parse_cache_key_version` | string | yes | no | enum: `1.0` |
| `parse_cache_key_sha256` | string | yes | no | 64 lowercase hex, server recomputes |
| `parse_status` | string | yes | no | enum: `parsed`, `partial` |
| `metrics_status` | string | yes | no | enum: `valid`, `warning` |
| `parser_quote_ready` | boolean | yes | no | server validates and stores server-validated value |
| `metrics` | object | yes | no | fixed schema, no unknown fields |
| `metric_sources` | object | yes | no | fixed schema, no unknown fields |
| `metric_validation` | object | yes | no | fixed schema, no unknown fields |
| `missing_fields` | string array | yes | no | normalized, deduped, sorted for idempotency |
| `warnings` | string array | yes | no | normalized, deduped, sorted for idempotency |

`metrics` fields:

| field | type | required | nullable | min | max | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `print_time_seconds` | integer | yes | yes | 0 | 2592000 | null means parser did not provide a valid value |
| `silent_print_time_seconds` | integer | yes | yes | 0 | 2592000 | null allowed |
| `filament_length_microns` | integer | yes | yes | 0 | 1000000000000 | null allowed |
| `filament_volume_mm3` | integer | yes | yes | 0 | 1000000000000 | null allowed |
| `filament_weight_mg` | integer | yes | yes | 0 | 1000000000000 | null allowed |
| `layer_count` | integer | yes | yes | 0 | 1000000 | derived from `;LAYER_CHANGE`; null allowed |
| `max_layer_z_microns` | integer | yes | yes | 0 | 1000000000 | derived from `;Z:`; null allowed |
| `filament_type` | string | yes | yes | n/a | 64 chars | null allowed |
| `printer_model` | string | yes | yes | n/a | 128 chars | null allowed |
| `nozzle_diameter_microns` | integer | yes | yes | 1 | 10000 | null allowed |
| `layer_height_microns` | integer | yes | yes | 1 | 10000 | null allowed |
| `gcode_size_bytes` | integer | yes | no | 1 | 268435456 | must match `/sliced` metadata |
| `gcode_sha256` | string | yes | no | n/a | 64 chars | 64 lowercase hex, must match top-level `gcode_sha256` |

`metric_sources` allowed keys:

| field | type | required | nullable | enum |
| --- | --- | --- | --- | --- |
| `print_time_source` | string | yes | no | `gcode_tail_stat`, `missing` |
| `filament_length_source` | string | yes | no | `gcode_tail_stat`, `missing` |
| `filament_volume_source` | string | yes | no | `gcode_tail_stat`, `missing` |
| `filament_weight_source` | string | yes | no | `gcode_tail_stat`, `missing` |
| `layer_count_source` | string | yes | no | `derived_layer_markers`, `missing` |
| `max_layer_z_source` | string | yes | no | `derived_z_markers`, `missing` |
| `filament_type_source` | string | yes | no | `gcode_config`, `missing` |
| `printer_model_source` | string | yes | no | `gcode_config`, `missing` |
| `nozzle_diameter_source` | string | yes | no | `gcode_config`, `missing` |
| `layer_height_source` | string | yes | no | `gcode_config`, `missing` |

`metric_validation` allowed keys:

| field | type | required | nullable | constraints |
| --- | --- | --- | --- | --- |
| `metrics_status` | string | yes | no | enum: `valid`, `warning`; must equal top-level `metrics_status` |
| `quote_ready` | boolean | yes | no | fixed quote-ready location |
| `invalid_fields` | string array | yes | no | fixed invalid-field location; values must be metric field names |
| `warnings` | string array | yes | no | normalized warnings from parser validation |

All objects use `additionalProperties=false`.

### Missing Numeric Semantics

Use one fixed expression:

- `null`: parser did not provide a valid value.
- `0`: valid real zero value only.
- omitted field: invalid request.

Do not convert missing metrics to `0`. Missing metrics must be consistent with:

- `missing_fields`
- `metric_sources`
- `metric_validation.invalid_fields`

Database `NULL` represents parser-missing or invalid metric values.

### Parser Consistency Rules

Design helper:

```text
validateParserResultConsistency
```

Completed condition:

```text
parse_status=parsed
metrics_status=valid
server_validated_parser_quote_ready=true
metric_validation.metrics_status=valid
metric_validation.quote_ready=true
metric_validation.invalid_fields=[]
missing_fields=[]
```

Partial condition:

```text
parse_status IN (parsed, partial)
metrics_status IN (valid, warning)
and completed condition is not met
```

Reject with `422 PARSER_VALIDATION_INCONSISTENT` when:

- top-level `metrics_status` differs from `metric_validation.metrics_status`.
- top-level `parser_quote_ready=true` and `metric_validation.quote_ready=false`.
- `metric_validation.quote_ready=true` and `metric_validation.invalid_fields` is non-empty.
- `parser_quote_ready=true` and `missing_fields` is non-empty.
- `metrics_status=valid` and `metric_validation.invalid_fields` is non-empty.
- `metrics_status=valid` and any metric with source `missing` is non-null inconsistent or required quote metric is missing.
- top-level `gcode_sha256` differs from `metrics.gcode_sha256`.
- top-level `gcode_sha256` differs from `/sliced` `gcode_sha256`.
- `metrics.gcode_size_bytes` differs from `/sliced` `gcode_size_bytes`.

Server stores the validated `parser_quote_ready`.

### Worker Error Code Policy

`stage` is not globally unique. Multiple error codes may belong to the same stage.

Each policy row has:

- unique `error_code`
- `allowed_stage` or `allowed_stages`
- `retryable`
- `public_message`
- `source`

Worker-submitted allowed codes:

| error_code | allowed_stages | retryable | source | public_message |
| --- | --- | --- | --- | --- |
| `SLICER_TIMEOUT` | `slicing` | true | worker | Slicer timed out |
| `SLICER_NON_ZERO_EXIT` | `slicing` | false | worker | Slicer exited unsuccessfully |
| `SLICER_OUTPUT_MISSING` | `sliced` | true | worker | Slicer output was not found |
| `SLICER_OUTPUT_EMPTY` | `sliced` | false | worker | Slicer output was empty |
| `SLICER_GCODE_SHA_MISMATCH` | `sliced` | false | worker | Slicer output hash mismatch |
| `PARSER_TEMPORARY` | `parsing` | true | worker | Parser temporary failure |
| `PARSER_FAILED` | `parsing` | false | worker | Parser failed |
| `PARSER_RESULT_INVALID` | `parsing` | false | worker | Parser result was invalid |
| `WORKER_DISK_FULL` | `slicing`, `sliced`, `parsing` | true | worker | Worker disk is full |
| `WORKER_IO_ERROR` | `slicing`, `sliced`, `parsing` | true | worker | Worker file IO failed |

Server-only codes:

| error_code | allowed_stage | retryable | source | public_message |
| --- | --- | --- | --- | --- |
| `WORKER_LEASE_EXPIRED_LOCKED` | `locked` | true | server | Worker lease expired while locked |
| `WORKER_LEASE_EXPIRED_SLICING` | `slicing` | true | server | Worker lease expired while slicing |
| `WORKER_LEASE_EXPIRED_SLICED` | `sliced` | true | server | Worker lease expired after slicing |
| `WORKER_LEASE_EXPIRED_PARSING` | `parsing` | true | server | Worker lease expired while parsing |
| `SLICER_VERSION_MISMATCH` | `slicing` | false | server | Slicer version mismatch |
| `PARSER_VERSION_MISMATCH` | `slicing` | false | server | Parser version mismatch |
| `INPUT_SHA_MISMATCH` | `slicing` | false | server | Input hash mismatch |
| `PROFILE_SHA_MISMATCH` | `slicing` | false | server | Profile hash mismatch |
| `SLICE_PARAMS_MISMATCH` | `slicing` | false | server | Slice parameters hash mismatch |
| `PARSE_CACHE_KEY_MISMATCH` | `result` | false | server | Parse cache key mismatch |
| `PARSER_VALIDATION_INCONSISTENT` | `result` | false | server | Parser result consistency failed |

Worker submission of any server-only code returns `422`.

### Validation Failure State Changes

For `/slicing` version and hash mismatches:

| error_code | HTTP | main job status | attempt status | lock fields | retryable |
| --- | --- | --- | --- | --- | --- |
| `SLICER_VERSION_MISMATCH` | 422 | `failed` | `failed` | cleared | false |
| `PARSER_VERSION_MISMATCH` | 422 | `failed` | `failed` | cleared | false |
| `INPUT_SHA_MISMATCH` | 422 | `failed` | `failed` | cleared | false |
| `PROFILE_SHA_MISMATCH` | 422 | `failed` | `failed` | cleared | false |
| `SLICE_PARAMS_MISMATCH` | 422 | `failed` | `failed` | cleared | false |

The update is atomic:

- write `last_error_code`.
- write sanitized `last_error`.
- set `failed_at_ms`.
- clear `lock_owner`, `locked_at_ms`, `lock_expires_at_ms`, and `lease_expires_at_ms`.
- finish the active attempt as `failed`.

No failed validation may leave a job indefinitely `locked`.

### Resume From Authoritative Flow

No new schema is introduced.

Use main task `last_error_code` as the resume source:

1. `reconcileExpiredSlicingJobs` writes `WORKER_LEASE_EXPIRED_SLICED` or `WORKER_LEASE_EXPIRED_PARSING`.
2. `/pending` computes `resume_from` from `last_error_code`, `artifact_worker_id`, and complete G-code metadata.
3. `/lock` computes resume eligibility before changing state.
4. `/lock` response includes `resume_from`.
5. `/lock` replay response returns the same `resume_from`.
6. Claiming a resume job must not immediately clear the recovery `last_error_code`.
7. `/parsing` revalidates recovery error code, `artifact_worker_id`, and `gcode_sha256`.
8. Successful resume into `parsing` clears the recovery error state.
9. Ordinary tasks use `resume_from=null`.

### Final Lock Response

```json
{
  "job_id": 1,
  "attempt_no": 1,
  "lock_owner": "00000000-0000-4000-8000-000000000000",
  "lease_expires_at_ms": 0,
  "created_attempt": true,
  "resume_from": null
}
```

`resume_from` is one of:

- `null`
- `sliced`
- `parsing`

Lock replay must return the same `resume_from`.

### Reconcile Call Timing

First implementation calls reconciliation from:

1. `GET /pending`.
2. `POST /lock` for the target job before lock acquisition.

`GET /pending` order:

1. authenticate Worker.
2. run `reconcileExpiredSlicingJobs(authenticated_worker_id, now_ms)`.
3. query `pending` and retryable `failed` jobs.
4. return jobs.

`POST /lock`:

- run targeted expired-job reconciliation for the target job before locking.
- the operation must be transaction safe.
- repeated reconciliation must be idempotent.
- must not duplicate attempts.
- must not overwrite original error evidence.

### Lock Request Protocol

`POST /api/worker/slicing/jobs/:id/lock` request body:

- zero bytes: accepted.
- any non-empty body: `400 UNEXPECTED_REQUEST_BODY`.
- empty body does not require `Content-Type`.

### URL Job ID Rule

`job_id` must be:

- decimal positive integer.
- `>= 1`.
- JavaScript safe integer.

Reject:

- `0`
- negative number
- decimal number
- scientific notation
- leading/trailing whitespace
- non-digit characters

### Lock Owner Rule

`lock_owner` format:

- UUID v4.
- lowercase.
- standard 36 characters.

The same schema applies to:

- `/lease`
- `/slicing`
- `/sliced`
- `/parsing`
- `/result`
- `/failed`

Never log `lock_owner`.

### Idempotency Normalization

Use fixed-key stable JSON over normalized objects.

Rules:

- `missing_fields`: trim strings, reject non-strings, dedupe, sort.
- `warnings`: trim strings, reject non-strings, dedupe, sort.
- `metric_sources`: fixed schema and stable field order.
- `metric_validation`: fixed schema and stable field order.
- do not compare raw JSON text.

### Addendum Test Checklist

Future implementation tests must include:

1. `metric_validation` unknown field is rejected.
2. `metric_sources` unknown field is rejected.
3. missing metric is stored as `NULL`.
4. missing metric is not converted to `0`.
5. `invalid_fields` fixed path is `metric_validation.invalid_fields`.
6. multiple error codes may belong to the `slicing` stage.
7. server-only error code cannot be submitted by Worker.
8. version mismatch has explicit failed-state transition.
9. pending calls reconciliation.
10. lock performs targeted reconciliation before claim.
11. lock response includes `resume_from`.
12. lock replay preserves `resume_from`.
13. claiming resume task keeps recovery source until `/parsing`.
14. entering resume `/parsing` clears recovery source.
15. empty lock body succeeds.
16. non-empty lock body is rejected.
17. `job_id=0` is rejected.
18. scientific notation job id is rejected.
19. non-UUID `lock_owner` is rejected.
20. `missing_fields` different order remains idempotent.
21. `warnings` different order remains idempotent.

### Direct Implementation Readiness

With this addendum, Phase05-F has an implementation-ready API contract. API implementation still requires explicit user approval.
