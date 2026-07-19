# Phase06 Order List And Explorer Foreground Acceptance Final

## 1. Result

Status: passed and complete.

The local Workbench order list, independent headed-browser acceptance, and the five required Windows Explorer foreground scenarios all passed. Explorer success is based on the final foreground HWND, not on window existence or the return value of `SetForegroundWindow()` alone.

No production deployment, production database write, online order/quote/payment/refund/WeChat/upload change, automatic slicing, PrusaSlicer run, or Slicing Worker start was performed.

## 2. Root Cause And Correction

The earlier `directory-opened-not-focused` result came from Windows foreground activation restrictions. WSL systemd launched `powershell.exe` in the same interactive Windows session as Explorer, so a separate Windows helper was not required. The reliable sequence is:

1. Find the exact Explorer window by canonical folder path and `LocationURL`.
2. Restore it with `ShowWindowAsync` when minimized.
3. Attach current, foreground, and target input threads where applicable.
4. Briefly set `HWND_TOPMOST`, call foreground/active/focus APIs, then immediately restore `HWND_NOTOPMOST`.
5. Detach input threads and accept success only when `GetForegroundWindow()` equals the target Explorer HWND.

During final regression, a separate missing-file branch bug was also found and fixed: `verifyLocalFileMetadata()` referenced an undefined catch variable and could cause a 500 when `stat()` failed. It now returns `not-found` or `stat-failed` safely.

## 3. Relevant Files

- `worker/order-workbench/open-directory.ps1`: canonical Explorer lookup, restore, foreground activation, TOPMOST reset, HWND/session/thread diagnostics.
- `worker/order-workbench/lib/localFiles.mjs`: path/SHA gate, structured Explorer results, safe diagnostic allowlist, missing-file error fix.
- `worker/order-workbench/lib/orderList.mjs`: list summaries, priority ordering, search, filters, sorting, pagination.
- `worker/order-workbench/lib/designSystem.mjs`: shared local Workbench visual tokens and responsive list styles.
- `worker/order-workbench/lib/render.mjs`: Chinese list UI, loading/empty/error states, responsive table and detail links.
- `worker/order-workbench/public/workbench.js`: same-origin interactions and Explorer HWND evidence on the page.
- `worker/order-workbench/server.mjs`: list orchestration and safe Explorer JSON response.
- `scripts/phase06-workbench-browser-acceptance.mjs`: isolated headed Chrome/CDP and real desktop acceptance.
- `tests/orderWorkbenchOrderList.test.mjs`: list behavior tests.
- `tests/orderWorkbenchLocalFiles.test.mjs`: confinement, SHA, and Explorer contract tests.
- `tests/orderWorkbenchServerSecurity.test.mjs`: Origin/CSRF, safe error state, API response, and secret-redaction tests.

## 4. Runtime And Session Evidence

- Workbench URL: `http://127.0.0.1:5177`
- Listener: `127.0.0.1:5177` only
- Workbench service: active/running, PID `562219`, user `make3d-worker`
- File-sync Worker: active/running, PID `557473` unchanged through Workbench restarts
- Windows user: `DELL7420PLUS\\21899`
- PowerShell session ID: `1`
- Explorer interactive session ID: `1`
- Non-interactive service session: `false`
- `SetForegroundWindow`, `BringWindowToTop`, `ShowWindowAsync`, TOPMOST and NOTOPMOST results: `true`
- No Windows desktop helper was added because same-session activation now passes reliably.

## 5. Explorer Desktop Acceptance

Dedicated headed Chrome HWND before every action: `14486124`.

Order 42 Explorer target HWND after every action: `25889580`.

| Scenario | Evidence | Result |
| --- | --- | --- |
| Target Explorer absent | target count became 1; before HWND `14486124`, after foreground/target `25889580` | Passed |
| Existing target obscured | same target HWND reused; target count stayed 1 | Passed |
| Target minimized | `restored=true`; same target HWND became foreground | Passed |
| Multiple directories open | exact order 42 `LocationURL` selected; other directory HWNDs remained distinct | Passed |
| Two repeated clicks | both returned `directory-focused`; one target window only | Passed |

The browser-side result and independent desktop enumeration agree. `directory-opened-not-focused` is still preserved as an honest partial result and is never converted to success.

## 6. Order List Browser Acceptance

An isolated, non-headless system Chrome profile navigated directly to the fixed URLs without attaching to the user's daily browser.

- Default list: 23 total orders, 20 rows on page 1.
- Search `42`: one result, order 42.
- Search clear: default list restored.
- Local state + TEST + created-date sorting: passed.
- Verified-file filter: 14 results.
- Slice-failure filter: valid empty state, 0 current failures.
- TEST filter: 23 results.
- 30-day filter and refresh state preservation: passed.
- File-exception filter: 9 results.
- Pagination: page 2 has 3 rows; return to page 1 has 20.
- Page size 50: all 23 rows.
- Back navigation: search/filter/page-size/sort URL state preserved.
- Simulated cloud list failure: HTTP 502 with safe Chinese error UI; upstream error detail and secrets are not rendered.
- Loading state: form/refresh interactions set `aria-busy` and show the refresh indicator.
- Exact viewports: 1024x768, 1366x768, and 1920x1080; page-level horizontal overflow was false.

## 7. Order 42 Regression

- Order: `M3D20260718175603009` (TEST)
- File ID / sync job: `46 / 14`
- STL path: `/srv/make3d-worker/files/M3D20260718175603009/46-1784368538566-ea5c29a6-519c-4af6-9593-a3ba30097e77----.stl`
- STL size: `144484` bytes
- STL SHA-256: `92bd7880b5dc3c321c4ecafb6e2da034f64fd82274400e78e799258161219ac3`
- API checks: `fileExists=true`, `sizeMatches=true`, `shaMatches=true`
- G-code path: `/srv/make3d-worker/results/orders/M3D20260718175603009/slice-12/output.gcode`
- G-code size: `11587764` bytes
- G-code SHA-256: `29e155337a31bd2aa52d37204655cf7b385244515b3f679e9e516a33c50e26e4`
- Print time: `52041` seconds, or 14 hours 27 minutes 21 seconds
- Material weight: `202.78 g`
- Parser status: `parsed`, metrics `ok`, quote-ready `true`

The service was restarted and the same file, path, SHA, and slicing result remained visible and readable afterward.

## 8. Security And Non-interference

- External Origin, missing/invalid CSRF, non-loopback Host, traversal, and unverified/mismatched file access remain rejected.
- Directory opening accepts only a server-derived, verified path inside `/srv/make3d-worker/files`.
- Logs contain request metadata booleans, never token/CSRF values, file contents, or customer private data.
- Last 200 Workbench journal lines: 0 HTTP 500/SQLITE_BUSY/unhandled matches and 0 secret-pattern matches.
- PrusaSlicer process count: 0.
- Slicing Worker process count: 0.
- Slicing Worker systemd unit count: 0.
- Temporary CDP port 9223 listener count after acceptance: 0.
- No production order, formal quote, payment, refund, WeChat Pay, upload, or database schema was modified.

## 9. Verification

- Focused Workbench tests: 35 passed, 1 platform-condition skip, 0 failed.
- Final `npm test`: 448 total, 446 passed, 2 platform-condition skips, 0 failed.
- `npm run lint`: passed with 0 warnings/errors.
- `npm run build`: passed; 52 static pages generated and all routes compiled.
- Headed browser and five Explorer scenarios: passed after the final Workbench restart.

The skipped tests are environment-dependent symlink/platform cases; equivalent traversal and root-confinement behavior is covered by passing tests.

## 10. Evidence

Structured evidence:

- `reports/evidence/phase06-order-list-and-explorer/acceptance-results.json`

Screenshots:

- `orders-default-1024x768.png`
- `orders-default-1366x768.png`
- `orders-default-1920x1080.png`
- `orders-search-order42.png`
- `orders-filter-test-unreviewed.png`
- `orders-file-exceptions.png`
- `orders-empty-result.png`
- `explorer-s1-before.png`
- `explorer-s1-after-focused.png`
- `explorer-s3-minimized.png`
- `explorer-s3-restored-focused.png`
- `explorer-s4-correct-multi-window.png`

## 11. Risks And Rollback

Residual risk: Windows foreground policy can vary after a Windows/Explorer security update. The structured partial status remains fail-closed, and the acceptance script can be rerun after such updates.

Rollback requires reverting the order-list/Explorer activation changes as a normal future Git revert or inverse patch and restarting only `make3d-order-workbench.service`. No database rollback is required because this work added no schema or production data changes. Do not use a destructive reset against the current dirty worktree.
