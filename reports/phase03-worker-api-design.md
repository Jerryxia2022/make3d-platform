# Phase03 Worker API Design Report

Date: 2026-07-14
Status: approved for implementation

## 1. Current Upload File Flow

Order file records are stored in `files`.

Phase03 must use `files` as the sync source. It must not use `quote_draft_files`.

Phase03 does not change:
- upload limits
- upload validation
- quote calculation
- order status flow
- WeChat Pay logic or configuration
- production deployment

## 2. files Table Confirmation

The Worker sync source is `files` with these relevant fields:
- `id`
- `order_id`
- `filename`
- `filepath`
- `filesize`
- `created_at`

`files.filepath` remains the server-side source path. The Worker download API must verify that the resolved file path stays inside `UPLOAD_DIR`.

## 3. local_file_sync_jobs Design Confirmation

New table: `local_file_sync_jobs`.

Purpose:
- track cloud-to-local file sync tasks
- prevent duplicate sync by `file_id`
- keep sync audit history
- support Worker lock recovery and retry

Important Phase03 adjustments:
- `file_id` and `order_id` foreign keys must not use `ON DELETE CASCADE`.
- Phase03 uses `ON DELETE RESTRICT` for `file_id` and `order_id`.
- Add `source_version TEXT` for future flows such as `upload_v1`, `slice_v1`, and `ai_check_v1`.
- Phase03 does not run historical `files` backfill.
- Historical file compensation is deferred to Phase04-Backfill.
- Phase03 creates jobs only for future new order files.

## 4. Worker API Interface Design

### GET /api/worker/jobs/pending

Returns pending or retryable jobs.

Response fields:
- `job_id`
- `file_id`
- `order_id`
- `order_no`
- `filename`
- `filesize`
- `relative_path`
- `sha256`

### POST /api/worker/jobs/:id/lock

Atomically locks one job.

Allowed states:
- `pending`
- `locked` when `locked_at` is older than timeout
- `failed` when `attempt_count` is below retry limit

Implementation requirement:
- use `UPDATE ... WHERE ...` and check `changes`
- do not allow duplicate active locks

### GET /api/worker/jobs/:id/download

Streams the source file to the Worker.

Safety requirements:
- job must belong to current `worker_id`
- source path must resolve under `UPLOAD_DIR`
- path traversal must be rejected
- arbitrary server files must not be readable
- response must stream file content
- logs must not include file content

### POST /api/worker/jobs/:id/verified

Worker submits:
- `local_path`
- `local_sha256`
- `file_size_bytes`

Server verifies:
- file size matches
- SHA-256 matches

Success state:
- `verified`

### POST /api/worker/jobs/:id/failed

Worker submits a sanitized error summary.

The server must not persist:
- Worker token
- secrets
- private keys
- complete customer privacy values

## 5. Worker Token Authentication

Environment variable:
- `MAKE3D_WORKER_TOKEN`

Allowed authentication:
- `Authorization: Bearer <token>`
- optional `x-make3d-worker-token`

Forbidden:
- ordinary user session access
- admin session as Worker substitute

Missing token configuration should fail closed.

## 6. File Download Security

Download uses:
- DB job lookup
- Worker ownership check
- `UPLOAD_DIR` root resolution
- source file existence check
- stream response

The API must not read from paths outside `UPLOAD_DIR`.

## 7. Path Security

Rules:
- resolve `UPLOAD_DIR` to an absolute root
- resolve `files.filepath` to an absolute path
- require the source path to be equal to the root or inside the root
- reject `..` traversal and path-prefix tricks
- require the basename to match `stored_filename`

## 8. Permission Model

Worker API is independent from customer/admin web sessions.

Only valid Worker token requests can access:
- pending job list
- lock endpoint
- download endpoint
- verified endpoint
- failed endpoint

## 9. Database Migration Plan

```sql
CREATE TABLE IF NOT EXISTS local_file_sync_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL UNIQUE,
  order_id INTEGER NOT NULL,
  customer_id INTEGER,
  order_no TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'order_file',
  source_version TEXT NOT NULL DEFAULT 'upload_v1',
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  sha256 TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  worker_id TEXT,
  locked_at DATETIME,
  local_path TEXT,
  local_sha256 TEXT,
  local_synced_at DATETIME,
  last_error TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  worker_version TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CHECK (source_type IN ('order_file')),
  CHECK (sync_status IN ('pending', 'locked', 'downloaded', 'verified', 'local_synced', 'failed')),
  CHECK (attempt_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_local_file_sync_jobs_file
  ON local_file_sync_jobs(file_id);

CREATE INDEX IF NOT EXISTS idx_local_file_sync_jobs_pickup
  ON local_file_sync_jobs(sync_status, locked_at, attempt_count, created_at);

CREATE INDEX IF NOT EXISTS idx_local_file_sync_jobs_order
  ON local_file_sync_jobs(order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_local_file_sync_jobs_worker
  ON local_file_sync_jobs(worker_id, locked_at);

CREATE INDEX IF NOT EXISTS idx_local_file_sync_jobs_synced
  ON local_file_sync_jobs(local_synced_at);
```

Phase03 explicitly does not include:

```sql
INSERT OR IGNORE INTO local_file_sync_jobs (...)
SELECT ... FROM files ...
```

Future new order files create sync jobs during order creation only.

## 10. Test Plan

Required tests:
- no token access fails
- wrong token fails
- ordinary user session cannot access Worker API
- admin session cannot replace Worker token
- duplicate lock fails
- timeout lock recovery succeeds
- path traversal is rejected
- SHA mismatch is rejected
- missing source file download fails
- normal download succeeds
- future order files create sync jobs
- init does not backfill historical `files`

Commands:

```bash
npm test
npm run lint
npm run build
```

## 11. Rollback Plan

Code rollback:
- remove `/api/worker/jobs/*` routes
- remove Worker API backend helper module
- remove Worker API database helpers
- remove Worker API automated tests

Database rollback:
- no production deployment in Phase03
- for local development, restore a local SQLite backup or recreate the local test database
- do not delete `files`, `orders`, historical orders, or uploaded files

Configuration rollback:
- remove or stop using `MAKE3D_WORKER_TOKEN`
- do not modify WeChat Pay configuration
- do not modify upload limits

## Current Risks

- Existing development databases created from earlier Phase03 drafts may have the old cascade foreign key definition; production has not been deployed in this phase.
- `files` does not distinguish original client filename from stored filename, so Phase03 uses `files.filename` for both.
- Phase04 must define a controlled historical backfill procedure with its own report and review.

## Phase03 Prohibitions

- Do not write WSL Worker code.
- Do not install PrusaSlicer.
- Do not modify upload limits.
- Do not modify quote logic.
- Do not modify order status.
- Do not modify WeChat Pay.
- Do not deploy production.
