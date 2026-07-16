# Phase04 Operational Validation

Date: 2026-07-14
Status: blocked, not passed

## 1. TEST订单编号

Not selected.

Reason:
- The Worker could not reach a valid cloud Worker API JSON endpoint.
- `GET https://www.make3d.com.cn/api/worker/jobs/pending` returned `HTTP 404` with `text/html`.
- Because no pending job list could be read, no TEST order file was selected.

## 2. file_id

Not available.

Reason:
- No cloud `pending` job could be loaded.

## 3. 文件名（脱敏）

Not available.

Reason:
- No cloud job payload was returned.

## 4. cloud job状态变化

Expected:

```text
pending -> locked -> verified
```

Observed:

```text
Worker API request -> HTTP 404 HTML response
```

No job status transition occurred.

Diagnostic request:
- URL: `https://www.make3d.com.cn/api/worker/jobs/pending`
- Auth: Worker Token header was sent but not printed
- HTTP status: `404`
- Content-Type: `text/html; charset=utf-8`
- Body prefix: HTML document prefix

Conclusion:
- The production domain currently does not expose the Phase03 Worker API endpoint, or the endpoint has not been deployed to production.
- Operational validation cannot continue until the cloud Worker API is available at the configured `SERVER_URL`.

## 5. WSL本地路径

No synced TEST file path.

Checked:
- `/srv/make3d-worker/files/`

Result:
- no new synced file was created during this validation attempt.

## 6. SHA256结果

Not available.

Reason:
- No file was downloaded.
- No cloud job SHA-256 was returned.
- No local SHA-256 comparison could be performed.

## 7. Worker日志摘要

Service started successfully:

```text
Started make3d-file-sync-worker.service - Make3D Local File Sync Worker.
[make3d-worker:wsl-worker-01] worker started
```

Repeated Worker error:

```text
[make3d-worker:wsl-worker-01] Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Interpretation:
- Worker connected to the configured server.
- The response was HTML, not the expected JSON payload.
- No Worker Token value appeared in journal logs.

Token log check:

```text
TOKEN_IN_JOURNAL=no
```

## 8. systemd状态

Startup check:

```text
Loaded: loaded (/etc/systemd/system/make3d-file-sync-worker.service; enabled; preset: enabled)
Active: active (running)
```

After detecting cloud API 404, the service was stopped and disabled to avoid continuous polling:

```text
Loaded: loaded (/etc/systemd/system/make3d-file-sync-worker.service; disabled; preset: enabled)
Active: inactive (dead)
```

## 9. 测试是否通过

Not passed.

Passed checks:
- `/etc/make3d-worker.env` exists.
- Required keys exist: `SERVER_URL`, `WORKER_TOKEN`, `WORKER_ID`, `POLL_INTERVAL`.
- `WORKER_TOKEN` is configured and not a placeholder.
- env permission is `-r-------- make3d-worker make3d-worker`.
- Token was not found in journal logs.
- Token was not found in repository text.
- systemd service can start.
- Worker process starts.

Blocked checks:
- cloud `pending` job could not be loaded.
- TEST order file could not be selected.
- `pending -> locked -> verified` could not be observed.
- no file could be downloaded.
- local SHA-256 could not be compared with cloud SHA-256.

## 10. 问题和风险

Issue:
- Production `https://www.make3d.com.cn/api/worker/jobs/pending` returns `HTTP 404` and HTML.

Likely cause:
- Phase03 cloud Worker API has not been deployed to production, while Phase04-A was installed locally against the production domain.

Risk:
- Starting the Worker before the cloud API is deployed causes repeated harmless 404 polling logs.

Mitigation already applied:
- `make3d-file-sync-worker.service` was stopped and disabled after the 404 diagnosis.
- No customer files were deleted.
- No cloud uploads were modified.
- No order status, quote, payment, or WeChat Pay state was modified.
- No historical file backfill was executed.

Next required step:
- Deploy or otherwise expose the Phase03 Worker API on the configured cloud `SERVER_URL` with the matching server-side `MAKE3D_WORKER_TOKEN`, then rerun Phase04 Operational Validation.

Do not proceed to Phase05 before this validation passes.
