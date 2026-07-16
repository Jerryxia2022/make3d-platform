# Phase05-F Implementation Specification Addendum

Date: 2026-07-15
Status: completed

## Scope

This addendum freezes implementation-ready details for the Phase05-F Worker Slicing API.

It is based on:

- `worker/prusaslicer-result-parser.mjs`
- `reports/phase05-c-parser-implementation-final.md`
- `reports/phase05-f-final-contract-freeze.md`

This phase did not implement API routes, modify Worker code, modify database schema, run PrusaSlicer, create real tasks, modify orders, modify quote logic, modify payment logic, modify WeChat Pay, modify upload limits, or deploy production.

## 1. Complete Result Schema

Current parser mapping:

- parser `result` maps to API `metrics`.
- parser `metric_sources` maps to API `metric_sources`.
- parser `validation` maps to API `metric_validation`.
- parser `parse.missing_fields` maps to API `missing_fields`.
- parser `parse.warnings` plus validation warnings maps to API `warnings`.

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
| `metrics` | object | yes | no | fixed schema |
| `metric_sources` | object | yes | no | fixed schema |
| `metric_validation` | object | yes | no | fixed schema |
| `missing_fields` | string array | yes | no | normalized, deduped, sorted for idempotency |
| `warnings` | string array | yes | no | normalized, deduped, sorted for idempotency |

All objects use `additionalProperties=false`.

## 2. Field Limits

`metrics` fields:

| field | type | required | nullable | min | max |
| --- | --- | --- | --- | --- | --- |
| `print_time_seconds` | integer | yes | yes | 0 | 2592000 |
| `silent_print_time_seconds` | integer | yes | yes | 0 | 2592000 |
| `filament_length_microns` | integer | yes | yes | 0 | 1000000000000 |
| `filament_volume_mm3` | integer | yes | yes | 0 | 1000000000000 |
| `filament_weight_mg` | integer | yes | yes | 0 | 1000000000000 |
| `layer_count` | integer | yes | yes | 0 | 1000000 |
| `max_layer_z_microns` | integer | yes | yes | 0 | 1000000000 |
| `filament_type` | string | yes | yes | n/a | 64 chars |
| `printer_model` | string | yes | yes | n/a | 128 chars |
| `nozzle_diameter_microns` | integer | yes | yes | 1 | 10000 |
| `layer_height_microns` | integer | yes | yes | 1 | 10000 |
| `gcode_size_bytes` | integer | yes | no | 1 | 268435456 |
| `gcode_sha256` | string | yes | no | n/a | 64 lowercase hex |

`metric_sources` allowed keys:

| field | enum |
| --- | --- |
| `print_time_source` | `gcode_tail_stat`, `missing` |
| `filament_length_source` | `gcode_tail_stat`, `missing` |
| `filament_volume_source` | `gcode_tail_stat`, `missing` |
| `filament_weight_source` | `gcode_tail_stat`, `missing` |
| `layer_count_source` | `derived_layer_markers`, `missing` |
| `max_layer_z_source` | `derived_z_markers`, `missing` |
| `filament_type_source` | `gcode_config`, `missing` |
| `printer_model_source` | `gcode_config`, `missing` |
| `nozzle_diameter_source` | `gcode_config`, `missing` |
| `layer_height_source` | `gcode_config`, `missing` |

`metric_validation` allowed keys:

| field | type | constraints |
| --- | --- | --- |
| `metrics_status` | string | enum: `valid`, `warning`; must equal top-level `metrics_status` |
| `quote_ready` | boolean | fixed quote-ready location |
| `invalid_fields` | string array | fixed invalid-field location; metric field names only |
| `warnings` | string array | normalized validation warnings |

## 3. Missing Numeric Semantics

The API uses one fixed expression:

- `null`: parser did not provide a valid value.
- `0`: valid real zero value only.
- omitted field: invalid request.

The implementation must not convert missing metrics to `0`.

Database `NULL` means the parser did not provide a valid metric value.

Missing values must be consistent with:

- `missing_fields`
- `metric_sources`
- `metric_validation.invalid_fields`

## 4. Consistency Validation

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
- `parser_quote_ready=true` while `metric_validation.quote_ready=false`.
- `metric_validation.quote_ready=true` while `metric_validation.invalid_fields` is non-empty.
- `parser_quote_ready=true` while `missing_fields` is non-empty.
- `metrics_status=valid` while `metric_validation.invalid_fields` is non-empty.
- top-level `gcode_sha256` differs from `metrics.gcode_sha256`.
- top-level `gcode_sha256` differs from `/sliced` `gcode_sha256`.
- `metrics.gcode_size_bytes` differs from `/sliced` `gcode_size_bytes`.

The database stores the server-validated `parser_quote_ready`.

## 5. Complete Error Code Table

`stage` is not globally unique. Multiple error codes may belong to the same stage.

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

Worker submission of server-only codes returns `422`.

## 6. Validation Failure State

For `/slicing` validation mismatches:

| error_code | HTTP | main job status | attempt status | lock fields | retryable |
| --- | --- | --- | --- | --- | --- |
| `SLICER_VERSION_MISMATCH` | 422 | `failed` | `failed` | cleared | false |
| `PARSER_VERSION_MISMATCH` | 422 | `failed` | `failed` | cleared | false |
| `INPUT_SHA_MISMATCH` | 422 | `failed` | `failed` | cleared | false |
| `PROFILE_SHA_MISMATCH` | 422 | `failed` | `failed` | cleared | false |
| `SLICE_PARAMS_MISMATCH` | 422 | `failed` | `failed` | cleared | false |

The state update is atomic:

- write `last_error_code`.
- write sanitized `last_error`.
- set `failed_at_ms`.
- clear `lock_owner`, `locked_at_ms`, `lock_expires_at_ms`, and `lease_expires_at_ms`.
- finish the active attempt as `failed`.

No validation failure may leave a job indefinitely `locked`.

## 7. Resume From Authoritative Flow

No new database schema is introduced.

Use main task `last_error_code` as the recovery source:

1. `reconcileExpiredSlicingJobs` writes `WORKER_LEASE_EXPIRED_SLICED` or `WORKER_LEASE_EXPIRED_PARSING`.
2. `/pending` computes `resume_from` from `last_error_code`, `artifact_worker_id`, and complete G-code metadata.
3. `/lock` computes resume eligibility before changing state.
4. `/lock` response includes `resume_from`.
5. `/lock` replay response returns the same `resume_from`.
6. claiming a resume job must not immediately clear the recovery `last_error_code`.
7. `/parsing` revalidates recovery error code, `artifact_worker_id`, and `gcode_sha256`.
8. successful resume into `parsing` clears the recovery error state.
9. ordinary tasks use `resume_from=null`.

## 8. Final Lock Response

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

`resume_from` is `null`, `sliced`, or `parsing`.

Lock replay must return the same `resume_from`.

## 9. Reconcile Call Timing

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
- must be transaction safe.
- repeated reconciliation must be idempotent.
- must not duplicate attempts.
- must not overwrite original error evidence.

## 10. Lock Request Protocol

`POST /api/worker/slicing/jobs/:id/lock` request body:

- zero bytes: accepted.
- any non-empty body: `400 UNEXPECTED_REQUEST_BODY`.
- empty body does not require `Content-Type`.

## 11. Job ID Rule

URL `job_id` must be:

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

## 12. Lock Owner Rule

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

## 13. Idempotency Normalization

Use fixed-key stable JSON over normalized objects.

Rules:

- `missing_fields`: trim strings, reject non-strings, dedupe, sort.
- `warnings`: trim strings, reject non-strings, dedupe, sort.
- `metric_sources`: fixed schema and stable field order.
- `metric_validation`: fixed schema and stable field order.
- do not compare raw JSON text.

## 14. Final Implementation Tests

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

## 15. Direct Implementation Readiness

Phase05-F now has an implementation-ready API contract, but API code must not start until explicit user approval.

Implementation must still avoid:

- Worker program changes unless separately approved.
- database schema changes unless separately approved.
- PrusaSlicer execution.
- real task creation.
- order, quote, payment, WeChat Pay, or upload-limit changes.
- production deployment.

## Files Updated

- `reports/phase05-f-worker-slicing-api-design.md`
- `reports/phase05-f-implementation-spec-addendum.md`
- `changelog/CHANGELOG.md`

## Tests

No automated tests were run because this phase changed design documentation only.
