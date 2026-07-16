# Phase05-F Final Contract Freeze

Date: 2026-07-15
Status: completed

## Scope

This phase freezes the final Worker Slicing API contract for Phase05-F.

This phase did not:

- implement API routes
- modify Worker code
- modify database schema
- start PrusaSlicer
- create real tasks
- modify orders
- modify quote logic
- modify payment logic
- modify WeChat Pay
- modify upload limits
- deploy production

## 1. Final Result Matrix

`completed` is allowed only when:

```text
parse_status = parsed
AND metrics_status = valid
AND server_validated_parser_quote_ready = true
```

Every other combination that is allowed to enter `/result` becomes `partial`.

Important explicit case:

```text
parse_status=partial
metrics_status=valid
parser_quote_ready=true
-> partial
```

`/result` rejects:

- `parse_status=failed`
- `metrics_status=invalid`

Parser failure and invalid metrics must use `/failed`.

## 2. Parser Quote Ready Server Validation

Design helper:

```text
validateParserResultConsistency
```

The server validates Worker-submitted `parser_quote_ready` against:

- `parse_status`
- `metrics_status`
- `metric_validation`
- `missing_fields`
- `invalid_fields`

Required rejection cases:

- `parser_quote_ready=true` and `invalid_fields` is non-empty.
- `parser_quote_ready=true` and `metric_validation.quote_ready=false`.
- `metrics_status=valid` while `metric_validation` contains invalid fields.

Failure:

```text
422 PARSER_VALIDATION_INCONSISTENT
```

The database stores the server-validated `parser_quote_ready`, not the raw Worker claim.

## 3. Expired State Recovery

Internal helper:

```text
reconcileExpiredSlicingJobs
```

For any active state with expired lease:

- current attempt becomes `expired`.
- main task becomes `failed`.
- `lock_owner` is cleared.
- `locked_at_ms` is cleared.
- `lock_expires_at_ms` is cleared.
- `lease_expires_at_ms` is cleared.

Server-generated internal error codes:

- `WORKER_LEASE_EXPIRED_LOCKED`
- `WORKER_LEASE_EXPIRED_SLICING`
- `WORKER_LEASE_EXPIRED_SLICED`
- `WORKER_LEASE_EXPIRED_PARSING`

The Worker must not submit these error codes.

For expired `sliced` and `parsing`, the server preserves:

- G-code metadata.
- `artifact_worker_id`.

These values are used only for controlled resume decisions.

## 4. Resume From

`GET /pending` includes `resume_from`:

- `null`
- `sliced`
- `parsing`

Rules:

- ordinary `pending`: `null`.
- expired `locked`: `null`.
- expired `slicing`: `null`.
- `WORKER_LEASE_EXPIRED_SLICED`: `sliced` only when `artifact_worker_id=authenticated_worker_id` and G-code metadata is complete.
- `WORKER_LEASE_EXPIRED_PARSING`: `parsing` only when `artifact_worker_id=authenticated_worker_id` and G-code metadata is complete.
- different Worker: `null`; local artifacts must not be reused.

`GET /pending` may return retryable failed jobs when:

- `error_code` is retryable.
- `attempt_count < max_attempts`.
- `input_worker_id = authenticated_worker_id`.

## 5. Recovery State Path

New lock after retryable failure:

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

Resume path is allowed only when:

- `resume_from` is `sliced` or `parsing`.
- `authenticated_worker_id = artifact_worker_id`.
- Worker resubmits `gcode_sha256`.
- server validates `gcode_sha256`.

Ordinary tasks cannot move directly from `locked` to `parsing`.

Resume parsing must not rerun PrusaSlicer.

## 6. Terminal Replay

Terminal replay applies to:

- `/result`
- `/failed`

After terminal completion, the main task `lock_owner` is cleared. Replay must validate the request `lock_owner` through `slicing_job_attempts`.

Required checks:

- `attempt.slicing_job_id = URL job_id`.
- `attempt.worker_id = authenticated_worker_id`.

Same normalized payload returns the original terminal result.

Different normalized payload returns:

```text
409 IDEMPOTENCY_PAYLOAD_CONFLICT
```

Terminal replay must not:

- create a new attempt.
- overwrite terminal state.

## 7. `/sliced` Success Conditions

`/sliced` succeeds only when:

- `exit_code === 0`.
- `gcode_size_bytes > 0`.
- `gcode_sha256` is 64 lowercase hex characters.
- paths exactly equal:

```text
results/prusaslicer/<job_id>/output.gcode
results/prusaslicer/<job_id>/stdout.log
results/prusaslicer/<job_id>/stderr.log
```

If `exit_code` is not `0`, the Worker must call `/failed`.

## 8. Error Code Policy

`WorkerErrorCodePolicy` must include:

- unique `error_code`
- unique `stage`
- `retryable`
- `public_message`
- `source`: `worker` or `server`

Server-only error codes:

- `WORKER_LEASE_EXPIRED_LOCKED`
- `WORKER_LEASE_EXPIRED_SLICING`
- `WORKER_LEASE_EXPIRED_SLICED`
- `WORKER_LEASE_EXPIRED_PARSING`

Worker error codes must be whitelisted.

Unknown Worker error code returns:

```text
422 UNKNOWN_WORKER_ERROR_CODE
```

## 9. Content Type

Allowed:

- `application/json`
- `application/json; charset=utf-8`

The implementation must parse by media type.

Allowed `Content-Encoding`:

- missing
- `identity`

Rejected `Content-Encoding`:

- `gzip`
- `br`
- `deflate`
- any other encoding

## 10. Final Test Checklist

Future Phase05-F API implementation must add:

1. `partial + valid + true` finalizes as `partial`.
2. `parser_quote_ready` contradicting `metric_validation` returns `422`.
3. non-empty `invalid_fields` with `parser_quote_ready=true` returns `422`.
4. expired `locked`: main task `failed`, attempt `expired`.
5. expired `slicing`: main task `failed`, attempt `expired`.
6. expired `sliced`: pending returns `resume_from=sliced`.
7. expired `parsing`: pending returns `resume_from=parsing`.
8. different `artifact_worker_id`: `resume_from=null`.
9. ordinary task cannot move from `locked` directly to `parsing`.
10. resume task may move from `locked` to `parsing` under restricted conditions.
11. `/result` terminal replay succeeds through attempt `lock_owner`.
12. `/failed` terminal replay succeeds through attempt `lock_owner`.
13. terminal replay with different payload returns `409`.
14. `/sliced` rejects non-zero `exit_code`.
15. `application/json; charset=utf-8` is accepted.
16. `Content-Encoding=identity` is accepted.
17. `Content-Encoding=gzip` is rejected.

## 11. Permission To Enter API Implementation

Phase05-F is contract-frozen and may enter API implementation only after explicit user approval.

The implementation phase must preserve these boundaries unless separately approved:

- no Worker program change
- no database schema change beyond approved schema
- no PrusaSlicer execution
- no real slicing task creation
- no order, quote, payment, WeChat Pay, or upload-limit change
- no production deployment

## Files Updated

- `reports/phase05-f-worker-slicing-api-design.md`
- `reports/phase05-f-final-contract-freeze.md`
- `changelog/CHANGELOG.md`

## Tests

No automated tests were run because this phase changed design documentation only.
