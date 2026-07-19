# Make3D Local Order Workbench

Phase06-A4-D local order workbench service.

Access address:

```text
http://127.0.0.1:5177
```

`http://localhost:5177` is also accepted by the Host/Origin/CSRF checks. The
service still binds only `127.0.0.1`; WSL/Windows localhost forwarding provides
the second browser name without exposing the service on `0.0.0.0`.

Install the WSL systemd service from the repository root:

```bash
sudo bash worker/order-workbench/install-service.sh
sudo systemctl start make3d-order-workbench.service
```

The installer preserves `/etc/make3d-order-workbench.env`, restricts it to
`root:make3d-worker` mode `640`, and forces the listener to
`127.0.0.1:5177` in the service command.

On WSL, the installer also restores the standard `WSLInterop` binary-format
registration when it is missing. This allows the guarded “open folder” action
to pass the verified WSL directory to Windows Explorer. If Windows interop is
temporarily unavailable, the page shows a copyable `\\wsl.localhost\...` path
instead of reporting a false success.

Service operations:

```bash
sudo systemctl start make3d-order-workbench.service
sudo systemctl stop make3d-order-workbench.service
sudo systemctl restart make3d-order-workbench.service
systemctl status make3d-order-workbench.service --no-pager
journalctl -u make3d-order-workbench.service -n 100 --no-pager
journalctl -u make3d-order-workbench.service -f
```

Confirm startup and listener safety:

```bash
systemctl is-enabled make3d-order-workbench.service
systemctl is-active make3d-order-workbench.service
ss -ltnp | grep ':5177'
```

Expected listener: `127.0.0.1:5177`. The service must never listen on
`0.0.0.0`.

Manual foreground start is retained for troubleshooting only.

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

Safety boundaries:

- Binds only `127.0.0.1` or `localhost`.
- Browser never receives `MAKE3D_LOCAL_WORKBENCH_TOKEN`.
- Cloud API reads are available for TEST and real orders. Online confirmation
  writes are allowed only for authoritative TEST orders; real orders remain
  read-only and their sync control is disabled.
- Local file checks are limited to `/srv/make3d-worker/files`.
- `LOCAL_ORDER_FILES_ROOT` is the preferred configurable root name;
  `MAKE3D_LOCAL_FILES_ROOT` remains supported for the existing protected env.
- The order detail page verifies disk existence, size, and SHA-256, shows the
  final directory/path and sync timestamp, and can manually process an existing
  pending/failed file-sync job. A valid existing file is reused without another
  download.
- Directory opening uses `POST`, CSRF, same-origin checks, safe path validation, size check, and SHA-256 verification.
- Local one-shot slicing is manual only, guarded by a second confirmation page, and writes only local Workbench state.
- Local drafts are saved only in `/srv/make3d-worker/order-workbench/workbench.db`.
- The service does not create online `slicing_job` rows, modify order status,
  modify payment/refund/WeChat Pay, or send email/WeChat notifications.

Local POST diagnostics are written to the systemd journal as
`make3d-workbench-request` and `make3d-workbench-result`. They include the URL,
method, normalized Origin/Referer origin, Cookie-presence and CSRF-presence
booleans, and status only. Token values, CSRF values, request bodies, and
customer private data are never logged.

Windows Explorer activation returns `directory-focused` only after the target
directory HWND equals `GetForegroundWindow()`. Existing and minimized windows
are reused, and a short `HWND_TOPMOST` / `HWND_NOTOPMOST` transition is used
without leaving Explorer permanently on top. A partial foreground failure is
reported as `directory-opened-not-focused` and is not treated as success.

Run the independent headed-Chrome list and Explorer acceptance suite from
Windows PowerShell:

```powershell
node scripts/phase06-workbench-browser-acceptance.mjs
```

The suite uses an isolated temporary Chrome profile, navigates directly to
`http://127.0.0.1:5177/orders`, verifies the dedicated Chrome HWND before each
Explorer action, and writes screenshots plus structured HWND evidence under
`reports/evidence/phase06-order-list-and-explorer/`.

Stop a manually started troubleshooting server:

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
