# Phase05-F API Design Revision Final

Date: 2026-07-15
Status: completed

## Scope

This phase revised the Phase05-F Worker Slicing API design only.

No API routes, Worker code, database migrations, PrusaSlicer execution, order logic, quote logic, payment logic, WeChat Pay logic, upload limits, or production deployment were changed.

## 1. Result Terminal Matrix

`POST /api/worker/slicing/jobs/:id/result` now accepts only:

- `parse_status=parsed`
- `parse_status=partial`
- `metrics_status=valid`
- `metrics_status=warning`

It rejects:

- `parse_status=failed`
- `metrics_status=invalid`

Final status mapping:

```text
parse_status=parsed AND metrics_status=valid AND parser_quote_ready=true
  -> completed

parse_status IN (parsed, partial) AND (metrics_status=warning OR parser_quote_ready=false)
  -> partial

parse_status=failed OR metrics_status=invalid
  -> must use /failed
```

Parser failure must not be written as `partial`.

## 2. Parse Cache Server Recalculation

The Worker may submit `parse_cache_key_version` and `parse_cache_key_sha256`, but the server must recompute the authoritative parse cache key.

Canonical object:

```json
{
  "schema_version": "1.0",
  "gcode_sha256": "",
  "parser_version": ""
}
```

Rules:

- stable JSON
- UTF-8
- SHA-256
- mismatch returns `422 PARSE_CACHE_KEY_MISMATCH`
- database stores only the server-computed value

## 3. Artifact Path Binding

`POST /sliced` accepts only:

```text
results/prusaslicer/<job_id>/output.gcode
results/prusaslicer/<job_id>/stdout.log
results/prusaslicer/<job_id>/stderr.log
```

It rejects:

- any other job directory
- `processing/` paths
- `failed/` paths
- absolute paths
- backslashes
- URL-encoded traversal
- `..`
- null bytes

## 4. Expired Job Recovery

Internal helper design:

```text
reconcileExpiredSlicingJobs
```

This is not a public Worker API.

Recovery rules:

- expired `locked`: current attempt becomes `expired`; main job becomes retryable `failed` with `WORKER_LEASE_EXPIRED_LOCKED`.
- expired `slicing`: current attempt becomes `expired`; main job becomes retryable `failed` with `WORKER_LEASE_EXPIRED_SLICING`.
- expired `sliced`: preserve existing artifact metadata; new attempt may resume from `sliced` only for the same `artifact_worker_id`.
- expired `parsing`: new attempt may resume from `parsing` only for the same `artifact_worker_id`.

Different Workers must not assume local G-code exists.

## 5. Lease Semantics

`/lease` is a safe retryable heartbeat.

Each valid call:

- updates `lease_renewed_at_ms`
- sets `new_expiry = MAX(current_expiry, now_ms + configured_lease_duration)`
- never shortens the lease

Expired lease returns `409 LEASE_EXPIRED`.

## 6. Per-Endpoint Idempotency

Idempotency compares normalized schema fields, not raw JSON strings.

Compared fields:

- `/slicing`: slicer version, parser version, input SHA, profile SHA, slice params SHA.
- `/sliced`: slicer version, banner version, duration, exit code, result paths, G-code size, G-code SHA.
- `/parsing`: parser version and G-code SHA.
- `/result`: G-code SHA, server-computed parse cache key, parse status, metrics status, quote readiness, normalized metrics and validation fields.
- `/failed`: normalized stage, error code, sanitized error message.

Same normalized payload is idempotent success. Different payload returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`.

## 7. Strict Schema

All Worker slicing requests use `additionalProperties=false`.

Rules:

- unknown top-level and nested fields are rejected.
- forbidden fields are rejected.
- SHA must match `^[a-f0-9]{64}$`.
- uppercase SHA is rejected.
- integers must be safe integers.
- numeric maximums, key counts, key lengths, value lengths, and nesting depth are bounded.

## 8. Streaming Body Limits

Implementation must enforce size before JSON parsing.

Limits:

- `/result`: 256 KB.
- other state endpoints: 32 KB.

Rules:

- read request body stream and count raw bytes.
- return `413` as soon as the limit is exceeded.
- `Content-Length` is only a pre-check.
- accept only `Content-Type: application/json`.
- reject compressed requests such as `gzip`, `br`, and `deflate`.

## 9. Worker Ownership Hiding

To prevent task enumeration:

- nonexistent job returns `404`.
- job owned by another Worker also returns `404`.
- `403` is reserved for authenticated but disabled Worker credentials.

## 10. Response Cache Policy

All Worker slicing API responses must include:

```text
Cache-Control: no-store
```

Responses containing `lock_owner` must also include:

```text
Pragma: no-cache
```

`lock_owner` must not be logged.

## 11. Worker Error Code Policy

Design a `WorkerErrorCodePolicy` containing:

- `error_code`
- `allowed_stage`
- `retryable`
- `public_message`

Rules:

- Worker cannot submit `retryable`.
- unknown error code returns `422 UNKNOWN_WORKER_ERROR_CODE`.
- stage must match the current task state.
- error message is sanitized and truncated.

## 12. Constant-Time Authentication

Token comparison design:

1. SHA-256 hash expected token.
2. SHA-256 hash received token.
3. Compare fixed 32-byte hashes using `timingSafeEqual`.

The raw token and token hash must never be logged.

## 13. Final Test Checklist

Future API implementation must include at least:

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

## 14. Implementation Readiness

The design now has a stricter API contract and is ready for Phase05-F API implementation after explicit approval.

Implementation must still preserve the current phase boundaries:

- no Worker program modification unless specifically approved
- no database change beyond the already frozen Phase05-E schema unless specifically approved
- no PrusaSlicer execution
- no production slicing
- no order, quote, payment, WeChat Pay, or upload-limit change
- no production deployment

## Files Updated

- `reports/phase05-f-worker-slicing-api-design.md`
- `reports/phase05-f-api-design-revision-final.md`
- `changelog/CHANGELOG.md`

## Tests

No automated tests were run because this phase changed design documentation only.
