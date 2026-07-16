# Phase04-A WSL Local File Sync Worker Design Report

Date: 2026-07-14
Status: pending implementation approval

## 1. Phase03 Confirmation

Read source report:
- `reports/phase03-final.md`

Confirmed cloud Worker API exists:
- `GET /api/worker/jobs/pending`
- `POST /api/worker/jobs/:id/lock`
- `GET /api/worker/jobs/:id/download`
- `POST /api/worker/jobs/:id/verified`
- `POST /api/worker/jobs/:id/failed`

Confirmed Phase03 constraints:
- Worker API uses `MAKE3D_WORKER_TOKEN`.
- downloads require Worker ownership.
- source file path is restricted to `UPLOAD_DIR`.
- stream download is supported.
- Phase03 did not implement WSL Worker.
- Phase03 did not deploy production.

## 2. Phase04-A Goal

Implement a WSL Ubuntu local file sync Worker:

```text
Make3D cloud server
  -> Worker API
  -> WSL Ubuntu make3d-worker service
  -> local file download
  -> SHA-256 verification
  -> verified callback
```

Phase04-A does not perform historical `files` backfill. It only consumes jobs already exposed by the cloud Worker API.

## 3. Local Directory Layout

Target root:

```text
/srv/make3d-worker
├── incoming
├── processing
├── files
├── failed
└── logs
```

Directory purpose:
- `incoming`: temporary download target before checksum verification.
- `processing`: reserved workspace for future processing steps.
- `files`: verified final synced files.
- `failed`: failed job artifacts or diagnostic marker files when safe.
- `logs`: local Worker logs.

Ownership:
- recommended Linux user: `make3d-worker`
- directories should be writable by the Worker service user only.

## 4. Environment File

Target:

```text
/etc/make3d-worker.env
```

Allowed keys:

```env
SERVER_URL=https://www.make3d.com.cn
WORKER_TOKEN=replace-with-worker-token
WORKER_ID=wsl-worker-01
POLL_INTERVAL=10
```

Forbidden in this file:
- WeChat Pay private key
- WeChat Pay APIv3 key
- WeChat Pay certificate material
- database password
- unrelated production secrets

The Worker program should fail closed if `SERVER_URL` or `WORKER_TOKEN` is missing.

## 5. Worker Program Design

Recommended repo location:

```text
worker/make3d-file-sync-worker.mjs
```

Runtime:
- Node.js script using built-in `fetch`, `fs`, `crypto`, and stream APIs.
- No PrusaSlicer dependency.
- No database access.
- No direct upload directory access on the server.

Main loop:
1. Load `/etc/make3d-worker.env`.
2. Ensure `/srv/make3d-worker/*` directories exist.
3. Poll `GET /api/worker/jobs/pending`.
4. For each returned job:
   - call `POST /api/worker/jobs/:id/lock`
   - if lock fails, skip
   - download `GET /api/worker/jobs/:id/download`
   - write to `incoming/<job_id>.part`
   - calculate SHA-256 while or after writing
   - compare with API-provided SHA-256
   - move to final path under `files/<order_no>/<file_id>-<safe_filename>`
   - call `POST /api/worker/jobs/:id/verified`
5. On controlled failure:
   - move partial file to `failed` only when useful and safe
   - call `POST /api/worker/jobs/:id/failed`
   - continue polling after delay

## 6. File Naming and Path Safety

The Worker must not trust remote filenames as paths.

Rules:
- use only basename-safe filename components
- replace unsupported characters with `_`
- never write outside `/srv/make3d-worker`
- use temporary `.part` file before verification
- final move should be atomic on the same filesystem
- if target file already exists with same SHA-256, treat as idempotent and call `verified`
- if target file exists with different SHA-256, fail the job and do not overwrite automatically

## 7. Worker API Request Headers

Every request includes:

```http
Authorization: Bearer <WORKER_TOKEN>
x-make3d-worker-id: <WORKER_ID>
x-make3d-worker-version: phase04-a
```

The Worker must not print the token to logs.

## 8. systemd Service Design

Target:

```text
make3d-file-sync-worker.service
```

Recommended repo location:

```text
worker/systemd/make3d-file-sync-worker.service
```

Service behavior:
- starts after network is online
- reads `/etc/make3d-worker.env`
- runs as `make3d-worker`
- restarts on failure
- uses a conservative restart delay

Draft unit:

```ini
[Unit]
Description=Make3D Local File Sync Worker
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=make3d-worker
Group=make3d-worker
EnvironmentFile=/etc/make3d-worker.env
WorkingDirectory=/srv/make3d-worker
ExecStart=/usr/bin/node /srv/make3d-worker/make3d-file-sync-worker.mjs
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/srv/make3d-worker

[Install]
WantedBy=multi-user.target
```

## 9. Install Script Design

Recommended repo location:

```text
worker/install-worker.sh
```

Responsibilities:
- create `make3d-worker` Linux user if missing
- create `/srv/make3d-worker` directory tree
- copy Worker program to `/srv/make3d-worker`
- copy systemd unit to `/etc/systemd/system/`
- create `/etc/make3d-worker.env.example`
- do not overwrite existing `/etc/make3d-worker.env`
- run `systemctl daemon-reload`
- optionally enable service only after env file is configured

The script must not install PrusaSlicer.

## 10. Test Plan

Local static tests:
- env parser rejects missing `SERVER_URL`
- env parser rejects missing `WORKER_TOKEN`
- safe filename removes path traversal characters
- SHA-256 helper matches known content
- existing final file with same SHA is idempotent
- existing final file with different SHA is rejected

Integration test with TEST account file:
1. Confirm a TEST order file has a cloud `pending` job.
2. Start Worker with TEST `SERVER_URL`, `WORKER_TOKEN`, `WORKER_ID`.
3. Confirm cloud job changes:
   - `pending`
   - `locked`
   - `verified`
4. Confirm WSL local file exists under `/srv/make3d-worker/files`.
5. Confirm local SHA-256 equals cloud SHA-256.
6. Confirm no customer file is deleted.
7. Confirm no historical backfill is run.

Commands after implementation:

```bash
npm test
npm run lint
npm run build
```

WSL service validation commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable make3d-file-sync-worker.service
sudo systemctl start make3d-file-sync-worker.service
systemctl status make3d-file-sync-worker.service
journalctl -u make3d-file-sync-worker.service -n 100 --no-pager
```

## 11. Rollback Plan

Code rollback:
- remove `worker/make3d-file-sync-worker.mjs`
- remove `worker/systemd/make3d-file-sync-worker.service`
- remove `worker/install-worker.sh`
- remove Worker tests added in Phase04-A

WSL runtime rollback:

```bash
sudo systemctl stop make3d-file-sync-worker.service
sudo systemctl disable make3d-file-sync-worker.service
sudo rm -f /etc/systemd/system/make3d-file-sync-worker.service
sudo systemctl daemon-reload
```

Do not delete synced files unless explicitly approved.

## 12. Phase04-A Prohibitions

- Do not install PrusaSlicer.
- Do not modify upload limits.
- Do not run historical file backfill.
- Do not modify WeChat Pay.
- Do not deploy production.
- Do not delete customer files.

## 13. Implementation Stop Point

Per project management rules, Phase04-A implementation should wait for confirmation of this design report before code or WSL system changes are made.
