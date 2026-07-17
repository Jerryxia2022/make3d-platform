# Make3D Local Order Workbench

Phase06-A3-A local order workbench MVP.

Run locally only:

Load the protected local env file, then start the server. Do not put the token
on the command line:

```bash
set -a
. /etc/make3d-order-workbench.env
set +a
cd /mnt/c/Users/21899/Documents/make3d-platform-phase06-a2-rc
node worker/order-workbench/server.mjs
```

Default address:

```text
http://127.0.0.1:5177
```

Safety boundaries:

- Binds only `127.0.0.1` or `localhost`.
- Browser never receives `MAKE3D_LOCAL_WORKBENCH_TOKEN`.
- Cloud API calls are `GET` only.
- Local file checks are limited to `/srv/make3d-worker/files`.
- Directory opening uses `POST`, CSRF, same-origin checks, safe path validation, size check, and SHA-256 verification.
- Local one-shot slicing is manual only, guarded by a second confirmation page, and writes only local Workbench state.
- Local drafts are saved only in `/srv/make3d-worker/order-workbench/workbench.db`.
- This phase does not create online `slicing_job` rows, modify online order price, modify online lead time, send replies, modify payment/refund/WeChat Pay, or write production database rows.

Stop the temporary server:

```bash
pkill -f 'worker/order-workbench/server.mjs'
```

Confirm the listener is local-only:

```bash
ss -ltnp | grep ':5177'
```

Confirm no PrusaSlicer process remains:

```bash
pgrep -af prusa-slicer || true
```

Back up the local Workbench database:

```bash
install -d -m 750 /srv/make3d-worker/order-workbench/backups
cp /srv/make3d-worker/order-workbench/workbench.db \
  /srv/make3d-worker/order-workbench/backups/workbench.$(date +%Y%m%d-%H%M%S).db
chmod 600 /srv/make3d-worker/order-workbench/backups/workbench.*.db
```
