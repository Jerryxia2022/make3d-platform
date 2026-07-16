# Phase04 Operational Validation Final

Date: 2026-07-14
Status: passed

## 1. TEST订单号

```text
M3D20260714062902874827
```

TEST customer:

```text
customer_id=5
```

Validation order note:
- Created as a new TEST-only validation order.
- No historical backfill was executed.
- No payment was created.

## 2. file_id

```text
file_id=33
job_id=1
order_id=29
```

## 3. 文件大小

```text
169 bytes
```

Source file:

```text
/app/uploads/1784010542653-phase04-validation-874827.stl
```

Source file check:

```text
SOURCE_EXISTS=true
SOURCE_SIZE=169
```

## 4. 云端状态变化

Initial cloud job:

```json
{
  "job_id": 1,
  "file_id": 33,
  "order_id": 29,
  "order_no": "M3D20260714062902874827",
  "filename": "1784010542653-phase04-validation-874827.stl",
  "filesize": 169,
  "relative_path": "1784010542653-phase04-validation-874827.stl",
  "sha256": "121d6717f78e4dfaa26b15710bdc1d9d596a3c670e415aa6b9f7e926cb5fba66"
}
```

Observed transition:

```text
pending -> locked -> verified
```

Final cloud job:

```json
{
  "id": 1,
  "sync_status": "verified",
  "attempt_count": 1,
  "worker_id": "wsl-worker-01",
  "sha256": "121d6717f78e4dfaa26b15710bdc1d9d596a3c670e415aa6b9f7e926cb5fba66",
  "local_sha256": "121d6717f78e4dfaa26b15710bdc1d9d596a3c670e415aa6b9f7e926cb5fba66",
  "last_error": null
}
```

Post-validation pending API:

```text
POST_VALIDATION_PENDING_STATUS=200
POST_VALIDATION_PENDING_BODY={"jobs":[]}
```

Duplicate sync check:

```text
JOB_DUPLICATE_COUNT=1
```

## 5. WSL路径

```text
/srv/make3d-worker/files/M3D20260714062902874827/33-1784010542653-phase04-validation-874827.stl
```

Local file check:

```text
-rw------- 1 make3d-worker make3d-worker 169 Jul 14 14:29 /srv/make3d-worker/files/M3D20260714062902874827/33-1784010542653-phase04-validation-874827.stl
```

## 6. SHA256结果

Cloud SHA-256:

```text
121d6717f78e4dfaa26b15710bdc1d9d596a3c670e415aa6b9f7e926cb5fba66
```

Local SHA-256:

```text
121d6717f78e4dfaa26b15710bdc1d9d596a3c670e415aa6b9f7e926cb5fba66
```

Result:

```text
SHA_MATCH=yes
```

## 7. Worker日志摘要

WSL systemd log:

```text
Started make3d-file-sync-worker.service - Make3D Local File Sync Worker.
[make3d-worker:wsl-worker-01] worker started
```

Heartbeat:

```json
{
  "worker_id": "wsl-worker-01",
  "hostname": "Dell7420Plus",
  "version": "phase04-a",
  "status": "idle"
}
```

Token log checks:

```text
TOKEN_IN_WSL_JOURNAL=no
TOKEN_IN_DOCKER_LOGS=no
```

Docker log scan:

```text
DOCKER_LOG_SCAN_MATCH=no
```

## 8. systemd状态

```text
Loaded: loaded (/etc/systemd/system/make3d-file-sync-worker.service; enabled; preset: enabled)
Active: active (running)
Main PID: 2682 (node)
```

## 9. 是否通过

Passed.

Validated:
- Worker API returned TEST pending job.
- WSL Worker locked the job.
- WSL Worker downloaded the file.
- local file exists under `/srv/make3d-worker/files/`.
- local file size is correct.
- cloud SHA-256 equals local SHA-256.
- Worker reported `verified`.
- pending queue is empty after sync.
- no duplicate sync job was created.
- source upload file still exists.
- no payment record was created for the TEST validation order.

## 10. 限制和安全确认

Not performed:
- no PrusaSlicer installation
- no upload limit change
- no quote logic change
- no order status logic change
- no WeChat Pay change
- no historical file backfill
- no Phase05 work

Production state checks:

```text
PAYMENT_COUNT=0
SOURCE_EXISTS=true
SOURCE_SIZE=169
```

Notes:
- The validation used one new TEST-only order file to trigger Phase03 future-order sync.
- The test order remains unpaid and was not used for payment validation.
- Console rendering of Chinese order status may appear mojibake in SSH output, but no payment state or production workflow was advanced by the Worker.

## Final Result

Phase04-A Operational Validation passed.

Do not enter Phase05 until separately approved.
