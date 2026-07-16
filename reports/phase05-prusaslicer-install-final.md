# Phase05-A PrusaSlicer Install Validation Final

Date: 2026-07-14
Status: blocked before install completion

## Scope

This phase was limited to installing and validating PrusaSlicer CLI in the WSL Ubuntu Worker environment.

This phase did not:
- modify quote logic
- modify order amounts
- modify WeChat Pay code or configuration
- modify upload limits
- generate real customer G-code
- integrate automatic slicing or automatic quote logic
- deploy any production slicing service

## Environment Confirmation

WSL environment:

```text
Ubuntu 24.04 LTS
x86_64
systemd: running
make3d-file-sync-worker.service: active
```

The Phase04 Worker sync chain was already validated in:

```text
reports/phase04-operational-validation-final.md
```

## Requested Installation Source

Requested source:

```text
Ubuntu official APT source
```

Observed package policy before install:

```text
Package: prusa-slicer
Installed: (none)
Candidate: 2.7.2+dfsg-1build2
Source list entry: http://archive.ubuntu.com/ubuntu noble/universe amd64 Packages
```

Ubuntu package metadata from the existing apt cache:

```text
Version: 2.7.2+dfsg-1build2
Filename: pool/universe/s/slic3r-prusa/prusa-slicer_2.7.2+dfsg-1build2_amd64.deb
SHA256: df4b7332f63f2cfb6f26a6eaca452f40a93fb93ee26ce818b7973028808315be
```

## Install Attempt

Command attempted:

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends prusa-slicer
```

Result:

```text
Installation failed before packages could be downloaded.
prusa-slicer remains uninstalled.
```

Observed network failure:

```text
archive.ubuntu.com, security.ubuntu.com, deb.nodesource.com, and cli.github.com resolved to 198.18.0.x addresses in WSL.
Direct WSL download attempts timed out.
The Windows/WSL proxy endpoint was reachable at 172.30.64.1:7897.
HTTP requests through that proxy returned 502 Bad Gateway for Ubuntu archive URLs.
HTTPS attempts to archive.ubuntu.com and security.ubuntu.com failed during TLS handshake through the proxy.
```

A temporary HTTPS-only official Ubuntu APT source was also tested without modifying `/etc/apt` persistently:

```text
https://archive.ubuntu.com/ubuntu
https://security.ubuntu.com/ubuntu
```

Result:

```text
apt update failed with TLS handshake errors through the proxy.
```

Third-party Ubuntu mirrors were intentionally not used because this phase explicitly requested the Ubuntu official APT source.

## Binary Path And Version

Expected binary path:

```text
/usr/bin/prusa-slicer
```

Actual result:

```text
command -v prusa-slicer: not found
prusa-slicer --version: not executed because the binary is not installed
```

## Dependency Check

Requested check:

```bash
ldd "$(command -v prusa-slicer)" | grep "not found" || true
```

Actual result:

```text
Not executed because prusa-slicer is not installed.
```

## Worker Directories

The PrusaSlicer local working directories were created:

```text
/srv/make3d-worker/config/prusaslicer
/srv/make3d-worker/processing/prusaslicer
```

Observed permissions:

```text
drwxr-x--- make3d-worker make3d-worker /srv/make3d-worker/config/prusaslicer
drwxr-x--- make3d-worker make3d-worker /srv/make3d-worker/processing/prusaslicer
```

## TEST STL Result

No TEST STL slicing was executed.

Reason:

```text
PrusaSlicer CLI was not installed due to official APT source download failure.
```

## G-code Path

Expected test output path:

```text
/srv/make3d-worker/processing/prusaslicer/test/test.gcode
```

Actual result:

```text
No G-code was generated.
```

## Safety Check

No commands in this phase referenced or modified:

```text
/app/uploads
production database files
WeChat Pay certificate files
WeChat Pay private keys
WeChat Pay APIv3 key
quote logic
order amount logic
upload limit logic
payment logic
```

No real customer files were used.

## Risk

Current blocker:

```text
The WSL network path cannot download from the requested official Ubuntu APT source.
```

Operational risk:

```text
Phase05-A cannot validate PrusaSlicer CLI until official APT package downloads are available.
```

Compliance risk avoided:

```text
Third-party mirrors were not used without explicit approval.
```

## Rollback

No PrusaSlicer package was installed, so no package rollback is required.

If the created directories need to be removed later:

```bash
sudo rm -rf /srv/make3d-worker/config/prusaslicer
sudo rm -rf /srv/make3d-worker/processing/prusaslicer
```

Do not run the rollback unless explicitly approved, because these directories are safe placeholders for the next retry.

## Next Stage Recommendation

Before retrying Phase05-A install, choose one approved network/package path:

1. Restore WSL access to the official Ubuntu APT source and retry the same install commands.
2. Approve use of an Ubuntu mirror while retaining Ubuntu package signature verification.
3. Provide an internally downloaded official `.deb` package set plus dependencies for local apt installation.

Do not proceed to automatic quote, production slicing, or real customer G-code generation until PrusaSlicer CLI install and synthetic TEST STL slicing both pass.
