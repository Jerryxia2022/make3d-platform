# Phase06 Local Order Workbench E2E Repair Final

## 1. Scope and result

- Date: 2026-07-18
- Local workbench: `http://127.0.0.1:5177` and `http://localhost:5177`
- Cloud data API used server-side: `https://www.make3d.com.cn`
- TEST order: `M3D20260718175603009` (`order_id=42`, authoritative TEST account)
- Result: the reported cross-site rejection, missing file visibility, SHA action, folder opening, and local order save failures are repaired and accepted end to end.
- No production application deploy, production database migration, payment/refund/WeChat Pay change, upload limit change, online order status change, or resident Slicing Worker was performed.

## 2. Root cause

### 2.1 `禁止跨站提交`

The response came from the standalone local Node workbench, not Vite, Nginx, Next.js middleware, the cloud API, or a browser frontend interceptor.

- Trigger: `worker/order-workbench/server.mjs`, `assertLocalPost()`.
- Validation helper: `worker/order-workbench/lib/security.mjs`, `inspectLocalRequestOrigin()`.
- The old check treated valid loopback requests too narrowly and did not produce enough request diagnostics to distinguish Host, Origin, Referer, fetch metadata, and CSRF failures.
- The workbench is a same-origin server-rendered application on port 5177. It does not use a Vite proxy, Axios, a browser-side API base URL, or cross-origin browser calls.

The repaired check accepts only the exact local origins for the configured port:

- `http://127.0.0.1:5177`
- `http://localhost:5177`

It still rejects malformed/null/foreign origins, cross-site fetch metadata, missing origin evidence, invalid Host values, and missing/incorrect CSRF tokens.

### 2.2 Open-folder false positive

The former implementation could accept a non-zero `explorer.exe` result/fallback as success even when Explorer remained in Documents. In addition, downloaded files were mode `600`, while the interactive WSL user was not in the `make3d-worker` group.

The repaired implementation:

- resolves and checks the canonical path under the configured root;
- rejects traversal and symlink escapes;
- invokes the absolute Windows PowerShell binary with a repository-owned helper;
- checks the translated Windows/WSL path with `Test-Path` before `Invoke-Item`;
- installs directories as group-readable/traversable (`750`) and files as `640`;
- enrolls the installing WSL operator in the `make3d-worker` group.

### 2.3 File-state visibility

The previous page showed only partial cloud metadata and did not prove the local file existed. The repaired detail load checks disk existence, size and SHA-256, exposes a safe JSON status endpoint, and renders the saved directory/path, status, write time, error, and verification result.

## 3. Request evidence

Real browser evidence recorded by the local service (values are deliberately not logged):

| Operation | URL | Method | Origin / Referer origin | Cookie | CSRF | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Pull/recheck | `/local/files/14/pull` | POST | `http://127.0.0.1:5177` | present | present/valid | 200 `verified` |
| SHA | `/local/files/14/verify-sha` | POST | `http://127.0.0.1:5177` | present | present/valid | 200 `sha-verified` |
| Open folder | `/local/files/14/open-directory` | POST | `http://127.0.0.1:5177` | present | present/valid | 200 `directory-opened` |
| Save local review | `/orders/42/local-review` | POST | `http://127.0.0.1:5177` | present | present/valid | 200 |
| Localhost SHA | `/local/files/14/verify-sha` | POST | `http://localhost:5177` | present | present/valid | 200 |
| Foreign origin probe | `/local/files/14/verify-sha` | POST | `http://evil.example` | not relevant | valid | 403 `禁止跨站提交` |
| Missing CSRF probe | `/local/files/14/verify-sha` | POST | trusted loopback | absent | invalid | 403 `页面校验已失效，请刷新后重试` |
| Unsupported verbs | order detail targets | PUT/PATCH/DELETE | trusted loopback | n/a | n/a | 405 |

The scripted HTTP client intentionally sent no Cookie and also passed with valid same-origin plus CSRF. The real browser did send a Cookie; the workbench recorded only `cookiePresent=true`. The local workbench does not create or consume a login/session cookie, so `SameSite`, `Secure`, `Domain`, and session-cookie configuration are not part of its authentication model.

Safe journal example:

```text
[make3d-workbench-request] {"method":"POST","path":"/local/files/14/open-directory","host":"127.0.0.1:5177","origin":"http://127.0.0.1:5177","refererOrigin":"http://127.0.0.1:5177","fetchSite":"same-origin","cookiePresent":true,"csrfPresent":true,"csrfValid":true,"status":"accepted","result":"csrf-and-origin-accepted"}
[make3d-workbench-result] {"method":"POST","path":"/local/files/14/open-directory","status":200,"result":"directory-opened"}
```

## 4. Final same-origin security configuration

- Binding: only `127.0.0.1:5177`; never `0.0.0.0`.
- Host allowlist: exact `127.0.0.1:5177` and `localhost:5177`.
- Origin allowlist: exact loopback origins above; no wildcard.
- CORS: not enabled or needed because browser operations are same-origin.
- CSRF: per-process hidden token, constant-time validation, required on every supported POST.
- Cookie/session: not used by this local workbench; no `Set-Cookie` response.
- Fetch: server-rendered HTML forms; no Axios or browser cross-origin fetch.
- Proxy/API base: no Vite proxy and no browser `API_BASE_URL`; the local Node server calls the cloud operator API server-side with the protected token.
- Forwarded headers: not trusted because the local server is not behind a reverse proxy.
- Headers: CSP, `Cache-Control: no-store`, frame denial, and `Referrer-Policy: strict-origin-when-cross-origin`.
- Diagnostics: method/path/origin metadata and presence booleans only; no token, CSRF value, body, or customer secret.

## 5. STL data flow and storage

1. Source database table: `files` (not `quote_draft_files`).
2. Relevant source fields: file id/order id, original/stored filename metadata, `filepath`, size and SHA-256.
3. Storage source: Make3D production server disk under `UPLOAD_DIR`; no OSS/S3 object storage is used in this path.
4. Cloud download route: `GET /api/worker/jobs/:id/download` after Worker-token authentication and ownership/path checks.
5. WSL download: stream to `/srv/make3d-worker/incoming/*.part`.
6. Validation: expected size and SHA-256.
7. Publication: atomic rename into `LOCAL_ORDER_FILES_ROOT/<safe-order-no>/<safe-filename>`.
8. Failure behavior: partial `.part` file is removed/moved through the existing failed path; a failed download is not reported as verified.
9. Duplicate behavior: a matching existing file is reused and returns `alreadyExisted=true`; no meaningless redownload.
10. Root setting: `LOCAL_ORDER_FILES_ROOT`, documented in `.env.example`; legacy `MAKE3D_LOCAL_FILES_ROOT` remains compatible.

The server creates the root at startup. Order and file path segments are server-derived and sanitized. The local backend never accepts an arbitrary absolute path from the browser.

## 6. Actual TEST file evidence

- Order: `M3D20260718175603009` (`order_id=42`, TEST)
- `file_id`: 46
- `local_file_sync_job_id`: 14
- Source filename display: masked by the existing operator privacy contract; format is STL.
- Saved filename: `46-1784368538566-ea5c29a6-519c-4af6-9593-a3ba30097e77----.stl`
- Saved directory: `/srv/make3d-worker/files/M3D20260718175603009`
- Absolute path: `/srv/make3d-worker/files/M3D20260718175603009/46-1784368538566-ea5c29a6-519c-4af6-9593-a3ba30097e77----.stl`
- Size: 144,484 bytes (non-zero)
- SHA-256: `92bd7880b5dc3c321c4ecafb6e2da034f64fd82274400e78e799258161219ac3`
- Mode/owner: `640`, `make3d-worker:make3d-worker`
- Local write time: `2026-07-18 17:56:11.992 +08:00`
- Binary STL structure: triangle count 2,888; expected size `84 + 50 * 2888 = 144484`, exactly matching the file size.

Successful pull response evidence:

```json
{
  "orderId": 42,
  "status": "verified",
  "savedDirectory": "/srv/make3d-worker/files/M3D20260718175603009",
  "savedPath": "/srv/make3d-worker/files/M3D20260718175603009/46-1784368538566-ea5c29a6-519c-4af6-9593-a3ba30097e77----.stl",
  "sizeBytes": 144484,
  "alreadyExisted": true,
  "message": "文件已存在且大小、SHA-256 均一致，未重复下载。"
}
```

## 7. Open-folder implementation and proof

The browser sends only `local_file_sync_job_id`. The backend looks up the job, derives and canonicalizes the server-owned local path, verifies it remains under `LOCAL_ORDER_FILES_ROOT`, checks existence, translates the WSL path, and invokes `worker/order-workbench/open-directory.ps1`. Non-Windows/WSL environments receive an explicit unsupported error rather than a crash.

Windows Shell acceptance:

```text
LocationName=M3D20260718175603009
LocationURL=file://wsl.localhost/Ubuntu-24.04/srv/make3d-worker/files/M3D20260718175603009
MatchCount=1
```

## 8. Page behavior

The order detail file area now shows:

- privacy-masked source filename and format;
- source type/version;
- cloud sync/download state (`pending`, `locked`, `verified`, `failed` mapped to Chinese UI);
- local directory and full absolute path;
- online and disk file size;
- file existence, size verification and SHA verification;
- last local write/download time and error reason;
- `重新检查/拉取文件`, `校验文件 SHA`, `打开 STL 所在文件夹`, and guarded `手动单次切片` actions.

Buttons are disabled when the required file/job state is not safe. Failed downloads remain retryable. Detail refresh re-checks the actual disk file rather than trusting a prior success response.

`订单状态` in this localhost tool means the independent operator handling state (`UNREVIEWED`, `REVIEWING`, `NEED_CUSTOMER_REPLY`, `FILE_CONFIRMED`, `CLOSED`). It intentionally does not mutate `orders.status`, payment status, or quote amounts. TEST-only online quote/lead/reply sync remains a separately guarded action; real-customer online sync remains disabled.

## 9. Modified files and purpose

- `.env.example`: document `LOCAL_ORDER_FILES_ROOT`.
- `worker/order-workbench/lib/security.mjs`: exact loopback Origin/Host/fetch-site checks and response policy.
- `worker/order-workbench/server.mjs`: safe request diagnostics, file status/pull routes, guarded methods, disk revalidation.
- `worker/order-workbench/lib/filePull.mjs`: verified reuse and guarded one-job pull orchestration.
- `worker/order-workbench/lib/localFiles.mjs`: canonical root confinement, SHA/metadata, safe folder opening.
- `worker/order-workbench/open-directory.ps1`: checked Windows Explorer invocation.
- `worker/order-workbench/lib/render.mjs`: Chinese file-state UI and action feedback.
- `worker/order-workbench/lib/config.mjs`: preferred root environment variable with compatibility alias.
- `worker/order-workbench/lib/localSlicing.mjs`: local one-shot result/error handling fixes.
- `worker/order-workbench/install-service.sh`: WSLInterop setup, operator group membership and secure permissions.
- `worker/order-workbench/systemd/WSLInterop.conf`: preserve WSL interop for the service.
- `worker/make3d-file-sync-worker.mjs`: secure shared directory/file modes.
- `worker/install-worker.sh`: installation compatibility used by the deployed local Worker.
- `worker/order-workbench/README.md`: startup, root, diagnostics, pull/open operations.
- `src/backend/operatorWorkbench.ts`: future cloud response fields for source filename/type/version (not production-deployed here).
- `src/backend/database.ts`: future verified-job local sync timestamp persistence (not production-deployed here).
- `scripts/phase06-workbench-e2e-local.ps1`: repeatable HTTP/security/file acceptance.
- `scripts/phase06-workbench-slice-smoke.ps1`: repeatable guarded TEST one-shot slice acceptance.
- `tests/orderWorkbench*.test.mjs`: origin, CSRF, status, download, duplicate, traversal, open-folder, rendering and service coverage.

## 10. Automated and manual verification

- Focused Workbench/file tests: 35 total, 34 passed, 1 Windows-symlink capability skip, 0 failed.
- Full `npm test`: 438 total, 436 passed, 2 platform-condition skips, 0 failed.
- `npm run lint`: passed.
- `npm run build`: passed; Next.js 15.5.18 production build completed.
- E2E local HTTP script: passed.
- Manual one-shot slice smoke: confirmation 200, run 200, result `partial` (allowed by current profile), 599 ms.
- Untrusted Origin: 403.
- Missing CSRF: 403.
- `127.0.0.1` and `localhost`: both accepted with valid same-origin and CSRF.
- PUT/PATCH/DELETE: explicit 405; no unintended write route.
- Explorer: actual matching Windows window confirmed.
- Post-restart page: HTTP 200; local `REVIEWING`, price draft `86.88`, lead draft `39`, and saved path persisted.
- Post-restart disk: file still exists, size 144,484, SHA unchanged.
- Services after restart at `2026-07-18 20:22:26 +08:00`: Workbench PID 557474 active; file-sync PID 557473 active.
- Listener: only `127.0.0.1:5177`.
- Residual processes: PrusaSlicer 0; Slicing Worker 0; Slicing Worker systemd unit 0.
- Journal sensitive scan (`Bearer`, Authorization header, token assignment, APIv3/private key, OpenID, transaction/payment identifiers): 0 matches.

## 11. Database/configuration impact

- Local Workbench SQLite was backed up before the E2E work:
  `/srv/make3d-worker/order-workbench/backups/workbench.before-e2e-20260718115509.db`
- No production database schema or business row was changed by this repair.
- No online `orders.status`, payment, refund, WeChat Pay, upload, pricing, or slicing-job write was performed.
- No payment certificate, key, APIv3 key, Worker token, or environment secret was printed or committed.

## 12. Remaining limitations

No blocking issue remains for the requested local file-management workflow.

- The cloud operator API currently masks the source filename by the established privacy contract; the page states this honestly and shows the actual locally saved filename/path. The added backend source fields require a separate reviewed production release before an unmasked source name could be displayed.
- This local tool deliberately does not expose a write path for online `orders.status`; it saves only the independent local operator handling state. This preserves the previously approved order/payment safety boundary.
- The local workbench itself has no login page/session. Access protection is loopback binding, exact Host/Origin checks, CSRF, and server-side protected cloud credentials.

## 13. Start, stop, logs and retest

```bash
sudo systemctl start make3d-order-workbench.service
sudo systemctl stop make3d-order-workbench.service
sudo systemctl restart make3d-order-workbench.service
systemctl status make3d-order-workbench.service --no-pager
journalctl -u make3d-order-workbench.service -n 100 --no-pager
```

Open either:

```text
http://127.0.0.1:5177
http://localhost:5177
```

From Windows PowerShell in the release worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase06-workbench-e2e-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase06-workbench-slice-smoke.ps1
npm test
npm run lint
npm run build
```

## 14. Rollback

1. Restore the pre-change tracked files from the release baseline only after preserving this worktree diff.
2. Re-run `worker/order-workbench/install-service.sh` from the chosen rollback revision.
3. Restore the local Workbench SQLite backup above only if the local draft database itself must be rolled back.
4. Restart `make3d-order-workbench.service` and re-run the loopback/CSRF/file checks.

No production database rollback is required because no production database migration or write occurred.
