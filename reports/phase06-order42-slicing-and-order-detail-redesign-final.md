# Phase06 Order 42 Slicing And Order Detail Redesign Final

## 1. Scope and conclusion

- Date: 2026-07-18
- Workbench: `http://127.0.0.1:5177`
- TEST order: `order_id=42`, `M3D20260718175603009`
- P0 order 42 browser slicing: **passed** under the strong success definition. The final authoritative local result is `local_slice_results.id=12`, not `partial`.
- P1 order detail redesign: implementation and 1366x768 browser acceptance passed. Exact 1920x1080 and approximately 1024 px browser viewport acceptance remain **not manually accepted** because the available Chrome control surface clamps newly requested viewports to 1280x720. They are not reported as passed.
- The prior `reports/phase06-local-order-workbench-e2e-repair-final.md` remains only the cross-site/file/folder baseline and is not used as proof of this task.
- No production application deploy, production database/schema write, online order/quote/payment/refund/WeChat Pay/upload/legal change, non-TEST customer write, resident Slicing Worker, or slicing systemd service was performed.

## A. Order 42 slicing repair

### A.1 Reproduced failure

The browser reached the local route successfully. The failure was after STL validation and PrusaSlicer launch:

1. Browser submitted `POST /orders/42/local-slice/run` from `http://127.0.0.1:5177`.
2. `worker/order-workbench/server.mjs` accepted exact loopback Origin, Host, cookie and CSRF.
3. `worker/order-workbench/lib/localSlicing.mjs`, `runLocalOneShotSlice()`, resolved and verified the order file.
4. `worker/make3d-slicing-worker.mjs`, `runPrusaSlicer()`, started `/usr/bin/prusa-slicer`.
5. PrusaSlicer exited `1` before producing a formal G-code result.

The original error was:

```text
PrusaSlicer exited with code 1; The object ...stl exceeds the maximum build volume height.
```

The TEST model upload dimensions were `116 x 83.0754 x 230 mm`. The active profile did not define `max_print_height`, so the CLI did not have the Bambu P1S 256 mm Z limit. The browser page correctly showed failure; this was not a CSRF, file lookup, output directory, binary lookup, parser, or frontend-only error.

Stored failure evidence:

- Local result row: `id=9`, `status=failed`
- Browser failure screenshot: `reports/evidence/phase06-order42/order42-top-1366x768.png`
- Workbench accepted request at `2026-07-18 21:15:08 +08:00`

### A.2 Code and profile correction

- `profiles/bambu-p1s.ini`
  - Added `max_print_height = 256`.
  - Added `filament_density = 1.24` for the PLA baseline.
  - The header explicitly says this is a backend estimate/test baseline, **not a final production print profile**.
- `worker/make3d-slicing-worker.mjs`
  - Preserves non-zero exit code, command timing, argument list and artifact paths.
  - Builds PrusaSlicer arguments as an array with `shell=false`.
  - Sends material density, support mode and brim width explicitly.
  - Supports allowlisted PLA/PETG/ABS densities without accepting arbitrary material input.
- `worker/order-workbench/lib/localSlicing.mjs`
  - Validates the input file before execution.
  - Publishes G-code/stdout/stderr atomically to an order-specific result directory.
  - Rechecks G-code existence, non-zero size and SHA-256 after publication.
  - Requires G-code, print time, material weight and parser `quote_ready=true` before returning complete success.
  - Returns `{ ok: false, partial: true }` when G-code exists but required metrics are incomplete.
- `worker/order-workbench/server.mjs`
  - Starts browser JSON slicing with HTTP `202` and a status URL.
  - Exposes safe stage polling.
  - Blocks implicit duplicate slicing when a complete result exists and requires the explicit re-slice confirmation path.
  - Logs safe request/result diagnostics without token or CSRF values.
- `worker/order-workbench/public/workbench.js`
  - Shows `VALIDATING`, `SLICING`, `PARSING`, `SUCCESS`, `PARTIAL`, and `FAILED` distinctly.
  - Disables duplicate submission while running and updates the page without a full manual refresh.
  - Never renders `PARTIAL` as complete success.

### A.3 Final authoritative browser run

The final run was initiated by the real browser through:

```text
订单详情
→ 进入重新切片确认
→ 确认重新切片
→ POST /orders/42/local-slice/run
→ HTTP 202
→ SLICING
→ PARSING
→ SUCCESS
```

Safe request/network-equivalent server evidence:

```text
22:46:53 POST /orders/42/local-slice/run
origin=http://127.0.0.1:5177
refererOrigin=http://127.0.0.1:5177
fetchSite=same-origin
cookiePresent=true
csrfPresent=true
csrfValid=true
status=accepted

22:46:53 POST result status=202 result=slice-started
22:46:54 GET slice-status status=200 result=SLICING
22:46:54 GET slice-status status=200 result=SLICING
22:46:55 GET slice-status status=200 result=PARSING
22:46:55 GET slice-status status=200 result=SUCCESS
```

Browser Console after the final run: `[]` for errors and warnings.

### A.4 Final real data

- Order ID: `42`
- Order number: `M3D20260718175603009`
- Local slice result ID: `12`
- Final persisted status: `parsed`
- Parse status: `parsed`
- Parser quote ready: `true`
- STL absolute path: `/srv/make3d-worker/files/M3D20260718175603009/46-1784368538566-ea5c29a6-519c-4af6-9593-a3ba30097e77----.stl`
- STL size: `144484` bytes
- STL SHA-256: `92bd7880b5dc3c321c4ecafb6e2da034f64fd82274400e78e799258161219ac3`
- PrusaSlicer binary: `/usr/bin/prusa-slicer`
- PrusaSlicer package version: `2.7.2+dfsg-1build2`
- Profile: `/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini`
- Profile SHA-256: `7953997131a3d18245b4a9b25af7853846cf7026a097077b387650c947a21706`
- Start: `2026-07-18T14:46:53.381Z`
- End: `2026-07-18T14:46:54.708Z`
- Recorded duration: `2` seconds
- Exit code: `0`
- G-code absolute path: `/srv/make3d-worker/results/orders/M3D20260718175603009/slice-12/output.gcode`
- G-code size: `11587764` bytes
- G-code SHA-256: `29e155337a31bd2aa52d37204655cf7b385244515b3f679e9e516a33c50e26e4`
- Parsed print time: `52041` seconds (`14 h 27 min 21 s`)
- Parsed material weight: `202780 mg` (`202.78 g`)
- Parsed G-code bounds: `115.231 x 88.049 x 230 mm`
- stdout: `648` bytes, normal export plus a non-blocking support/stability warning
- stderr: `0` bytes

Full command array:

```json
["/usr/bin/prusa-slicer","--export-gcode","--load","/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini","--output","/srv/make3d-worker/processing/prusaslicer/12/attempt-1/output.gcode.part","--filament-type","PLA","--filament-density","1.24","--layer-height","0.2","--fill-density","50%","--brim-width","1","/srv/make3d-worker/files/M3D20260718175603009/46-1784368538566-ea5c29a6-519c-4af6-9593-a3ba30097e77----.stl"]
```

The browser displayed:

```text
切片完整成功
预计打印时间 14 小时 27 分 21 秒
耗材重量 202.78 g
G-code 大小 11.05 MB
退出码 0
/srv/make3d-worker/results/orders/M3D20260718175603009/slice-12/output.gcode
```

### A.5 Persistence and duplicate protection

- Refresh: the order page continued to show result `12`, its full path, time and weight.
- Service restart: `make3d-order-workbench.service` restarted to PID `559168`; the browser again showed `slice-12`, `14小时 27分 21秒`, and `202.78 g`.
- Existing file sync Worker PID remained `557473` before and after Workbench restarts.
- No residual PrusaSlicer or Slicing Worker process remained.
- A complete result changes the main action to `查看切片结果`; another run requires the explicit `进入重新切片确认` flow.
- Historical result rows `9`, `10`, `11`, and `12` remain for audit. No old result was overwritten.

### A.6 `partial` semantics

- `partial` means a non-empty G-code exists but print time, material weight, or parser quote readiness is incomplete.
- It does not mean successful slicing acceptance.
- The baseline profile never had a legitimate rule that made `partial` acceptable; the earlier report's wording was incorrect.
- Current UI maps `PARTIAL` to a yellow warning with the explicit message that G-code exists but required metrics are incomplete.
- Current final result is `parsed`, not `partial`.

## B. Order detail page redesign

### B.1 Problems in the prior page

- Status, file, slicing, quote and local review actions had equal visual weight.
- Long paths and full SHA values could stretch the layout.
- Slice submission gave insufficient live feedback.
- `partial` and failure were not sufficiently separated from complete success.
- Frequent actions were scattered and the relationship between local drafts and online values was weak.

### B.2 New information architecture

The page now uses:

1. Compact order overview with order number, TEST boundary, handling/payment/file/slice states and timestamps.
2. Two-column desktop workspace, approximately 2.1:1.
3. Main column: customer/order summary, file cards, slice settings, slice result, local quote/lead-time/reply draft, messages and audit details.
4. Side column: current local handling state, next-step recommendation, internal note and guarded TEST online-sync preview.
5. At widths below 1100 px the layout changes to one column and moves the operator work area ahead of the long content.
6. At widths below 720 px status, file, setting and result grids collapse to one column.

The formerly sticky overview and side panel are intentionally static in the final version. This avoids covering long content and makes continuous order review easier.

### B.3 Visual and interaction rules

- 8 px-based spacing, 1440 px maximum content width, 24 px desktop side padding.
- Card radius no greater than 8 px.
- Primary action is state-dependent: start slice, re-slice confirmation, or view result.
- Secondary buttons are used for local review and file checks; copy is a text action.
- Gray = idle, blue = in progress, green = success, yellow = attention/partial, red = failure.
- Every status uses both text and color.
- Paths remain single-line and ellipsized in normal cards, expose full values in `title`, and support copy.
- Full SHA/version text wraps instead of forcing horizontal overflow.
- Slice controls expose material, color, quantity, nozzle, layer height, fill, support, brim and wall count; advanced settings are collapsed.
- Browser JS disables duplicate submission and shows stage progress without inventing a percentage.
- Failure renders the failed stage, understandable reason, and collapsible technical details.
- Local price/lead time/reply drafts remain visually separated from online official data.

### B.4 Browser operations actually completed

For order 42, the browser actually completed:

- Open and refresh order detail.
- Read the full local STL path.
- Copy the STL path; clipboard matched the displayed absolute path.
- Open the STL folder; Windows Explorer opened `file://wsl.localhost/Ubuntu-24.04/srv/make3d-worker/files/M3D20260718175603009`.
- Verify SHA; disk size and SHA matched cloud metadata.
- Change and save local handling state/note.
- Change brim width from `0` to `1 mm`.
- Enter explicit re-slice confirmation.
- Start slicing and observe stage updates.
- Read complete success result.
- Refresh and re-read the result.
- Restart Workbench and re-read the same persisted result.
- Confirm 1366 px horizontal overflow is absent: `clientWidth=1366`, `scrollWidth=1366`.

### B.5 Screenshot evidence

Accepted evidence:

- Final top, 1366x768: `reports/evidence/phase06-order42/order42-final-top-1366x768.png`
- File area: `reports/evidence/phase06-order42/order42-file-area.png`
- Slice settings: `reports/evidence/phase06-order42/order42-slice-settings.png`
- Original browser failure: `reports/evidence/phase06-order42/order42-top-1366x768.png`
- Final live progress: `reports/evidence/phase06-order42/order42-final-slicing-progress.png`
- Final live success: `reports/evidence/phase06-order42/order42-final-slicing-success.png`
- Final persisted result, 1366x768: `reports/evidence/phase06-order42/order42-final-result-1366x768.png`
- Final complete 1366 page: `reports/evidence/phase06-order42/order42-final-full-1366.png`

The final 1366 full-page image is assembled from four unmodified screenshots from the same browser at real scroll offsets `0`, `650`, `1300`, and `1784`, because the Chrome connector's direct `fullPage` command repeated the first viewport. The four source files are retained as `order42-stitch-0.png` through `order42-stitch-3.png`.

Not accepted as final evidence:

- Files named `order42-full-1920x1080.png`, `order42-top-1920x1080.png`, `order42-full-1366x768-final.png`, `order42-failure-before-fix.png`, and `order42-detail-failure-full.png` were generated during viewport/full-page connector troubleshooting. Their image dimensions or composition do not prove the named viewport and they must not be cited as acceptance evidence.

### B.6 Responsive acceptance status

- 1366x768 real browser: **passed**; no horizontal overflow, no button overlap, long SHA/path values remain contained.
- 1920x1080 exact real browser: **not manually accepted**. The browser viewport capability requested 1920x1080 but the selected Chrome connection returned 1280x720.
- Approximately 1024 px exact real browser: **not manually accepted**. The same capability applied a 1280 px minimum.
- Automated CSS structure: media breakpoints and one-column rules are covered by source/tests, but this is not a substitute for exact browser acceptance.

Therefore the P1 code implementation is complete, but overall P1 acceptance remains incomplete until the user-required exact 1920/1024 manual viewport evidence is captured.

## C. Tests and evidence classification

### C.1 Automated tests passed

- Focused P0/P1 tests after final cleanup: `24/24` passed.
- Earlier expanded focused set including Worker slicing client/profile/density coverage: `42/42` passed.
- Full `npm test`: `442` total, `440` passed, `2` skipped by existing conditions, `0` failed.
- `npm run lint`: passed with `0` errors and `0` warnings after removing obsolete render helpers.
- `npm run build`: passed; Next.js 15.5.18 production build generated 52 static pages.
- Local SQLite `PRAGMA integrity_check`: `ok`.
- Local SQLite `PRAGMA foreign_key_check`: `0` rows.
- Independent real G-code parser: `parsed`, `metrics_status=ok`, `quote_ready=true`, values and SHA match local result `12`.

### C.2 Browser manual tests passed

- Exact loopback Origin/CSRF/cookie submission for the final slice.
- HTTP 202 start and stage polling to SUCCESS.
- Actual PrusaSlicer run, formal G-code publication, parsing and persistence.
- Console error/warning list empty.
- File path copy, folder open and SHA verification.
- Local review/note save.
- Slice parameter change and explicit re-slice.
- Refresh persistence.
- Workbench restart persistence.
- 1366x768 order detail and full-page visual acceptance.

### C.3 Not manually accepted

- Exact 1920x1080 browser viewport screenshot and interaction pass.
- Exact approximately 1024 px browser viewport screenshot and interaction pass.
- All other orders and files.
- Non-TEST order UI beyond existing read-only automated coverage.
- TEST online confirmation sync, customer notification, email, WeChat notification, payment and refund paths in this task.
- The profile as a final production-print profile. It remains an estimate/test baseline.

### C.4 Final failed tests

- No automated test failed.
- No final order 42 slicing step failed.
- The original row `9` failure is retained as the reproduced defect evidence, not a final acceptance failure.

## 4. Runtime state and safety

- `make3d-order-workbench.service`: `active`, PID `559168` after final restart.
- Listener: only `127.0.0.1:5177`.
- Final HTTP checks: `127.0.0.1:5177/orders/42 = 200`, `localhost:5177/orders/42 = 200`.
- `make3d-file-sync-worker.service`: `active`, PID `557473`, unchanged across Workbench restarts.
- Residual PrusaSlicer/Slicing Worker process count: `0`.
- Sensitive Workbench journal scan matches: `0`.
- Online order status, online quote/price, payment, refund, WeChat Pay, uploads, legal pages and production schema were not modified.
- No token, Authorization value, OpenID, phone, email, payment secret, private key, certificate or APIv3 key was emitted into the report.

## 5. Modified files for P0/P1

- `profiles/bambu-p1s.ini`
- `worker/make3d-slicing-worker.mjs`
- `worker/order-workbench/lib/localSlicing.mjs`
- `worker/order-workbench/lib/render.mjs`
- `worker/order-workbench/public/workbench.js`
- `worker/order-workbench/server.mjs`
- `tests/orderWorkbenchLocalDraftsAndSlicing.test.mjs`
- `tests/orderWorkbenchServerSecurity.test.mjs`
- `tests/workerSlicingClient.test.mjs`
- `scripts/phase06-verify-local-gcode.mjs`
- `reports/evidence/phase06-order42/`
- `reports/phase06-order42-slicing-and-order-detail-redesign-final.md`
- `changelog/CHANGELOG.md`

## 6. Rollback

This work is not committed or deployed to the production application in this task. To roll back later, revert only the eventual P0/P1 release commit, restore the prior local profile under `/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini`, and restart `make3d-order-workbench.service`. Do not delete historical local slice result rows or order result directories; they are audit evidence.
