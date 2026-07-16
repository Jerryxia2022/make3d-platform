# Phase05-A Network Fix Design

Date: 2026-07-14
Status: design only, pending approval

## Goal

Restore or confirm WSL network access to Ubuntu official APT sources so Phase05-A PrusaSlicer installation can be retried safely.

This design does not:
- install PrusaSlicer
- use third-party APT sources
- modify production
- modify WeChat Pay
- modify upload logic
- modify quote logic
- modify order logic

## Current Evidence

WSL:

```text
No HTTP_PROXY, HTTPS_PROXY, or ALL_PROXY is set.
Network mode appears to be WSL2 NAT-style networking.
Default gateway: 172.30.64.1
Generated DNS resolver: 10.255.255.254
archive.ubuntu.com resolves to 198.18.0.89
security.ubuntu.com resolves to 198.18.0.90
Direct curl to those addresses times out.
```

Windows:

```text
Proxy process: verge-mihomo
Listening ports: 7892, 7897
WinHTTP/User proxy: 127.0.0.1:7897
WSL can reach proxy at 172.30.64.1:7892 and 172.30.64.1:7897
```

Explicit proxy results from WSL:

```text
172.30.64.1:7892:
  archive.ubuntu.com: Proxy CONNECT aborted
  security.ubuntu.com: connection reset by peer

172.30.64.1:7897:
  archive.ubuntu.com: CONNECT 200, TLS SSL_ERROR_SYSCALL
  security.ubuntu.com: CONNECT 200, TLS SSL_ERROR_SYSCALL
```

## Fix Principle

Use the Ubuntu official APT source only.

Do not switch to a third-party mirror in this phase.

The desired final state is:

```text
WSL curl can reach archive.ubuntu.com and security.ubuntu.com.
apt-get update can fetch Ubuntu indexes without archive/security failures.
No production Make3D configuration is changed.
No payment or business logic is changed.
```

## Recommended Plan

### Step 1: Fix Windows Proxy Route For Ubuntu Domains

In verge-mihomo / Clash UI, verify routing for these domains:

```text
archive.ubuntu.com
security.ubuntu.com
deb.nodesource.com
cli.github.com
```

Recommended setting:

```text
Route the Ubuntu APT domains through a healthy proxy node or a confirmed working direct route.
Do not leave them in a fake-ip path that WSL cannot complete.
```

Reason:

```text
WSL can reach the proxy service, but the proxy does not complete TLS to Ubuntu official domains.
Fixing proxy routing first addresses the observed CONNECT/TLS failure.
```

Validation after this step:

```bash
hostip="$(ip route | awk '/default/ {print $3; exit}')"
curl -I -x "http://$hostip:7897" https://archive.ubuntu.com/
curl -I -x "http://$hostip:7897" https://security.ubuntu.com/
```

Expected:

```text
HTTP 200/301/302/403 response headers are acceptable for connectivity.
TLS handshake must complete.
No SSL_ERROR_SYSCALL.
No Proxy CONNECT aborted.
```

### Step 2: Add Temporary WSL Proxy Environment For Diagnostics

After proxy route is confirmed, test without persistent changes:

```bash
hostip="$(ip route | awk '/default/ {print $3; exit}')"
export HTTP_PROXY="http://$hostip:7897"
export HTTPS_PROXY="http://$hostip:7897"
export ALL_PROXY="http://$hostip:7897"

curl -I https://archive.ubuntu.com/
curl -I https://security.ubuntu.com/
```

This does not write files and can be reverted by closing the shell.

### Step 3: Add Temporary APT Proxy Only For The Retry

Do not persist apt proxy config until the temporary test passes.

Retry APT using command-line options:

```bash
hostip="$(ip route | awk '/default/ {print $3; exit}')"
sudo apt-get \
  -o Acquire::http::Proxy="http://$hostip:7897" \
  -o Acquire::https::Proxy="http://$hostip:7897" \
  update
```

Expected:

```text
Ubuntu archive/security indexes fetch successfully.
No archive.ubuntu.com timeout.
No security.ubuntu.com timeout.
```

### Step 4: Optional Persistent WSL Proxy Config

Only if repeated Phase05 operations require it, create a dedicated WSL proxy profile.

Candidate file:

```text
/etc/profile.d/make3d-worker-proxy.sh
```

Candidate content:

```bash
#!/usr/bin/env bash
hostip="$(ip route | awk '/default/ {print $3; exit}')"
export HTTP_PROXY="http://${hostip}:7897"
export HTTPS_PROXY="http://${hostip}:7897"
export ALL_PROXY="http://${hostip}:7897"
export NO_PROXY="localhost,127.0.0.1,::1,172.16.0.0/12,10.0.0.0/8,192.168.0.0/16"
```

Risk:

```text
This affects interactive WSL shells. It should not be added until proxy routing is confirmed.
```

### Step 5: Optional Persistent APT Proxy Config

Only if temporary APT proxy succeeds and repeated package work is expected.

Candidate file:

```text
/etc/apt/apt.conf.d/95make3d-proxy
```

Candidate content:

```text
Acquire::http::Proxy "http://172.30.64.1:7897";
Acquire::https::Proxy "http://172.30.64.1:7897";
```

Risk:

```text
WSL gateway IP can change after restart. If persisted, this may need regeneration or a stable mirrored-network approach.
```

Because of that risk, command-line temporary APT proxy is preferred for the immediate PrusaSlicer install retry.

## Alternative Plan: WSL DNS Reset

If the proxy route is healthy but WSL still resolves official domains to fake-ip addresses and direct access is desired, review a DNS-only fix.

Candidate changes:

```text
/etc/wsl.conf
[network]
generateResolvConf = false

/etc/resolv.conf
nameserver 1.1.1.1
nameserver 8.8.8.8
```

Then restart WSL:

```powershell
wsl --shutdown
```

Risk:

```text
This changes global DNS behavior for the WSL distro.
It may break existing proxy/TUN assumptions.
It is not the first recommended fix because current direct WSL egress already times out.
```

## Alternative Plan: Mirrored Networking

If NAT/proxy interaction remains unstable, evaluate WSL mirrored networking.

Candidate Windows user config:

```text
%USERPROFILE%\.wslconfig

[wsl2]
networkingMode=mirrored
autoProxy=true
dnsTunneling=true
```

Then restart WSL:

```powershell
wsl --shutdown
```

Risk:

```text
This changes WSL network behavior for the whole distro.
It can affect Docker, local services, and the Make3D Worker network path.
It should be tested separately before returning to PrusaSlicer install.
```

## Validation Checklist

Before retrying PrusaSlicer install, all of these must pass:

```bash
env | grep -i proxy
cat /etc/resolv.conf
curl -I https://archive.ubuntu.com/
curl -I https://security.ubuntu.com/
sudo apt-get update
```

If using temporary APT proxy, also validate:

```bash
hostip="$(ip route | awk '/default/ {print $3; exit}')"
curl -I -x "http://$hostip:7897" https://archive.ubuntu.com/
curl -I -x "http://$hostip:7897" https://security.ubuntu.com/
sudo apt-get \
  -o Acquire::http::Proxy="http://$hostip:7897" \
  -o Acquire::https::Proxy="http://$hostip:7897" \
  update
```

## Rollback

For temporary shell exports:

```bash
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY
```

For temporary APT command-line options:

```text
No rollback required.
```

For persistent files, if later approved and created:

```bash
sudo rm -f /etc/profile.d/make3d-worker-proxy.sh
sudo rm -f /etc/apt/apt.conf.d/95make3d-proxy
```

For `.wslconfig` or WSL DNS changes:

```text
Restore the previous file contents and run `wsl --shutdown`.
```

## Stop Point

This is a design-only report.

No network settings were changed.

Wait for approval before applying any fix.
