# Phase05-A PrusaSlicer Install And CLI Design

Date: 2026-07-14
Status: design only, not installed

## Goal

Prepare a safe PrusaSlicer CLI installation plan for the WSL Ubuntu Worker.

This phase does not:
- modify automatic quote prices
- modify order amounts
- modify payment logic
- modify upload limits
- generate real customer order G-code
- deploy a production slicing service

## Current Environment

WSL:

```text
Ubuntu 24.04 LTS (Noble Numbat)
x86_64
16 vCPU
19GiB RAM
951GiB free disk
systemd running
```

Current PrusaSlicer state:

```text
Installed: none
```

## Preferred Installation Source

Preferred source:
- Ubuntu 24.04 official APT repository, `noble/universe`.

Reason:
- stable package for the current Ubuntu release
- dependency-managed
- easy to audit and remove
- installs into standard system paths
- avoids downloading ad hoc binaries in this phase

APT candidate observed:

```text
Package: prusa-slicer
Version: 2.7.2+dfsg-1build2
Origin: Ubuntu
Section: universe/misc
Filename: pool/universe/s/slic3r-prusa/prusa-slicer_2.7.2+dfsg-1build2_amd64.deb
SHA256: df4b7332f63f2cfb6f26a6eaca452f40a93fb93ee26ce818b7973028808315be
```

Expected binary path after installation:

```text
/usr/bin/prusa-slicer
```

Expected version check:

```bash
prusa-slicer --version
```

## Dependencies

APT reports these notable dependency groups:
- Boost libraries
- GTK/wxWidgets libraries
- OpenGL/GLEW libraries
- OCCT libraries
- OpenVDB
- TBB
- Noto fonts
- zlib/libpng/libjpeg

Package installed size:

```text
131996 KiB
```

Package download size:

```text
34808846 bytes
```

## Installation Command Design

Do not run until Phase05-A install approval:

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends prusa-slicer
prusa-slicer --version
command -v prusa-slicer
```

Post-install validation:

```bash
prusa-slicer --help | head -n 40
ldd "$(command -v prusa-slicer)" | grep "not found" || true
```

Rollback:

```bash
sudo apt-get remove -y prusa-slicer
sudo apt-get autoremove -y
```

## Alternative Source Not Chosen

Alternative:
- Prusa Research upstream release binaries/AppImage.

Reason not preferred for Phase05-A:
- requires separate binary verification and update policy
- may include GUI/AppImage runtime assumptions
- less aligned with WSL system service management than Ubuntu APT

This can be revisited if the Ubuntu package fails CLI validation.

## CLI Invocation Design

Input:

```text
STL file path under /srv/make3d-worker/files/
```

Allowed input rule:
- input must already be synced and verified by Phase04 Worker
- input path must resolve inside `/srv/make3d-worker/files`
- no direct reads from production cloud uploads
- no path traversal

Output:

```text
/srv/make3d-worker/processing/prusaslicer/<job_id>/<safe_basename>.gcode
/srv/make3d-worker/processing/prusaslicer/<job_id>/prusaslicer.stdout.log
/srv/make3d-worker/processing/prusaslicer/<job_id>/prusaslicer.stderr.log
/srv/make3d-worker/processing/prusaslicer/<job_id>/summary.json
```

Future result promotion:
- only after explicit approval, validated output may move to `/srv/make3d-worker/results`
- no customer-facing price or order status changes in Phase05-A

Draft command shape:

```bash
prusa-slicer \
  --export-gcode \
  --load /srv/make3d-worker/config/prusaslicer/bambu-p1s.ini \
  --output /srv/make3d-worker/processing/prusaslicer/<job_id>/<safe_basename>.gcode \
  /srv/make3d-worker/files/<order_no>/<file_id>-<safe_filename>.stl
```

Execution guardrails:
- run under `make3d-worker`
- per-job working directory
- timeout required before production use
- capture stdout/stderr
- record exit code
- verify G-code file exists and size is nonzero
- do not parse or apply price changes in Phase05-A
- do not update order amount
- do not update payment state

## Test Plan After Install Approval

Use only a synthetic or TEST STL:
- not a real customer paid order
- not a production order G-code

Validation:
- `command -v prusa-slicer`
- `prusa-slicer --version`
- CLI exits successfully for a tiny TEST STL
- G-code is generated only under `/srv/make3d-worker/processing`
- stdout/stderr are captured
- no Make3D order amount, quote, payment, upload limit, or WeChat Pay setting changes

## Current Stop Point

This report is design-only.

PrusaSlicer has not been installed.
