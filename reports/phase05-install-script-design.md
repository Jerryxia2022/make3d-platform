# Phase05-A Offline PrusaSlicer Install Script Design

Date: 2026-07-14
Status: script generated, not executed

## Goal

Provide an offline-executable WSL script that the user can run manually after closing Windows VPN/proxy. The script installs and validates PrusaSlicer CLI from the existing Ubuntu APT configuration.

Generated script:

```text
scripts/phase05-install-prusaslicer.sh
```

Expected manual execution inside Ubuntu WSL:

```bash
cd /mnt/c/Users/21899/Documents/make3d-platform
bash scripts/phase05-install-prusaslicer.sh
```

## Hard Limits

The script must not:
- modify Windows proxy settings
- modify Clash/Mihomo configuration
- modify WSL network mode
- modify persistent DNS files
- modify Make3D production code
- modify databases
- modify WeChat Pay
- modify upload limits
- modify quote logic
- use third-party download sources for PrusaSlicer
- download unknown binaries
- start automatic slicing
- connect to real orders

## Script Behavior

The script uses:

```bash
#!/bin/bash
set -e
```

It prints colored logs:

```text
INFO
SUCCESS
ERROR
```

It stops immediately when a required command fails.

On failure, a trap writes:

```text
reports/phase05-install-result.md
```

The result report records the failed step, exit code, log paths, and next-step recommendation.

Chinese runtime messages are stored as Bash Unicode escapes in ASCII source text to avoid Windows/WSL source encoding damage.

## Step 1: Environment Check

The script checks:
- Ubuntu version from `/etc/os-release`
- WSL environment via `/proc/version`
- current user and uid/gid
- disk space for `/` and `/srv`
- systemd state
- `make3d-file-sync-worker.service` status when systemd is available

Failure behavior:

```text
If the environment is not Ubuntu WSL or systemd is not running, stop.
```

## Step 2: Proxy Detection

The script checks:

```bash
HTTP_PROXY
HTTPS_PROXY
ALL_PROXY
```

If any are present, it prints the required warning from this ASCII-safe Bash value:

```bash
PROXY_WARNING=$'\u68c0\u6d4b\u5230\u4ee3\u7406\u53d8\u91cf\uff0c\u8bf7\u786e\u8ba4VPN\u5df2\u7ecf\u5173\u95ed\u3002'
```

Then it unsets only the current shell variables:

```bash
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY
unset http_proxy https_proxy all_proxy
```

No persistent proxy configuration is modified.

## Step 3: Network Detection

The script tests:

```bash
curl -I https://archive.ubuntu.com
curl -I https://security.ubuntu.com
```

Each curl command writes its own log under:

```text
logs/
```

Failure behavior:

```text
If either endpoint is unreachable, stop before apt update or install.
```

## Step 4: APT Update

The script runs:

```bash
sudo apt update
```

APT update log:

```text
logs/phase05-apt-update.log
```

The script also records the current APT source files and `apt-cache policy prusa-slicer`.

## Step 5: Install PrusaSlicer

The script runs:

```bash
sudo apt install -y --no-install-recommends prusa-slicer
```

Install log:

```text
logs/phase05-prusaslicer-install.log
```

Before install, the script verifies that the candidate package metadata contains:

```text
Origin: Ubuntu
```

If the candidate does not appear to come from Ubuntu, the script stops.

## Step 6: CLI Verification

The script verifies:

```bash
which prusa-slicer
prusa-slicer --help > logs/version-help.log 2>&1
ldd "$(which prusa-slicer)"
```

Logs:

```text
logs/version-help.log
logs/phase05-prusaslicer-version.log
logs/phase05-prusaslicer-help.log
logs/phase05-prusaslicer-ldd.log
```

The script identifies the version from the first line containing `PrusaSlicer-` in `logs/version-help.log`, and checks the same output contains `Usage: prusa-slicer`.

The script may still run this command for compatibility diagnostics only:

```bash
prusa-slicer --version
```

That command is allowed to return nonzero and must not stop the script.

The script checks for missing dynamic dependencies by searching for:

```text
not found
```

## Step 7: Worker Directories

The script ensures these directories exist:

```text
/srv/make3d-worker/config/prusaslicer
/srv/make3d-worker/processing/prusaslicer
/srv/make3d-worker/test-slicer
```

Ownership is assigned to `make3d-worker:make3d-worker` if that user exists.

## Step 8: Result Report

The script writes:

```text
reports/phase05-install-result.md
```

The report includes:
- execution time
- Ubuntu version
- PrusaSlicer version
- binary path
- install source evidence
- dependency check result
- test result
- error logs
- current risks
- next-step recommendation

On success the final runtime output is generated from this ASCII-safe Bash value:

```bash
DONE_MESSAGE=$'PrusaSlicer\u5b89\u88c5\u5b8c\u6210\uff0c\u8bf7\u91cd\u65b0\u5f00\u542fVPN\u540e\u7ee7\u7eed\u6d4b\u8bd5\u3002'
```

## Stop Point

The script has been generated only.

It has not been executed.

Wait for the user to close VPN/proxy and manually run it inside Ubuntu WSL.
