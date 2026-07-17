import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createWorkbenchApp } from "../worker/order-workbench/server.mjs";

test("local workbench rejects non-loopback Host and blocks GET local actions", async () => {
  const app = createAppFixture();
  const forbidden = await dispatch(app, { method: "GET", url: "/", host: "0.0.0.0:5177" });
  assert.equal(forbidden.statusCode, 403);

  const action = await dispatch(app, {
    method: "GET",
    url: "/local/files/1/open-directory",
    host: "127.0.0.1:5177",
  });
  assert.equal(action.statusCode, 405);
  assert.match(action.body, /POST/);
});

test("local workbench renders orders without leaking operator token or sensitive fields", async () => {
  const app = createAppFixture();
  const response = await dispatch(app, { method: "GET", url: "/", host: "127.0.0.1:5177" });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Make3D 本地订单工作台/);
  assert.match(response.body, /M3DTEST001/);
  assert.doesNotMatch(response.body, /phase06-token|Authorization|phone-fixture|email-fixture|openid|payment_no/i);
  assert.equal(response.headers["X-Frame-Options"], "DENY");
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("local workbench open-directory requires CSRF and same-origin POST", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-server-"));
  const content = "solid cube";
  const opened = [];
  try {
    await mkdir(join(root, "M3DTEST"), { recursive: true });
    await writeFile(join(root, "M3DTEST", "1-model.stl"), content);
    const app = createAppFixture({
      localFilesRoot: root,
      openImpl: async (directory) => opened.push(directory),
      sha256: sha256(content),
      size: content.length,
    });

    const noCsrf = await dispatch(app, {
      method: "POST",
      url: "/local/files/10/open-directory",
      host: "127.0.0.1:5177",
      headers: { origin: "http://127.0.0.1:5177" },
      body: "order_id=1",
    });
    assert.equal(noCsrf.statusCode, 403);
    assert.equal(opened.length, 0);

    const crossOrigin = await dispatch(app, {
      method: "POST",
      url: "/local/files/10/open-directory",
      host: "127.0.0.1:5177",
      headers: { origin: "http://evil.test" },
      body: `order_id=1&csrf=${app.csrfToken}`,
    });
    assert.equal(crossOrigin.statusCode, 403);
    assert.equal(opened.length, 0);

    const ok = await dispatch(app, {
      method: "POST",
      url: "/local/files/10/open-directory",
      host: "127.0.0.1:5177",
      headers: { origin: "http://127.0.0.1:5177" },
      body: `order_id=1&csrf=${app.csrfToken}`,
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(opened.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function createAppFixture(options = {}) {
  const sha = options.sha256 || "a".repeat(64);
  const size = options.size || 10;
  return createWorkbenchApp(
    {
      host: "127.0.0.1",
      port: 5177,
      serverUrl: "https://make3d.test",
      operatorToken: "phase06-token",
      localFilesRoot: options.localFilesRoot || "/tmp/make3d-files",
    },
    {
      csrfToken: "csrf-test-token",
      openImpl: options.openImpl || (async () => {}),
      cloudClient: {
        async listOrders() {
          return {
            orders: [
              {
                id: 1,
                order_no: "M3DTEST001",
                created_at: "2026-07-17 10:00:00",
                status: "pending",
                payment_status: "unpaid",
                material: "PLA",
                color: "black",
                quantity: 1,
                estimated_price: 12.5,
                remark: "客户备注",
                file_count: 1,
                file_sync_summary: { status: "verified", verified_count: 1, file_count: 1 },
                is_test_account: true,
              },
            ],
          };
        },
        async getOrder() {
          return {
            order: {
              id: 1,
              order_no: "M3DTEST001",
              status: "pending",
              payment_status: "unpaid",
              material: "PLA",
              color: "black",
              quantity: 1,
              estimated_price: 12.5,
              remark: "客户备注",
              is_test_account: true,
            },
            files: [
              {
                file_id: 1,
                local_file_sync_job_id: 10,
                masked_filename: "mo***el.stl",
                format: "stl",
                filesize: size,
                expected_size_bytes: size,
                expected_sha256: sha,
                relative_path: "M3DTEST/1-model.stl",
                sync_status: "verified",
              },
            ],
            customer_service_requests: [],
          };
        },
      },
    },
  );
}

function dispatch(app, options) {
  const request = new EventEmitter();
  request.method = options.method;
  request.url = options.url;
  request.headers = { host: options.host, ...(options.headers || {}) };
  request.setEncoding = () => {};
  request.destroy = () => {};

  const response = {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = String(body || "");
      this.resolve(this);
    },
  };

  const promise = new Promise((resolve) => {
    response.resolve = resolve;
  });
  void app.handleRequest(request, response);
  process.nextTick(() => {
    if (options.body) request.emit("data", options.body);
    request.emit("end");
  });
  return promise;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
