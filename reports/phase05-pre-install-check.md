# Phase05-A Pre Install Check

Date: 2026-07-14
Status: completed

## Scope

This report records the environment check before retrying PrusaSlicer CLI installation after the user manually disabled Windows VPN/proxy.

This phase did not:
- modify Windows proxy settings
- modify Clash/Mihomo configuration
- modify WSL network mode
- modify persistent DNS files
- modify Make3D production code
- modify WeChat Pay
- modify upload limits
- modify quote logic
- install PrusaSlicer

## Ubuntu

```text
PRETTY_NAME=Ubuntu 24.04 LTS
VERSION_ID=24.04
VERSION_CODENAME=noble
KERNEL=6.6.114.1-microsoft-standard-WSL2
ARCH=x86_64
```

## WSL

```text
WSL version: 2.7.3.0
Kernel version: 6.6.114.1-1
Windows version: 10.0.26200.8655
```

## Current User

```text
user=codex
uid=1001(codex)
gid=1002(codex)
groups=1002(codex),27(sudo),108(docker)
```

## systemd

```text
systemctl is-system-running: running
```

## make3d-worker Service

```text
make3d-file-sync-worker.service: active (running)
Loaded: /etc/systemd/system/make3d-file-sync-worker.service
Main PID: 2682
Command: /usr/bin/node /srv/make3d-worker/make3d-file-sync-worker.mjs
```

## Proxy Residue Check

Command:

```bash
env | grep -i proxy
```

Result:

```text
No HTTP_PROXY, HTTPS_PROXY, or ALL_PROXY variables were present in the current WSL shell.
```

No unset was required.

## PrusaSlicer Current State

```text
command -v prusa-slicer: not found
```

PrusaSlicer is not installed before this retry.

## Stop Conditions

If the next network check fails, installation must stop and `reports/phase05-network-blocked.md` must be generated.
