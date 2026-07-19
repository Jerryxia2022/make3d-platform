# Phase07-A1 Home, STEP, Manual Quote And Local Sync Audit And Plan

## 1. Scope And Decision

This report freezes the design and migration boundary for the next Make3D development stage. No homepage, upload, preview, slicing, quote, order, payment, WeChat Pay, production database, or production deployment code was changed in this audit stage.

The requested work is one end-to-end pipeline:

```text
upload
-> identify
-> geometry analysis
-> dimensions
-> preview
-> automatic slicing or manual quote
-> quote
-> local confirmation
-> guarded online sync
-> customer display/reply
```

Implementation must not start until the schema design and field matrix in this report are approved.

## 2. Git And Runtime Baseline

- Audit worktree: `C:\Users\21899\Documents\make3d-platform-phase06-a2-rc`
- New isolated branch: `codex/feat-home-step-manual-quote-local-sync`
- Branch base commit: `112a838cc4326ec4ab658863895c165b31acd703`
- Remote `origin/phase05-worker-slicing-candidate`: `112a838cc4326ec4ab658863895c165b31acd703`
- The worktree inherited 39 modified/untracked Phase06 files. These include the accepted order 42, Explorer, slicing, order detail, and order list work. They must be preserved and separated into a reproducible baseline commit before Phase07 implementation commits.
- Local Workbench service: active, PID `562219`, listening on `127.0.0.1:5177`.
- Node: `v22.22.3`
- npm: `10.9.8`

### Database backup

- Source: `/srv/make3d-worker/order-workbench/workbench.db`
- Backup: `/srv/make3d-worker/order-workbench/backups/workbench.db.phase07-a1.20260719082640.bak`
- Size: `114688` bytes
- Mode/owner: `600`, `make3d-worker:make3d-worker`
- SHA-256: `f7feb919fd4d9368779a9dc3bb576a4c5cedadac3fb42133fe54314de1e469d9`
- `integrity_check`: `ok`

No production database was accessed or backed up because this phase does not deploy or migrate production.

## 3. Current Homepage

The source and read-only production page currently match:

- Hero headline describes printing, model modification, and R&D with similar visual priority.
- The hero contains two CTAs: upload quote and R&D request.
- A right-side card repeats three capabilities and a three-item intake list.
- A second full section repeats the same three services as equal-width cards.
- Automatic quote is therefore duplicated but is not the dominant first-viewport work surface.
- Current copy says `STL 自动报价` and `已有 STL 模型`; it does not accurately describe the requested STEP pipeline or the 10-300 mm rule.

Primary source: `src/app/page.tsx`. SEO metadata remains owned by the existing app layout and must not be weakened.

### Target layout

- First viewport: one dominant, wide automatic quote panel with upload CTA, supported formats, PLA/PETG/ABS, color/quantity, the short process, and the 10-300 mm eligibility statement.
- Secondary region: two compact clickable cards for model modification and R&D consultation.
- No marketing-only landing detour; the quote action stays directly available.
- Validate at 1920x1080, 1366x768, 1024x768, and mobile. The next section must remain hinted in the viewport and horizontal overflow must be zero.

## 4. Current Upload, Preview, Slice And Quote Flow

### Upload identification

- Frontend extension allowlist: `.stl`, `.step`, `.stp` in `src/frontend/components/QuoteForm.tsx`.
- Backend extension allowlist: the same case-insensitive extensions in `src/backend/uploads.ts`.
- Backend validation currently checks extension and size only. It does not validate MIME, STL structure before save, STEP Part 21 markers, entity presence, or source SHA during initial save.
- Original upload is written to `UPLOAD_DIR` with a timestamp/UUID filename.
- `files.filename` receives the stored filename. The permanent `files` row does not retain the original customer filename or source SHA.

### STEP behavior

- `POST /api/quote/slice` saves STEP/STP but immediately returns manual handling because only `.stl` is sliced.
- `POST /api/orders` again forces STEP/STP to manual confirmation through `getManualReviewReason()`.
- There is no STEP parser, no controlled CAD conversion, no derived preview mesh, no converter log/version record, and no STEP slicing path.
- The current WSL host has PrusaSlicer `2.7.2+dfsg-1build2` at `/usr/bin/prusa-slicer`.
- PrusaSlicer help exposes `--export-gcode`, `--load`, and `--output`; help does not establish reliable STEP support.
- FreeCAD CLI was not found in the current WSL command-path check. No converter may be installed or selected without a separate approved environment step.
- `04NF12.STEP` was searched under the user Desktop, Downloads, Documents, and Codex attachments and was not found. Real-file STEP acceptance is blocked until the original file is supplied; a synthetic replacement must not be reported as real acceptance.

### STL preview failure hypothesis

The failure timing has a specific code-level candidate:

1. A newly selected STL previews from the browser `File` object.
2. When `/api/quote/slice` returns, `rememberDraftFile()` adds `/api/quote/draft/files/:id/download` as `fileUrl`.
3. `StlModelPreview` derives a new `previewUrl`, so its thumbnail effect cleans up and reruns.
4. Cleanup calls `disposeRenderer()` and `renderer.forceContextLoss()` on the existing canvas.
5. The effect then attempts to create a new WebGL renderer on that same canvas.

This matches the reported transition from a working preview during slicing to a failed/blank preview after slicing. It is not yet a proven root cause until captured in a real browser with network, console, WebGL context, source URL, response MIME, and component lifecycle evidence.

The fix must establish one stable model-preview source identity and keep model URLs separate from G-code/artifact URLs. Preview state must not depend on slice status.

### Dimension and quote authority

- `getStlDimensionNotice()` currently uses `> 260` and `< 10` only as a frontend warning.
- Dimensions are parsed in the browser and submitted as hidden form fields.
- `/api/quote/slice` does not perform authoritative dimensions gating before PrusaSlicer.
- `/api/orders` accepts submitted dimensions and uses them for estimate/manual risk decisions.
- Therefore the current server trusts browser-provided geometry dimensions too much and can start slicing before the requested 10-300 mm rule is enforced.

The new rule must live in a shared server-side pure function and be called only with dimensions produced by validated server-side geometry analysis. Frontend logic may explain the result but cannot authorize automatic slicing.

## 5. Frozen Quote Eligibility Contract

```text
all axes >= 10.00 mm and <= 300.00 mm -> AUTO_QUOTE_ELIGIBLE
any axis < 10.00 mm                    -> MANUAL_QUOTE_TOO_SMALL
any axis > 300.00 mm                   -> MANUAL_QUOTE_TOO_LARGE
invalid/unknown geometry               -> MANUAL_QUOTE_GEOMETRY_ERROR
```

- `10.00` and `300.00` are inclusive.
- If any order file is manual, the whole order total is manual. Partial automatic subtotals must not be presented as the final order total.
- Manual files remain uploadable, saved, previewable when a valid mesh exists, and editable for material/color/quantity/remark.
- A manual file must not create a quote slice job, invoke PrusaSlicer, consume the slicing queue, or manufacture a price.
- Client and server use the same labels, but server analysis is authoritative.

## 6. Online Admin And Local Workbench Field Matrix

| Business field | Online source/control | Existing local field/control | Existing online sync | Phase07 decision |
| --- | --- | --- | --- | --- |
| Online quote total | `orders.final_price/payable_price/estimated_price`; read on admin/detail | Displayed in order detail, but local confirmed price is independent | Read-only API returns values | Keep read-only with timestamp; missing must display as missing, never zero |
| Manual confirmed price | Admin `AdminFinalQuoteForm` -> `POST /api/admin/orders/:id/final-quote` -> `orders.final_price` | `local_order_reviews.confirmed_price_cents` | TEST-only sync appends `operator_order_confirmations`; it does not update `orders.final_price` | Default once from online quote, preserve dirty edits, sync only through a new domain service after TEST acceptance |
| Final lead time | Admin final quote edits `orders.final_lead_time_hours` | Local min/max hours plus `estimated_ship_at` | TEST-only confirmation stores min/max and `estimated_ship_at` | UI becomes one `expected_ship_date` value; preserve legacy hours as read-only compatibility data |
| Customer reply | Customer page reads visible `order_messages` | `reply_template`, `reply_draft` | Existing TEST-only endpoint appends one message idempotently | Keep append-only; track generated fingerprint and manual edits; regenerate only by explicit action |
| Price adjustment reason | Admin final quote -> `orders.price_adjustment_reason` | Not present | Not syncable | Add local draft only after allowlist/domain validation is approved |
| Production note | Admin final quote/status -> `orders.production_note` | `operator_note` is local-only and semantically different | Not syncable | Keep separate; expose only as an explicitly labeled internal field |
| Order status | Admin status API uses legal transitions and may affect payment/notifications | Local review state is deliberately independent | Not syncable | Do not map local handling state to order status. Future sync allowlist must exclude payment transitions |
| Assigned printer | Admin status -> `orders.assigned_printer` | Not present | Not syncable | Optional later parity field; no Worker start side effect |
| Estimated start/finish | Admin status -> order datetime columns | Not present | Not syncable | Optional later parity fields, separate from customer expected ship date |
| Actual start/finish | Admin status -> order datetime columns | Not present | Not syncable | Exclude from first Phase07 sync because they are production execution evidence |
| Shipping company/tracking/shipped time/note | Admin status -> shipping columns | Not present | Not syncable | Exclude from first quote confirmation sync; use a later fulfillment-specific operation |
| Internal/admin notes | Admin status -> `internal_note/admin_remark` | `operator_note` only | Not syncable | May be local drafts, but never customer-visible and must use explicit field labels |
| Material/color/quantity | Stored on `orders` and `files`; currently displayed, not edited by the online admin detail form | Read from cloud; slicing options are local execution inputs | Not syncable | Do not claim parity or add writes until online domain rules exist |
| Payment/refund/WeChat fields | Dedicated payment/refund APIs and tables | Not exposed | Not syncable | Permanently excluded from this feature |

Important current behavior: the existing Workbench `confirm-and-reply` endpoint is authoritative TEST-only and atomically inserts a confirmation, one visible message, and one audit event. It intentionally does not mutate order price/status/payment. Phase07 must preserve this safety until a new Operator operation is separately tested and approved.

## 7. Required Additive Migration Design

Database changes are required for durable STEP provenance, authoritative geometry decisions, and reliable local sync state. No migration code is approved by this report alone.

### Online database

Add nullable, backward-compatible analysis columns to `quote_draft_files` and `files`:

```text
original_filename          TEXT          -- new on files; already exists on quote_draft_files
source_format              TEXT          -- STL or STEP
source_sha256              TEXT
geometry_status            TEXT          -- pending/valid/invalid/conversion_failed/unit_unknown
geometry_units             TEXT          -- mm or explicit source unit
geometry_analyzed_at       TEXT
geometry_tool_name         TEXT
geometry_tool_version      TEXT
quote_mode                 TEXT          -- AUTO or MANUAL
manual_quote_reason_code   TEXT
```

Existing bounding-box columns remain the canonical X/Y/Z storage after server-side analysis. Existing rows remain nullable/legacy and must not be reclassified automatically.

Add artifact tables:

```sql
CREATE TABLE quote_draft_file_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_draft_file_id INTEGER NOT NULL,
  artifact_type TEXT NOT NULL,
  format TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  tool_name TEXT,
  tool_version TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (quote_draft_file_id) REFERENCES quote_draft_files(id) ON DELETE CASCADE
);

CREATE TABLE file_processing_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL,
  artifact_type TEXT NOT NULL,
  format TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  tool_name TEXT,
  tool_version TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT
);
```

Approved artifact types will be allowlisted: `PREVIEW_MESH`, `SLICE_INPUT_MESH`, and `CONVERSION_LOG`. Relative paths must remain under dedicated artifact roots. Original uploads remain in `UPLOAD_DIR` and are never overwritten.

Indexes:

```text
quote_draft_file_artifacts(quote_draft_file_id, artifact_type, created_at)
file_processing_artifacts(file_id, artifact_type, created_at)
files(quote_mode, requires_manual_confirmation, created_at)
```

Migration requirements:

- Use SQLite-compatible `ensureColumns`/`CREATE TABLE IF NOT EXISTS` patterns.
- Run twice on a production-copy database and prove idempotency.
- Preserve all old order/file/upload/payment records and counts.
- No historical STEP backfill in the first migration.
- Rollback is application-code rollback plus pre-migration database backup; additive columns/tables are not destructively dropped in production.

### Local Workbench database

Preserve `lead_time_min_hours`, `lead_time_max_hours`, and `estimated_ship_at` for old rows. Add:

```text
expected_ship_date             TEXT
reference_quote_cents          INTEGER
reference_quote_updated_at     TEXT
confirmed_price_dirty          INTEGER NOT NULL DEFAULT 0
reply_generated_from_sha256    TEXT
reply_manually_edited          INTEGER NOT NULL DEFAULT 0
sync_status                    TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
last_sync_request_id           TEXT
last_sync_at                   TEXT
last_sync_error                TEXT
cloud_order_version_snapshot   TEXT
```

Add append-only `local_order_change_sets` for preview, idempotency, retries, conflict evidence, and per-field results:

```text
id, order_id, client_request_id, expected_order_version,
base_values_json, changes_json, field_results_json,
status, created_at, completed_at
```

Legacy migration rule: if `estimated_ship_at` contains a valid date, copy only its `YYYY-MM-DD` portion to `expected_ship_date`; otherwise leave the new date empty and continue displaying the legacy hour range as historical information. Do not derive a new calendar date from old lead-time hours at migration time.

## 8. Target API And Conflict Contract

Keep the existing bearer-authenticated Operator API. Add a new explicit operation only after schema rehearsal:

```text
POST /api/operator/workbench/orders/:id/business-changes
```

Request contains `expected_order_version`, `client_request_id`, and an allowlisted `changes` object. Server behavior:

1. Authenticate Operator token with constant-time comparison.
2. Reject query-string tokens and redact Authorization from logs.
3. Validate every field and return per-field validation results.
4. If any field is invalid, perform no business write.
5. Compare the current online version; return `409 ORDER_VERSION_CONFLICT` with safe latest values when changed.
6. Apply valid changes through existing domain helpers inside `BEGIN IMMEDIATE`; never issue arbitrary field SQL from request keys.
7. Bind the idempotency key to a canonical request fingerprint.
8. Append an audit event and return refreshed allowlisted order data.
9. Keep real-customer writes disabled behind an explicit server feature gate until TEST-only browser acceptance passes.

Payment status, payment amounts, payment methods, payment records, refunds, WeChat transaction IDs, OpenID, secrets, evidence snapshots, and upload deletion are never accepted fields.

## 9. Implementation Sequence

### Phase07-A2 - Baseline hygiene and preview lifecycle

- Separate/commit the inherited accepted Phase06 work without reset, rebase, or data loss.
- Fix the stale-lock test stream/cleanup race and restore a green baseline.
- Add browser instrumentation and reproduce the STL lifecycle failure.
- Fix stable preview source identity and WebGL canvas lifecycle.
- Prove upload, slicing, success, refresh, relogin, failure, and re-slice preview states.

### Phase07-A3 - Geometry identification and STEP conversion spike

- Add extension + MIME + content signature validation.
- Validate STEP Part 21 markers and reject malformed content.
- Receive the original `04NF12.STEP` and record its source SHA/size.
- Test PrusaSlicer direct input in an isolated TEST directory; do not assume support from help text.
- If direct STEP is unsupported/unreliable, submit a separate environment/install approval for one stable Open Cascade or FreeCAD CLI converter.
- Generate a bounded preview/slicing mesh, verify units/dimensions, save artifact SHA/tool/version/log, and never overwrite the STEP source.

### Phase07-A4 - Server-authoritative 10-300 mm eligibility

- Add the shared pure eligibility helper and all STL/STEP boundary fixtures.
- Run geometry analysis before automatic slice creation.
- Make the entire order manual when any file is manual.
- Ensure manual mode creates no automatic slicing work and no automatic total.

### Phase07-A5 - Homepage

- Rebuild the first viewport around the actual quote action.
- Keep secondary service cards compact and clickable.
- Validate four required viewport groups, nav/auth, SEO, and zero horizontal overflow with screenshots.

### Phase07-A6 - Workbench drafts and guarded sync

- Apply the approved local migration and date-only input.
- Implement reference/confirmed price semantics, dirty state, reply regeneration protection, and persisted sync diagnostics.
- Rehearse the approved online additive migration on a database copy before any production migration.
- Implement TEST-only field sync, diff preview, second confirmation, conflict UI, idempotency, restart persistence, and customer readback.
- Keep real-order sync disabled.

### Phase07-A7 - Full acceptance

- Real `04NF12.STEP` upload -> identify -> conversion -> preview -> dimensions -> eligibility -> slice -> parser -> quote.
- TEST order local edit -> preview -> online sync -> online admin/customer readback.
- Regression for order 42, order list, Explorer, login/register, invoices/legal evidence, file sync Worker, slicing Worker APIs, payment/refund/WeChat Pay.
- Production deployment remains a separate explicitly approved stage.

## 10. Test Matrix

- Homepage: 1920x1080, 1366x768, 1024x768, mobile; CTA and secondary links; no overflow.
- STL preview: selected file, uploaded draft URL, slicing, success, failure, refresh, relogin, re-slice.
- File identity: lower/upper STL/STP/STEP, MIME mismatch, invalid signature, null bytes, oversized file, malformed Part 21.
- Geometry bounds for both STL and STEP: `9.99`, `10`, `10x50x50`, `299.99`, `300`, `300.01`, `301`, `400`.
- Manual rule: no PrusaSlicer spawn, no slicing row/job, no misleading total.
- STEP: original/derived SHA, unit, dimensions, converter version, artifact paths, non-empty G-code, time, weight, quote, refresh persistence.
- Workbench: date keyboard/picker/clear/invalid/past/persistence; quote default and dirty preservation; reply edit/regenerate behavior.
- Sync: TEST success, idempotent replay, reused-key conflict, version conflict, field validation, network loss, retry, restart, no duplicate message.
- Security: real write rejected, field allowlist, token/log redaction, no payment/refund/WeChat/upload mutation.

## 11. Current Verification Results

- `npm run lint`: passed.
- `npm run build`: passed; Next.js production build generated 52 routes/pages.
- `npm test`: failed baseline with 448 tests total, 445 passed, 1 failed, 2 skipped.
- Failure: `stale lock path alone does not block when flock grants the descriptor lock`.
- Failure detail: test cleanup received `ENOTEMPTY` while removing its temporary directory. The mocked child emits `close` before file streams are demonstrably closed, creating a cleanup race. This must be corrected as baseline hygiene before Phase07 feature tests are trusted.

## 12. Risks And Stop Conditions

- Do not start STEP implementation without the original `04NF12.STEP` or report synthetic data as real acceptance.
- Do not install a CAD converter until its source/version/resource isolation plan is approved.
- Do not trust browser dimensions or filenames for quote eligibility.
- Do not reuse a G-code path as a model preview URL.
- Do not overwrite original STEP/STL uploads.
- Do not auto-slice manual quote files.
- Do not mutate real orders before TEST-only sync acceptance.
- Do not map local review states directly onto order/payment states.
- Do not deploy or migrate production from the current dirty worktree.
- Stop if inherited Phase06 changes cannot be separated into a reproducible baseline without losing order 42, local file, Explorer, slicing, or order-list behavior.

## 13. Approval Gate

Phase07-A1 is complete as an audit and migration design only. Phase07-A2 may begin after approval of:

1. The additive online/local schema design.
2. The field matrix and first-sync allowlist.
3. The implementation order.
4. The requirement to supply the original `04NF12.STEP` before real STEP acceptance.

No production deployment is approved.
