# Phase05-B PrusaSlicer CLI Validation Final

Date: 2026-07-14
Status: passed

## Scope

This phase validated that the installed PrusaSlicer CLI can slice one synthetic TEST STL in WSL.

This phase did not:
- use real customer files
- use paid order files
- modify customer orders
- modify quote logic
- modify order amounts
- modify WeChat Pay
- modify upload limits
- connect slicing output to production database
- enter automatic quote stage
- deploy a production slicing service

## 1. PrusaSlicer Installation Status

```text
installed: yes
package: prusa-slicer
package_version: 2.7.2+dfsg-1build2
binary_path: /usr/bin/prusa-slicer
dynamic_dependencies: passed, no `not found`
```

## 2. Corrected Version Identification

The Ubuntu 24.04 package does not support `prusa-slicer --version` as a successful command.

Corrected validation method:

```bash
prusa-slicer --help > logs/version-help.log 2>&1
```

Required checks:

```text
exit_code: 0
output contains: PrusaSlicer-
output contains: Usage: prusa-slicer
```

Observed version banner:

```text
PrusaSlicer-2.7.2+UNKNOWN based on Slic3r (with GUI support)
```

`prusa-slicer --version` is now diagnostic-only in `scripts/phase05-install-prusaslicer.sh` and is allowed to return nonzero.

## 3. CLI Supported Parameters

Checked through `prusa-slicer --help`:

```text
--export-gcode: present
--output: present
--load: present
```

## 4. TEST STL

Path:

```text
/srv/make3d-worker/test-slicer/input/test-cube-20mm.stl
```

Model:

```text
20 mm x 20 mm x 20 mm closed cube
generated locally by script
not downloaded
not a customer model
not an order file
```

File size:

```text
1496 bytes
```

SHA-256:

```text
7ed7afa75e9d981c2829ccaa3e88f8e60dc19d852074a01c748b06911445b8d6
```

Permissions:

```text
-rw------- make3d-worker:make3d-worker 600
```

## 5. Test Directories

```text
/srv/make3d-worker/test-slicer/input
/srv/make3d-worker/test-slicer/output
/srv/make3d-worker/test-slicer/logs
```

Observed directory permissions:

```text
drwxr-x--- make3d-worker:make3d-worker 750 /srv/make3d-worker/test-slicer/input
drwxr-x--- make3d-worker:make3d-worker 750 /srv/make3d-worker/test-slicer/output
drwxr-x--- make3d-worker:make3d-worker 750 /srv/make3d-worker/test-slicer/logs
```

## 6. PrusaSlicer Configuration

Path:

```text
/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini
```

Source:

```text
profiles/bambu-p1s.ini
```

Source basis:

```text
Make3D baseline PrusaSlicer profile for Bambu Lab P1S.
README documents this profile as the default Bambu Lab P1S / 0.4mm nozzle / FDM baseline estimate config.
The profile itself states it is used for backend estimate tests only and is not a final production print profile.
```

Configuration SHA-256:

```text
4437bf3e44534004aa51db7c6de16c13c130f62de3cd3b14d52194a7eb4f6e0f
```

Important boundary:

```text
This validation proves CLI slicing works with the baseline profile. It does not approve final production print settings.
```

## 7. CLI Command

Executed as:

```text
make3d-worker
```

Command:

```bash
timeout 120 prusa-slicer \
  --export-gcode \
  --load /srv/make3d-worker/config/prusaslicer/bambu-p1s.ini \
  --output /srv/make3d-worker/test-slicer/output/test-cube-20mm.gcode \
  --filament-type PLA \
  --layer-height 0.2 \
  --fill-density 50% \
  /srv/make3d-worker/test-slicer/input/test-cube-20mm.stl
```

## 8. Slice Result

Start:

```text
2026-07-14T17:25:30+08:00
```

End:

```text
2026-07-14T17:25:30+08:00
```

Duration:

```text
539 ms
```

Exit code:

```text
0
```

## 9. G-code

Path:

```text
/srv/make3d-worker/test-slicer/output/test-cube-20mm.gcode
```

Exists:

```text
yes
```

Size:

```text
284994 bytes
```

SHA-256:

```text
3e3167180827ea84c62e92cf6143313fb3d068f716be7cb872867504d8b20702
```

Validation:

```text
file exists: yes
file non-empty: yes
contains common G-code content: yes
contains obvious HTML/error text: no
PrusaSlicer exit code: 0
stderr blocking errors: no
```

This phase does not use G-code size, print time, material weight, layer count, or other slicing-derived data for pricing.

## 10. stdout/stderr Summary

stdout:

```text
10 => Processing triangulated mesh
20 => Generating perimeters
30 => Preparing infill
45 => Making infill
65 => Searching support spots
69 => Alert if supports needed
89 => Calculating overhanging perimeters
88 => Generating skirt and brim
90 => Exporting G-code to /srv/make3d-worker/test-slicer/output/test-cube-20mm.gcode
Slicing result exported to /srv/make3d-worker/test-slicer/output/test-cube-20mm.gcode
```

stderr:

```text
empty
```

## 11. Test Results

```text
node --test tests/workerLocalSync.test.mjs: passed, 5 tests
npm test: passed, 184 tests
npm run lint: passed
npm run build: passed
```

Coverage notes:

```text
Worker file sync tests passed.
WeChat Pay tests passed as part of npm test.
Legal, invoice, and evidence snapshot tests passed as part of npm test.
No order amount logic was modified.
```

## 12. Modified Files

Repository files changed in this phase:

```text
scripts/phase05-install-prusaslicer.sh
reports/phase05-install-result.md
reports/phase05-prusaslicer-cli-validation-final.md
changelog/CHANGELOG.md
```

Local WSL test artifacts:

```text
/srv/make3d-worker/test-slicer/input/test-cube-20mm.stl
/srv/make3d-worker/test-slicer/output/test-cube-20mm.gcode
/srv/make3d-worker/test-slicer/logs/stdout.log
/srv/make3d-worker/test-slicer/logs/stderr.log
/srv/make3d-worker/test-slicer/logs/summary.txt
/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini
```

## 13. Risk

The baseline profile is suitable for CLI and estimate validation only. It is not a final production print profile.

The generated G-code is only a synthetic test artifact. It must not be used for customer production or pricing.

## 14. Phase05-C Readiness

```text
ready_for_phase05_c_slicing_result_parse_design: yes
```

Reason:

```text
PrusaSlicer CLI is installed, callable, and can generate a G-code file from a synthetic STL with the Make3D baseline profile under the make3d-worker user.
```

Next phase should be design-only unless separately approved:

```text
Phase05-C: slicing result parsing design
```
