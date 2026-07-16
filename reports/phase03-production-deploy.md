# Phase03 Production Deployment

Date: 2026-07-14
Status: completed

## Scope

Deployed only Phase03 cloud Worker API:
- `local_file_sync_jobs` migration
- Worker API routes
- Worker Token verification logic
- Docker Compose passthrough for `MAKE3D_WORKER_TOKEN`

Not deployed:
- Phase04 WSL Worker code
- PrusaSlicer changes
- upload limit changes
- quote logic changes
- order status logic changes
- historical file backfill

## Production Backup

Production SQLite backup created before deployment:

```text
/opt/make3d-platform/backups/make3d.db.phase03-worker-api.20260714-135744.bak
```

Pre-deployment SQLite integrity check:

```text
INTEGRITY_CHECK=ok
```

Post-deployment SQLite integrity check:

```text
FINAL_INTEGRITY_CHECK=ok
```

## Commits

Pre-deployment production commit:

```text
7ef66166755766e337493ebe74028779e84285dc
```

Deployment commit:

```text
5566384c8f42778df834737b92d5886392acf093
```

Production was fast-forwarded to:

```text
5566384c8f42778df834737b92d5886392acf093
```

## Database Migration

After first Worker API request:

```text
LOCAL_FILE_SYNC_JOBS_TABLE_AFTER_API=present
LOCAL_FILE_SYNC_JOBS_COUNT_AFTER_API=0
```

Result:
- `local_file_sync_jobs` table exists.
- No historical `files` backfill was executed.
- The table is empty, as expected before future TEST order files are created.

## Worker Token

Configured:
- WSL `/etc/make3d-worker.env`
- production `/opt/make3d-platform/.env.production`

Safety:
- Token was not written to Git.
- Token was not printed in deployment report.
- Token was not found in Docker logs.

Token verification:

```text
TOKEN_MATCH=yes
TOKEN_SHA256_PREFIX=56bb78f8222d25a7
```

Note:
- During deployment, the Worker Token was rotated and the final matching token is the one represented by the SHA-256 prefix above.

## Docker Status

Post-deployment Docker status:

```text
NAME              IMAGE                    SERVICE   STATUS         PORTS
make3d-platform   make3d-platform-make3d   make3d    Up 3 minutes   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
```

Build result:
- `next build` completed successfully inside Docker.
- Worker API routes were present in the build output.
- Container recreated and started successfully.

Log review:

```text
TOKEN_IN_DOCKER_LOGS=no
LOG_SCAN_MATCH=no
```

No continuous 500, migration failure, Worker Token leak, APIv3 key leak, private key leak, or unhandled exception was found in the reviewed logs.

## API Tests

Endpoint:

```text
https://www.make3d.com.cn/api/worker/jobs/pending
```

Wrong token:

```text
WRONG_TOKEN_STATUS=401
WRONG_TOKEN_CONTENT_TYPE=application/json
```

Correct token:

```text
RIGHT_TOKEN_STATUS=200
RIGHT_TOKEN_CONTENT_TYPE=application/json
RIGHT_BODY={"jobs":[]}
```

Result:
- API returns JSON.
- API no longer returns HTML.
- API no longer returns 404.
- Wrong token is rejected.
- Correct token is accepted.
- No pending jobs exist yet, so the response is an empty jobs array.

## Payment And Order Impact

Production env after deployment:

```text
WECHAT_PAY_ENABLED=true
WECHAT_PAY_TEST_ONLY=true
WECHAT_PAY_JSAPI_AUTH_READY=true
WECHAT_PAY_TEST_CUSTOMER_IDS=5
```

Public payment setting after deployment:

```text
FINAL_PAYMENT_SETTINGS_WECHAT_ENABLED=0
```

Impact:
- WeChat Pay configuration remains unchanged.
- Real customer WeChat Pay entry remains closed.
- No payment status was changed.
- No order status was changed.
- No quote logic was changed.
- No upload limit was changed.
- No customer file was deleted.

## WSL Worker State

WSL Worker was not started for this deployment.

Observed state:

```text
make3d-file-sync-worker.service: disabled
make3d-file-sync-worker.service: inactive (dead)
```

## Rollback

Code rollback:

```bash
cd /opt/make3d-platform
git reset --hard 7ef66166755766e337493ebe74028779e84285dc
docker compose --env-file .env.production up -d --build
```

Database rollback if needed:

```bash
cd /opt/make3d-platform
cp backups/make3d.db.phase03-worker-api.20260714-135744.bak data/make3d.db
docker compose --env-file .env.production restart make3d
```

Rollback cautions:
- Do not delete production uploads.
- Do not delete historical orders.
- Do not delete TEST account.
- Preserve the backup file.

## Final Result

Phase03 Production Deployment passed.

Next allowed step:
- rerun Phase04-A Operational Validation with WSL Worker still under controlled TEST-only conditions.

Do not proceed to Phase05 before Phase04-A Operational Validation passes.
