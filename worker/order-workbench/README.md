# Make3D Local Order Workbench

Phase06-A2-A read-only MVP.

Run locally only:

```bash
SERVER_URL="https://www.make3d.com.cn" \
MAKE3D_LOCAL_WORKBENCH_TOKEN="fixture-or-real-operator-token" \
node worker/order-workbench/server.mjs
```

Default address:

```text
http://127.0.0.1:5177
```

Safety boundaries:

- Binds only `127.0.0.1` or `localhost`.
- Browser never receives `MAKE3D_LOCAL_WORKBENCH_TOKEN`.
- Cloud API calls are `GET` only.
- Local file checks are limited to `/srv/make3d-worker/files`.
- Directory opening uses `POST`, CSRF, same-origin checks, safe path validation, size check, and SHA-256 verification.
- This phase does not run PrusaSlicer, create `slicing_job`, modify order price, modify lead time, modify payment/refund/WeChat Pay, or write production database rows.
