# Phase05-A PrusaSlicer CLI Debug

Date: 2026-07-14
Status: diagnostics completed, no system changes

## Scope

This phase diagnosed the failed Step 6 CLI verification after PrusaSlicer was installed.

This phase did not:
- reinstall PrusaSlicer
- delete PrusaSlicer
- install another PrusaSlicer version
- modify system configuration
- modify Make3D production code
- modify databases
- modify WeChat Pay
- modify upload limits
- modify quote logic

## Installed Binary

```text
/usr/bin/prusa-slicer
```

## Saved Diagnostic Logs

Full command outputs were saved under:

```text
logs/phase05-cli-debug-version.stdout.log
logs/phase05-cli-debug-version.stderr.log
logs/phase05-cli-debug-help.stdout.log
logs/phase05-cli-debug-help.stderr.log
logs/phase05-cli-debug-file.stdout.log
logs/phase05-cli-debug-file.stderr.log
logs/phase05-cli-debug-ldd.stdout.log
logs/phase05-cli-debug-ldd.stderr.log
logs/phase05-cli-debug-dpkg_prusa.stdout.log
logs/phase05-cli-debug-dpkg_prusa.stderr.log
logs/phase05-cli-debug-apt_policy.stdout.log
logs/phase05-cli-debug-apt_policy.stderr.log
logs/phase05-cli-debug-help_head_100.stdout.log
logs/phase05-cli-debug-help_head_100.stderr.log
logs/phase05-cli-debug-summary.txt
```

## 1. Version Check

Command:

```bash
prusa-slicer --version
```

Exit code:

```text
1
```

Stdout:

```text
PrusaSlicer-2.7.2+UNKNOWN based on Slic3r (with GUI support)
https://github.com/prusa3d/PrusaSlicer

Usage: prusa-slicer [ ACTIONS ] [ TRANSFORM ] [ OPTIONS ] [ file.stl ... ]
...
```

Stderr:

```text
Unknown option --version
```

Finding:

```text
The Ubuntu 24.04 prusa-slicer package does not support `--version` as a valid option. It prints version/banner/help text but exits with code 1 because `--version` is unknown.
```

## 2. Help Check

Command:

```bash
prusa-slicer --help
```

Exit code:

```text
0
```

Observed output starts with:

```text
PrusaSlicer-2.7.2+UNKNOWN based on Slic3r (with GUI support)
https://github.com/prusa3d/PrusaSlicer

Usage: prusa-slicer [ ACTIONS ] [ TRANSFORM ] [ OPTIONS ] [ file.stl ... ]
```

Finding:

```text
CLI help works normally.
```

## 3. File Type

Command:

```bash
file "$(which prusa-slicer)"
```

Exit code:

```text
0
```

Output:

```text
/usr/bin/prusa-slicer: ELF 64-bit LSB pie executable, x86-64, version 1 (GNU/Linux), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, BuildID[sha1]=43d1006383358639e6b15388a436eac91be3513f, for GNU/Linux 3.2.0, stripped
```

## 4. Dynamic Library Check

Command:

```bash
ldd "$(which prusa-slicer)"
```

Exit code:

```text
0
```

`not found` check:

```text
No `not found` entries detected.
```

Finding:

```text
No missing dynamic dependencies were found.
```

## 5. Ubuntu Package Check

Command:

```bash
dpkg -l | grep prusa
```

Exit code:

```text
0
```

Output:

```text
ii  prusa-slicer  2.7.2+dfsg-1build2  amd64  G-code generator for 3D printers
```

Command:

```bash
apt-cache policy prusa-slicer
```

Exit code:

```text
0
```

Output:

```text
prusa-slicer:
  Installed: 2.7.2+dfsg-1build2
  Candidate: 2.7.2+dfsg-1build2
  Version table:
 *** 2.7.2+dfsg-1build2 500
        500 http://archive.ubuntu.com/ubuntu noble/universe amd64 Packages
        100 /var/lib/dpkg/status
```

## 6. Help Head Test

Command:

```bash
prusa-slicer --help 2>&1 | head -100
echo $?
```

Exit code:

```text
0
```

Observed output starts with:

```text
PrusaSlicer-2.7.2+UNKNOWN based on Slic3r (with GUI support)
https://github.com/prusa3d/PrusaSlicer

Usage: prusa-slicer [ ACTIONS ] [ TRANSFORM ] [ OPTIONS ] [ file.stl ... ]
```

Finding:

```text
The help path succeeds and returns 0.
```

## Root Cause

The install script failed at Step 6 because it directly executed:

```bash
prusa-slicer --version
```

With `set -e`, the script stopped when `prusa-slicer --version` returned exit code 1.

This is not an installation failure and not a missing-library failure. It is a CLI option compatibility issue in the Ubuntu package:

```text
The binary prints version/banner information, but `--version` is treated as an unknown option.
```

## Current Installation Status

```text
PrusaSlicer installed: yes
Path: /usr/bin/prusa-slicer
Package version: 2.7.2+dfsg-1build2
Help command works: yes
Missing dynamic libraries: no
```

## Recommended Next Step

Do not reinstall.

For the install validation script, replace the strict `prusa-slicer --version` success requirement with one of these safer checks:

```bash
prusa-slicer --help | head -1
```

or:

```bash
prusa-slicer --version > version.log 2> version.err || true
grep -q "PrusaSlicer-" version.log
```

Then proceed to a synthetic TEST STL slicing validation in the next approved step.
