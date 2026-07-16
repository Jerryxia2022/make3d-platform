# Phase05-C Parser Implementation Final Report

Date: 2026-07-14
Status: completed, not deployed

## Scope

Phase05-C implemented a pure PrusaSlicer G-code result parser for TEST/synthetic slicing output.

This phase did not:

- create database migrations
- modify production database data
- modify quote pricing logic
- modify order totals or order status
- modify payment or WeChat Pay code
- modify upload limits
- deploy production slicing service
- use real customer files
- write slicing results to production state

## Modified Files

```text
worker/prusaslicer-result-parser.mjs
tests/prusaslicerResultParser.test.mjs
tests/fixtures/prusaslicer/README.md
reports/phase05-c-slicing-result-parsing-design.md
reports/phase05-c-parser-implementation-final.md
changelog/CHANGELOG.md
```

## Implementation Summary

Added:

- `worker/prusaslicer-result-parser.mjs`
- stable `slice_params_json`
- stable `slice_params_sha256`
- `metric_sources_json`
- `metric_validation_json`
- separate `parse.status` and `validation.quote_ready`
- guarded file path boundary checks
- empty file, HTML/error page, oversize file, and path traversal rejection
- tail-window parsing from 1 MiB up to 8 MiB
- streaming structural scan for `;LAYER_CHANGE` and `;Z:`
- duration parsing for seconds, minutes, hours, and days

The parser reads only a caller-specified G-code file, computes SHA-256, extracts metrics, and returns a normalized JSON object.

## Parsed Metrics

Supported fields:

```text
estimated printing time (normal mode)
estimated printing time (silent mode)
filament used [mm]
filament used [cm3]
total filament used [g]
filament_type
printer_model
nozzle_diameter
layer_height
layer_count from LAYER_CHANGE markers
max_layer_z from Z markers
```

Normalized output units:

```text
print_time_seconds
silent_print_time_seconds
filament_length_microns
filament_volume_mm3
filament_weight_mg
layer_count
max_layer_z_microns
filament_type
printer_model
nozzle_diameter_microns
layer_height_microns
gcode_size_bytes
gcode_sha256
```

## Current TEST Expected Result

The synthetic Phase05-B cube fixture expectation is covered by automated tests:

```text
parse_status: parsed
print_time_seconds: 1496
silent_print_time_seconds: 1544
filament_length_microns: 2116640
filament_volume_mm3: 5090
filament_weight_mg: 0
layer_count: 100
max_layer_z_microns: 20000
metrics_status: warning
quote_ready: false
invalid_fields includes: filament_weight_mg
warning includes: explicit source weight is zero while filament volume is nonzero
```

The parser does not derive weight from volume or density.

## Database Changes

None.

No `slicing_jobs` migration was created in Phase05-C.

## Configuration Changes

None.

No `.env.local`, `.env.production`, Worker token, WeChat Pay, upload, quote, or order configuration was changed.

## Test Coverage

Added `tests/prusaslicerResultParser.test.mjs` with 24 parser tests covering:

- complete G-code
- missing weight
- explicit zero weight
- volume greater than zero with zero weight
- missing time
- field order changes
- CRLF and LF
- empty file
- HTML/error page
- truncated file
- duplicate fields
- abnormal duration units
- long comments
- unknown banner/version
- layer count derivation
- max Z derivation
- path traversal rejection
- oversize rejection
- tail-window expansion
- duration parser variants
- stable slice parameter JSON
- stable slice parameter SHA for reordered input
- changed SHA when parameters change

## Test Results

```text
node --test tests/prusaslicerResultParser.test.mjs
Result: passed, 24/24

node --test tests/workerLocalSync.test.mjs
Result: passed, 5/5

npm test
Result: passed, 208/208

npm run lint
Result: passed

npm run build
Result: passed
```

Build completed with the existing Node SQLite experimental warnings only.

## Security Checks

Confirmed by implementation and tests:

- realpath boundary check is required before reading a G-code file
- default allowed directory is `/srv/make3d-worker/test-slicer/output`
- tests can explicitly provide fixture directories
- path traversal and outside-root files are rejected
- empty files are rejected
- HTML/error pages are rejected
- oversize files are rejected before parsing
- parser does not import database, order, quote, customer, or WeChat Pay modules
- parser does not log file contents or tokens

## Risks

- PrusaSlicer output may vary across versions, profiles, and printer settings.
- The current TEST profile reports `total filament used [g] = 0.00` while volume is nonzero, so output is intentionally not quote-ready.
- Layer count and max Z are derived metrics, not explicit PrusaSlicer summary fields in the current sample.
- Future automatic quote logic must define a separately approved material weight policy.

## Rollback Method

To roll back Phase05-C implementation:

```text
remove worker/prusaslicer-result-parser.mjs
remove tests/prusaslicerResultParser.test.mjs
remove tests/fixtures/prusaslicer/README.md
revert Phase05-C changelog/report updates
```

No database rollback is required.

## Next Phase Recommendation

Phase05-D should be a design-only phase before implementation.

Recommended focus:

- design `slicing_jobs` database schema
- decide whether parsed metrics are stored before quote integration
- define how parser output links to local Worker slicing attempts
- keep parser metrics separate from price calculation
- explicitly design material weight policy before any automatic quote use
