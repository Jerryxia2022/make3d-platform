# Phase05-B1 WSL Temporary Proxy Network Test Final

Date: 2026-07-14
Status: failed, network still blocked

## Scope

This phase only validated temporary WSL proxy access.

This phase did not:
- install PrusaSlicer
- modify Windows proxy settings
- modify Clash/Mihomo settings
- modify WSL network mode
- modify persistent DNS files
- modify production
- modify WeChat Pay
- modify upload logic
- modify quote logic

## Temporary Proxy Setup

Default gateway detected inside WSL:

```text
hostip=172.30.64.1
```

Temporary shell-only proxy variables used:

```bash
export HTTP_PROXY="http://172.30.64.1:7897"
export HTTPS_PROXY="http://172.30.64.1:7897"
export ALL_PROXY="http://172.30.64.1:7897"
```

No persistent proxy configuration was written.

## Curl Test: archive.ubuntu.com

Command:

```bash
curl -Iv https://archive.ubuntu.com/
```

Result:

```text
curl exit: 35
proxy: http://172.30.64.1:7897
proxy TCP connection: successful
CONNECT status: HTTP/1.1 200 Connection established
TLS: failed
HTTP status from origin: none
SSL_ERROR_SYSCALL: yes
CONNECT aborted: no
```

Key diagnostic:

```text
OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to archive.ubuntu.com:443
```

## Curl Test: security.ubuntu.com

Command:

```bash
curl -Iv https://security.ubuntu.com/
```

Result:

```text
curl exit: 35
proxy: http://172.30.64.1:7897
proxy TCP connection: successful
CONNECT status: HTTP/1.1 200 Connection established
TLS: failed
HTTP status from origin: none
SSL_ERROR_SYSCALL: yes
CONNECT aborted: no
```

Key diagnostic:

```text
OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to security.ubuntu.com:443
```

## APT Test With Temporary Proxy Options

Command:

```bash
sudo apt-get \
  -o Acquire::Retries=0 \
  -o Acquire::http::Proxy="http://172.30.64.1:7897" \
  -o Acquire::https::Proxy="http://172.30.64.1:7897" \
  update
```

Result:

```text
apt exit: 100
```

Observed failures:

```text
https://cli.github.com/packages stable InRelease:
  Could not handshake: The TLS connection was non-properly terminated. [IP: 172.30.64.1 7897]

http://archive.ubuntu.com/ubuntu noble InRelease:
  502 Bad Gateway [IP: 172.30.64.1 7897]

https://deb.nodesource.com/node_22.x nodistro InRelease:
  Could not handshake: The TLS connection was non-properly terminated. [IP: 172.30.64.1 7897]

http://security.ubuntu.com/ubuntu noble-security InRelease:
  502 Bad Gateway [IP: 172.30.64.1 7897]

http://archive.ubuntu.com/ubuntu noble-updates InRelease:
  502 Bad Gateway [IP: 172.30.64.1 7897]

http://archive.ubuntu.com/ubuntu noble-backports InRelease:
  502 Bad Gateway [IP: 172.30.64.1 7897]
```

APT also reported unsigned repository errors because the proxy returned `502 Bad Gateway` instead of signed `InRelease` files.

## Result Summary

TLS success:

```text
archive.ubuntu.com: no
security.ubuntu.com: no
```

HTTP status:

```text
archive.ubuntu.com: no origin HTTP status; only proxy CONNECT 200
security.ubuntu.com: no origin HTTP status; only proxy CONNECT 200
```

Still appears:

```text
SSL_ERROR_SYSCALL: yes
CONNECT aborted: no
APT 502 Bad Gateway: yes
APT TLS handshake failure: yes
```

## Conclusion

Temporary WSL proxy variables are not sufficient.

WSL can reach the Windows proxy service, and the proxy accepts CONNECT for Ubuntu official domains, but the upstream TLS session does not complete. APT requests through the same proxy fail with `502 Bad Gateway` or non-properly terminated TLS handshakes.

## Recommended Next Step

Do not retry PrusaSlicer installation yet.

Fix or change the Windows `verge-mihomo` route/node behavior for:

```text
archive.ubuntu.com
security.ubuntu.com
deb.nodesource.com
cli.github.com
```

Then rerun this same temporary proxy validation until these pass:

```bash
curl -I https://archive.ubuntu.com/
curl -I https://security.ubuntu.com/
sudo apt-get \
  -o Acquire::Retries=0 \
  -o Acquire::http::Proxy="http://172.30.64.1:7897" \
  -o Acquire::https::Proxy="http://172.30.64.1:7897" \
  update
```

Only after the official Ubuntu APT path is healthy should Phase05-A PrusaSlicer installation be retried.
