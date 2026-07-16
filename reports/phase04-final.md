# Phase04-A Final Report - WSL Local File Sync Worker

Date: 2026-07-14
Status: completed locally, not deployed to production

## Modified Files

Added:
- `worker/make3d-file-sync-worker.mjs`
- `worker/systemd/make3d-file-sync-worker.service`
- `worker/install-worker.sh`
- `worker/make3d-worker.env.example`
- `tests/workerLocalSync.test.mjs`
- `reports/phase04-final.md`

Updated:
- `changelog/CHANGELOG.md`

Context from previous phases remains in the working tree:
- Phase03 Worker API files
- report management files

## WSL Runtime Changes

Created or installed in WSL:
- `/srv/make3d-worker`
- `/srv/make3d-worker/incoming`
- `/srv/make3d-worker/processing`
- `/srv/make3d-worker/files`
- `/srv/make3d-worker/failed`
- `/srv/make3d-worker/logs`
- `/srv/make3d-worker/make3d-file-sync-worker.mjs`
- `/etc/make3d-worker.env`
- `/etc/make3d-worker.env.example`
- `/etc/systemd/system/make3d-file-sync-worker.service`

The install script created `/etc/make3d-worker.env` with only these keys:
- `SERVER_URL`
- `WORKER_TOKEN`
- `WORKER_ID`
- `POLL_INTERVAL`

The env file currently contains a placeholder Worker token. The service was not started because a placeholder token would fail closed.

Observed service status:
- loaded: yes
- enabled: no
- active: inactive

## Worker Program

Implemented:
- polls `GET /api/worker/jobs/pending`
- locks jobs with `POST /api/worker/jobs/:id/lock`
- downloads files with `GET /api/worker/jobs/:id/download`
- writes downloads to `incoming/*.part`
- computes local SHA-256
- rejects SHA mismatch
- moves verified files atomically into `files/<order_no>/<file_id>-<filename>`
- reports success with `POST /api/worker/jobs/:id/verified`
- reports controlled failures with `POST /api/worker/jobs/:id/failed`
- writes local heartbeat JSON to `logs/heartbeat.json`

Heartbeat fields:
- `worker_id`
- `hostname`
- `version`
- `last_seen`
- `disk_free`
- `status`

No heartbeat database migration was added.

## Security Checks

Implemented:
- filename sanitization
- path traversal guard
- all local writes constrained under `/srv/make3d-worker`
- temporary `.part` download files
- atomic final move after SHA verification
- existing verified file with same SHA is idempotent
- existing verified file with different SHA is rejected
- stale `.part` files are moved to `failed`
- Worker token is never printed intentionally by the Worker
- env parser rejects disallowed keys such as WeChat Pay or secret-style keys

Not changed:
- WeChat Pay code or configuration
- upload limits
- quote logic
- order status logic
- historical file backfill
- production deployment

## Test Results

Commands run:

```bash
node --test tests/workerLocalSync.test.mjs
npm test
npm run lint
npm run build
```

Results:
- `node --test tests/workerLocalSync.test.mjs`: passed, 5 tests.
- `npm test`: passed, 184 tests.
- `npm run lint`: passed.
- `npm run build`: passed.

Worker test coverage:
- normal pending task
- lock success
- download success
- SHA match
- verified callback success
- SHA mismatch failure
- wrong Worker token failure
- path traversal rejection through path helper
- Worker restart recovery by reusing an existing verified file and moving stale `.part` files

## WSL Validation

Commands run:

```bash
wsl -e sh -lc "systemctl is-system-running"
wsl -e sh -lc "cd /mnt/c/Users/21899/Documents/make3d-platform && sudo bash worker/install-worker.sh"
wsl -e sh -lc "sudo systemctl status make3d-file-sync-worker.service --no-pager; true"
```

Results:
- WSL systemd is running.
- Node exists at `/usr/bin/node`.
- install script completed.
- service unit is loaded.
- service is inactive because it was not started with a real Worker token.

## TEST Account File Validation

Not completed in this run.

Reason:
- `/etc/make3d-worker.env` has only a placeholder `WORKER_TOKEN`.
- Running real cloud sync without the approved Worker token would either fail or create misleading verification evidence.

Required next manual step:
- Put the approved Worker token into `/etc/make3d-worker.env`.
- Start the service.
- Create or identify a TEST account order file with a `pending` cloud job.
- Confirm cloud status changes to `locked` then `verified`.
- Confirm the local file exists under `/srv/make3d-worker/files`.
- Confirm local SHA-256 equals the cloud SHA-256.

## Configuration Changes

Repo:
- no `.env.local` or `.env.production` changes.

WSL:
- `/etc/make3d-worker.env` was created with placeholder-only Worker configuration.
- no WeChat Pay key, APIv3 key, certificate, database password, or production secret was written.

## Risks

- The service is installed but not enabled or started until a real Worker token is configured.
- Real cloud TEST file sync still needs an approved Worker token and a pending TEST job.
- Existing extra directories under `/srv/make3d-worker` were not deleted or modified.
- The Worker stores final files using sanitized filenames; if two distinct unsafe filenames sanitize to the same final name for the same `file_id`, the `file_id` prefix prevents collision.

## Rollback Method

Repo rollback:
- remove `worker/make3d-file-sync-worker.mjs`
- remove `worker/systemd/make3d-file-sync-worker.service`
- remove `worker/install-worker.sh`
- remove `worker/make3d-worker.env.example`
- remove `tests/workerLocalSync.test.mjs`
- remove Phase04-A changelog and report entries

WSL rollback:

```bash
sudo systemctl stop make3d-file-sync-worker.service
sudo systemctl disable make3d-file-sync-worker.service
sudo rm -f /etc/systemd/system/make3d-file-sync-worker.service
sudo systemctl daemon-reload
```

Do not delete `/srv/make3d-worker/files` or synced customer files unless explicitly approved.

## Unfinished Items

- Real TEST account file sync verification with the approved Worker token.
- Optional service enable/start after the token is configured.
- Phase04-Backfill remains separate and was not executed.

## Next Stage Recommendation

After the real Worker token is configured, run a controlled TEST file sync validation:
1. start `make3d-file-sync-worker.service`
2. create or identify a TEST order file job
3. verify cloud `pending -> locked -> verified`
4. verify local SHA-256
5. then generate a short Phase04-A operational validation addendum
