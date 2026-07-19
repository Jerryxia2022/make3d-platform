# Phase07 Production Deployment And Acceptance Final

## Final Status

Phase07 is complete across implementation, Git, shared isolated testing, production migration, production deployment, and online acceptance. This report does not treat an audit, local-only build, or Push as a production release.

| Delivery state | Result | Evidence |
| --- | --- | --- |
| Audit and design | Complete | Phase07-A1 report |
| Local implementation | Complete | Phase07 commit chain through `2d7e225ac3ea65afd62dac5bc8484e8eb9946820` |
| Git commit | Complete | Reviewable Phase07 commits listed below |
| Remote push | Complete | `origin/codex/feat-home-step-manual-quote-local-sync` equals `2d7e225ac3ea65afd62dac5bc8484e8eb9946820` |
| Shared isolated test | Complete | `http://192.168.0.111:3108`, HTTP 200, PID 50400 |
| Production deploy | Complete | `https://www.make3d.com.cn`, production HEAD `2d7e225ac3ea65afd62dac5bc8484e8eb9946820` |

## Git And Release

- Local branch: `codex/feat-home-step-manual-quote-local-sync`.
- Remote branch: `origin/codex/feat-home-step-manual-quote-local-sync`.
- Phase06 baseline: `6343c99c3a7131012f59dfefe25c01791e41cd79`.
- Phase07 STEP/home/preview: `b249b1413c343c63570d8cee5a798d6dd81b93fb`.
- Authoritative geometry: `17a86d0`.
- Local drafts and TEST sync: `60bfe6d`.
- Shared test evidence: `0025115`.
- Persisted STEP artifact metadata: `d63c997`.
- Production migration packaging: `87dbc64`.
- Inclusive quote geometry execution: `9b920d9`.
- Final risk-message alignment and deployed application commit: `2d7e225ac3ea65afd62dac5bc8484e8eb9946820`.
- Push: normal fast-forward Push succeeded; no force Push, reset, rebase, or destructive cleanup was used.

## Shared Isolated Test

- URL: `http://192.168.0.111:3108`.
- Current status: listening, HTTP 200, PID 50400.
- Isolated root: `tmp/phase07-shared-test-60bfe6d-b` (Git ignored).
- Database: `tmp/phase07-shared-test-60bfe6d-b/data/make3d.db`.
- Uploads: `tmp/phase07-shared-test-60bfe6d-b/uploads`.
- Derived models: `tmp/phase07-shared-test-60bfe6d-b/derived-models`.
- G-code: `tmp/phase07-shared-test-60bfe6d-b/gcode`.
- Profile: `tmp/phase07-shared-test-60bfe6d-b/profiles/bambu-p1s.ini`.
- Payments were disabled, SMTP was blank, and no production database, upload directory, derived directory, or G-code directory was used.
- Browser acceptance covered STL, STEP, invalid STEP, refresh, relogin, re-slice, four home viewports, and zero HTTP `.gcode` preview requests.
- Evidence: `reports/evidence/phase07-shared-test/`.

## Production Backup And Migration

Production before the Phase07 deploy was `610108cb7caf069fd130a00fda1919ba4d181f0f`. The Phase07 code was deployed only by fast-forward merges.

Primary predeploy backups:

- Database: `/opt/make3d-platform/backups/make3d.db.phase07-before-deploy.20260719-202506.bak`.
- Database size: 688128 bytes; mode 600.
- Database SHA-256: `8734e3c73cbef0e14233dae0f5cd981397f3baf290ea92201bbe6d71d8d09db6`.
- Environment backup: `/opt/make3d-platform/backups/env.production.phase07-before-deploy.20260719-202506.bak`.
- Environment backup mode: 600.
- Environment backup SHA-256: `a3649057a59d799f1f5ec119cdc323c2beac94430e91ec738c769451c97b4f4d`.
- Production-copy rehearsal: `/opt/make3d-platform/backups/make3d.db.phase07-predeploy-copy.20260719-201638.bak`, SHA-256 `a5d0af9781fedf7206a9d3b2c7208dfae40053e6a278e07a7957fe1b1e51430d`.

Fresh backup before the final `2d7e225` code-only deploy:

- Path: `/opt/make3d-platform/backups/make3d.db.phase07-final-code-before-deploy.20260719-213820.bak`.
- Size: 696320 bytes; mode 600.
- SHA-256: `49cbe326df4d7c3263e407a79b686161ffad9fa1a3f7f62eb4f4031874f8cf70`.
- `integrity_check=ok`; `foreign_key_check_count=0`.

The guarded Phase07 migration ran twice against production and was idempotent. It added nullable `expected_ship_date`, `price_adjustment_reason`, and `production_note` columns to `operator_order_confirmations`. Existing tables and business rows were not deleted or rewritten. Post-migration `integrity_check=ok` and `foreign_key_check_count=0`.

## Production Deploy

- Production repository: `/opt/make3d-platform`.
- Production HEAD: `2d7e225ac3ea65afd62dac5bc8484e8eb9946820`.
- Deployment command: `docker compose --env-file .env.production up -d --build make3d`.
- `docker compose down` was not used.
- `make3d-platform`: running.
- Nginx: active.
- Public HTTP checks: `/`, `/quote`, `/account/login`, `/account/register`, and `/legal` all returned 200.
- Existing production untracked environment backups and WeChat verification file retained their predeploy SHA-256 values.

Rollback:

1. Preserve the current database and environment first.
2. Fast-forward or deploy the recorded pre-Phase07 production commit through a dedicated rollback branch; do not reset the production worktree destructively.
3. Restore the timestamped database backup only if schema/data rollback is required.
4. Rebuild only the `make3d` service and re-run integrity, foreign-key, public-page, payment-configuration, and log checks.

## Homepage And Preview Acceptance

The production browser verified the quote-first homepage at 1920x1080, 1366x768, 1024x768, and 390px mobile width. The automatic quote area is the primary viewport signal; STL/STP/STEP, PLA/PETG/ABS, the 10-300 mm range, upload control, and both secondary service entries are visible and usable.

Production STL acceptance covered upload, in-progress preview, completed preview, price, refresh, logout/login, and re-slice. Model URLs and G-code artifact paths remain separate. Nginx access logs contained zero HTTP GET requests for `.gcode` preview resources.

Screenshots:

- `reports/evidence/phase07-production/home-1920.png`
- `reports/evidence/phase07-production/home-1366.png`
- `reports/evidence/phase07-production/home-1024.png`
- `reports/evidence/phase07-production/home-390.png`
- `reports/evidence/phase07-production/stl-and-step-production-complete.png`
- `reports/evidence/phase07-production/step-production-after-relogin.png`
- `reports/evidence/phase07-production/step-production-reslice.png`

## Real STEP Acceptance

- Account: dedicated production TEST customer, `customers.is_test_account=1`.
- Source: desktop `04NF12.STEP`.
- Source size: 511475 bytes.
- Source SHA-256: `d4046dd7170f465095d31b8032fd4b294ba6df3e5e8ac4236ba2bedac46a79b5`.
- Current production draft file: 28.
- STEP Part 21 validation: passed.
- Conversion: success.
- Server dimensions: `30.950 x 140.006 x 173.512 mm`.
- Geometry: valid; quote mode `AUTO`.
- Material weight: 98.5774 g.
- Print time: 26470 seconds.
- Derived STL: 307384 bytes, SHA-256 `31bfc0a7fe98036805dc4764f5cd91baf285a17001c01b12f3dcdcbf1b6e5a7e`.
- G-code: 7021225 bytes, SHA-256 `094a6add4042e937b6fe99f31114c74342aaa512d0d7aa8080c7233217adffb8`.
- Refresh restored five file cards and five WebGL preview canvases, including the STEP card and server dimensions.

The requested reference was about 98.3234 g and 26586 seconds. Production differed by about 0.26% in material and 0.44% in time, consistent with the current pinned profile/tool output and not a geometry or unit error.

## Geometry Rules

The server is authoritative and uses verified STL geometry or converted STEP geometry:

- Any axis below 10.00 mm: manual quote, no PrusaSlicer call, no automatic price.
- Every axis from 10.00 through 300.00 mm: automatic quote permitted.
- Any axis above 300.00 mm: manual quote, no PrusaSlicer call, no automatic price.

Production browser results:

- `9.99 x 50 x 50`: manual, no automatic price.
- `10 x 10 x 10`: automatic, 5.95 CNY.
- `300 x 10 x 10`: automatic, 11.02 CNY, near-limit warning rather than an incorrect manual-warning message.
- `300.01 x 50 x 50`: manual, no automatic price.

Automated coverage also includes `10 x 50 x 50`, `299.99 x 299.99 x 299.99`, `300 x 300 x 300`, `50 x 301 x 50`, and `50 x 50 x 400`. Mixed orders containing a manual file keep the total in manual-confirmation state.

## Local Workbench And TEST Sync

The localhost Workbench was restarted onto the current source:

- URL: `http://127.0.0.1:5177`.
- Bind address: `127.0.0.1` only.
- Service: `make3d-order-workbench.service`, active.
- PID changed from 562219 to 564533 during the controlled reload.
- File sync Worker stayed active and kept PID 557473.

Browser verification of TEST order 24 confirmed:

- prominent TEST marker;
- read-only online quote total and update time;
- editable manual confirmed price with delta;
- one `YYYY-MM-DD` expected ship date field;
- editable reason and production note;
- explicit reply generation and editable customer reply;
- local draft save;
- dirty/sync/error/conflict state area;
- online version and local version;
- diff preview and second-confirm action.

Production TEST sync acceptance:

- Initial transaction: HTTP 200, `created=true`.
- Same `client_request_id` and body: HTTP 200, `created=false`; no duplicate rows.
- Same ID with changed body: HTTP 409 `IDEMPOTENCY_KEY_REUSED`.
- Stale expected version: HTTP 409 `ORDER_VERSION_CONFLICT`.
- Added exactly one confirmation, one customer-visible message, and one audit event.
- Confirmed price: 9500 cents.
- Expected ship date: 2026-07-23.
- Customer order page: HTTP 200 and contained the confirmed price, expected date, and exact customer-visible message; internal audit table text was absent.
- Admin order page: HTTP 200 and contained the confirmed price and expected date.
- Protected order status/payment/estimated/payable/final fields remained unchanged.
- `order_payments`, `wechat_refunds`, `files`, `slicing_jobs`, and `slicing_job_attempts` did not change from the sync.

All current production orders belong to authoritative TEST accounts, so a live non-TEST write probe would have required fabricating or mutating production business data. That unsafe probe was not performed. Automated route/domain tests prove fail-closed HTTP 403 behavior for a non-TEST order, and the production UI keeps real-order synchronization disabled.

## Regression And Safety

- Node: v22.22.3; npm: 10.9.8.
- `npm test`: 466 tests, 464 passed, 0 failed, 2 skipped.
- Both skips are Windows filesystem symlink capability conditions in `orderWorkbenchLocalFiles.test.mjs` and `phase06BackfillSingleRealFileSyncJob.test.mjs`.
- `npm run lint`: passed with zero errors.
- `npm run build`: passed, Next.js 15.5.18, 52 static pages generated.
- `git diff --check`: passed.
- Payment setting: `payment_settings.wechat_enabled=0`.
- Runtime: `WECHAT_PAY_ENABLED=true`, `WECHAT_PAY_TEST_ONLY=true`, `WECHAT_PAY_TEST_CUSTOMER_IDS=5`.
- Payment/refund counts remained `order_payments=8`, `wechat_refunds=3`.
- No real payment, refund, customer notification, or real-customer order write was executed.
- No resident PrusaSlicer process, Slicing Worker process, or Slicing Worker systemd unit exists.
- File sync Worker remains active at PID 557473.
- Recent logs: HTTP 500=0, `SQLITE_BUSY`=0, migration-error matches=0, secret-marker matches=0.
- Final database: `integrity_check=ok`, `foreign_key_check_count=0`.

## Outcome

All Phase07 completion criteria are met: implementation, commits, Push, isolated shared test, production compatibility migration, production deployment, online homepage/STL/STEP/geometry acceptance, local price/date/reply workflow, TEST-only online sync, idempotency/conflict behavior, customer/admin readback, and complete regression. Real-customer business writes remain disabled and payment safety boundaries remain unchanged.
