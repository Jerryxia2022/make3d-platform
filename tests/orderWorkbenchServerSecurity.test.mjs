import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createWorkbenchApp } from "../worker/order-workbench/server.mjs";
import { inspectLocalRequestOrigin } from "../worker/order-workbench/lib/security.mjs";

test("local origin contract allows both browser names and rejects untrusted requests", () => {
  for (const origin of ["http://127.0.0.1:5177", "http://localhost:5177"]) {
    assert.equal(inspectLocalRequestOrigin({ origin, "sec-fetch-site": "same-origin" }, 5177).ok, true);
  }
  assert.equal(inspectLocalRequestOrigin({ origin: "http://evil.test" }, 5177).ok, false);
  assert.equal(inspectLocalRequestOrigin({ origin: "null" }, 5177).ok, false);
  assert.equal(inspectLocalRequestOrigin({}, 5177).ok, false);
});

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
  assert.match(action.body, /必须通过页面按钮提交/);
});

test("local workbench renders orders without leaking operator token or sensitive fields", async () => {
  const app = createAppFixture();
  const response = await dispatch(app, { method: "GET", url: "/", host: "127.0.0.1:5177" });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Make3D 本地订单工作台/);
  assert.match(response.body, /订单工作台/);
  assert.match(response.body, /下一步/);
  assert.match(response.body, /M3DTEST001/);
  assert.doesNotMatch(response.body, /phase06-token|Authorization|phone-fixture|email-fixture|openid|payment_no/i);
  assert.equal(response.headers["X-Frame-Options"], "DENY");
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("local workbench renders an explicit safe error state when the order list cannot load", async () => {
  const app = createAppFixture({ listError: new Error("upstream unavailable") });
  const response = await dispatch(app, { method: "GET", url: "/orders", host: "127.0.0.1:5177" });

  assert.equal(response.statusCode, 502);
  assert.match(response.body, /\u8ba2\u5355\u6570\u636e\u52a0\u8f7d\u5931\u8d25/);
  assert.match(response.body, /\u8bf7\u68c0\u67e5\u4e91\u7aef API \u6216\u7f51\u7edc\u540e\u91cd\u8bd5/);
  assert.doesNotMatch(response.body, /upstream unavailable/);
  assert.match(response.body, /\u91cd\u65b0\u52a0\u8f7d/);
  assert.doesNotMatch(response.body, /phase06-token|Authorization|openid|payment_no/i);
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("workbench browser script is same-origin and reports incomplete slices distinctly", async () => {
  const app = createAppFixture();
  const response = await dispatch(app, { method: "GET", url: "/workbench.js", host: "127.0.0.1:5177" });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["Content-Type"], /text\/javascript/);
  assert.match(response.body, /credentials: "same-origin"/);
  assert.match(response.body, /data-order-list-form/);
  assert.match(response.body, /aria-busy/);
  assert.match(response.body, /data-local-refresh/);
  assert.match(response.body, /PARTIAL/);
  assert.match(response.body, /切片未完整完成/);
  assert.match(response.body, /\/api\/local\/orders\//);
  assert.doesNotMatch(response.body, /phase06-token|Authorization: Bearer|0\.0\.0\.0/);
});

test("local file status API returns disk evidence without secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-status-"));
  const content = "solid status";
  try {
    await mkdir(join(root, "M3DTEST"), { recursive: true });
    await writeFile(join(root, "M3DTEST", "1-model.stl"), content);
    const app = createAppFixture({
      localFilesRoot: root,
      size: Buffer.byteLength(content),
      sha256: sha256(content),
    });
    const response = await dispatch(app, {
      method: "GET",
      url: "/api/local/orders/1/files",
      host: "127.0.0.1:5177",
    });
    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(response.body);
    assert.equal(payload.files[0].fileExists, true);
    assert.equal(payload.files[0].sizeMatches, true);
    assert.equal(payload.files[0].shaMatches, true);
    assert.equal(payload.files[0].localSha256, sha256(content));
    assert.equal(payload.files[0].sizeBytes, Buffer.byteLength(content));
    assert.doesNotMatch(response.body, /phase06-token|Authorization|csrf-test-token/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local workbench prominently marks real orders and blocks online sync locally", async () => {
  const app = createAppFixture({ isTestAccount: false });

  const list = await dispatch(app, { method: "GET", url: "/", host: "127.0.0.1:5177" });
  assert.equal(list.statusCode, 200);
  assert.match(list.body, /\u771f\u5b9e\u8ba2\u5355 \u00b7 \u53ea\u8bfb/);

  const detail = await dispatch(app, { method: "GET", url: "/orders/1", host: "127.0.0.1:5177" });
  assert.equal(detail.statusCode, 200);
  assert.match(detail.body, /\u771f\u5b9e\u8ba2\u5355\uff1a\u53ea\u8bfb\u9884\u89c8/);
  assert.match(detail.body, /<button[^>]*disabled>\u771f\u5b9e\u8ba2\u5355\u7981\u6b62\u540c\u6b65<\/button>/);
  assert.doesNotMatch(detail.body, /订单已经付款/);

  const directRun = await dispatch(app, {
    method: "POST",
    url: "/orders/1/online-sync/run",
    host: "127.0.0.1:5177",
    headers: { origin: "http://127.0.0.1:5177" },
    body: "csrf=csrf-test-token&client_request_id=blocked",
  });
  assert.equal(directRun.statusCode, 403);
  assert.match(directRun.body, /\u771f\u5b9e\u8ba2\u5355.*\u53ea\u8bfb/);
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

    const detail = await dispatch(app, {
      method: "GET",
      url: "/orders/1",
      host: "127.0.0.1:5177",
    });
    assert.equal(detail.statusCode, 200);
    assert.match(detail.body, /本地 STL \/ 模型文件/);
    assert.match(detail.body, /打开 STL 所在文件夹/);
    assert.match(detail.body, /进入切片确认/);
    assert.match(detail.body, /修改价格和货期/);
    assert.ok(detail.body.includes(join(root, "M3DTEST", "1-model.stl")));

    const verified = await dispatch(app, {
      method: "POST",
      url: "/local/files/10/verify-sha",
      host: "127.0.0.1:5177",
      headers: { origin: "http://127.0.0.1:5177" },
      body: `order_id=1&csrf=${app.csrfToken}`,
    });
    assert.equal(verified.statusCode, 200);
    assert.match(verified.body, /SHA 校验完成：文件存在=是，大小一致=是，SHA一致=是/);
    assert.match(verified.body, /SHA-256<\/span><strong>[^<]+ · 通过/);

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
    assert.match(ok.body, /确认 Windows 文件资源管理器位于前台/);

    const fallbackApp = createAppFixture({
      localFilesRoot: root,
      openImpl: async () => { throw new Error("interop unavailable"); },
      sha256: sha256(content),
      size: content.length,
    });
    const fallback = await dispatch(fallbackApp, {
      method: "POST",
      url: "/local/files/10/open-directory",
      host: "127.0.0.1:5177",
      headers: { origin: "http://127.0.0.1:5177" },
      body: `order_id=1&csrf=${fallbackApp.csrfToken}`,
    });
    assert.equal(fallback.statusCode, 409);
    assert.match(fallback.body, /当前 WSL 无法启动 Windows 文件资源管理器/);
    assert.match(fallback.body, /Windows 文件夹路径/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("open-directory JSON distinguishes focused, partial, and failed outcomes", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-focus-"));
  const content = "solid cube";
  try {
    await mkdir(join(root, "M3DTEST"), { recursive: true });
    await writeFile(join(root, "M3DTEST", "1-model.stl"), content);
    const common = { localFilesRoot: root, sha256: sha256(content), size: content.length };
    const focusedApp = createAppFixture({ ...common, openImpl: async () => ({
      status: "directory-focused", windowFound: true, restored: true, foregroundVerified: true, targetHwnd: 101, foregroundHwnd: 101,
    }) });
    const focused = await dispatch(focusedApp, {
      method: "POST", url: "/local/files/10/open-directory", host: "127.0.0.1:5177",
      headers: { origin: "http://127.0.0.1:5177", accept: "application/json" },
      body: `order_id=1&csrf=${focusedApp.csrfToken}`,
    });
    assert.equal(focused.statusCode, 200);
    assert.equal(JSON.parse(focused.body).foregroundVerified, true);
    assert.equal(JSON.parse(focused.body).status, "directory-focused");

    const partialApp = createAppFixture({ ...common, openImpl: async () => ({
      status: "directory-opened-not-focused", windowFound: true, restored: false, foregroundVerified: false, targetHwnd: 101, foregroundHwnd: 202,
    }) });
    const partial = await dispatch(partialApp, {
      method: "POST", url: "/local/files/10/open-directory", host: "localhost:5177",
      headers: { origin: "http://localhost:5177", accept: "application/json" },
      body: `order_id=1&csrf=${partialApp.csrfToken}`,
    });
    assert.equal(partial.statusCode, 200);
    assert.equal(JSON.parse(partial.body).status, "directory-opened-not-focused");
    assert.equal(JSON.parse(partial.body).foregroundVerified, false);

    const failedApp = createAppFixture({ ...common, openImpl: async () => { throw new Error("no interactive desktop"); } });
    const failed = await dispatch(failedApp, {
      method: "POST", url: "/local/files/10/open-directory", host: "127.0.0.1:5177",
      headers: { origin: "http://127.0.0.1:5177", accept: "application/json" },
      body: `order_id=1&csrf=${failedApp.csrfToken}`,
    });
    assert.equal(failed.statusCode, 409);
    assert.equal(JSON.parse(failed.body).status, "directory-open-failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local workbench logs safe request diagnostics without token or CSRF values", async () => {
  const entries = [];
  const app = createAppFixture({
    isTestAccount: false,
    logger: {
      info: (value) => entries.push(String(value)),
      warn: (value) => entries.push(String(value)),
    },
  });
  const response = await dispatch(app, {
    method: "POST",
    url: "/orders/1/online-sync/run",
    host: "localhost:5177",
    headers: {
      origin: "http://localhost:5177",
      referer: "http://localhost:5177/orders/1",
      cookie: "session=fake-browser-cookie",
      "sec-fetch-site": "same-origin",
    },
    body: `csrf=${app.csrfToken}&client_request_id=diagnostic-only`,
  });
  assert.equal(response.statusCode, 403);
  const output = entries.join("\n");
  assert.match(output, /"origin":"http:\/\/localhost:5177"/);
  assert.match(output, /"refererOrigin":"http:\/\/localhost:5177"/);
  assert.match(output, /"cookiePresent":true/);
  assert.match(output, /"csrfPresent":true/);
  assert.doesNotMatch(output, /fake-browser-cookie|csrf-test-token|phase06-token/);
});

test("local pull returns rich JSON, reuses valid files, and reports failures honestly", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-pull-"));
  const content = "solid cube\nendsolid cube\n";
  try {
    await mkdir(join(root, "M3DTEST"), { recursive: true });
    let pullCalls = 0;
    const pendingApp = createAppFixture({
      localFilesRoot: root,
      syncStatus: "pending",
      size: Buffer.byteLength(content),
      sha256: sha256(content),
      pullJobImpl: async () => {
        pullCalls += 1;
        await writeFile(join(root, "M3DTEST", "1-model.stl"), content);
        return { status: "verified", reused: false };
      },
    });
    const downloaded = await dispatch(pendingApp, {
      method: "POST",
      url: "/local/files/10/pull",
      host: "127.0.0.1:5177",
      headers: { origin: "http://127.0.0.1:5177", accept: "application/json" },
      body: `order_id=1&csrf=${pendingApp.csrfToken}`,
    });
    assert.equal(downloaded.statusCode, 200);
    const downloadedPayload = JSON.parse(downloaded.body);
    assert.equal(downloadedPayload.status, "verified");
    assert.equal(downloadedPayload.sizeBytes, Buffer.byteLength(content));
    assert.equal(downloadedPayload.alreadyExisted, false);
    assert.ok(downloadedPayload.savedPath.startsWith(root));
    assert.equal(pullCalls, 1);

    const reused = await dispatch(pendingApp, {
      method: "POST",
      url: "/local/files/10/pull",
      host: "localhost:5177",
      headers: { origin: "http://localhost:5177", accept: "application/json" },
      body: `order_id=1&csrf=${pendingApp.csrfToken}`,
    });
    assert.equal(reused.statusCode, 200);
    assert.equal(JSON.parse(reused.body).alreadyExisted, true);
    assert.equal(pullCalls, 1);

    await rm(join(root, "M3DTEST", "1-model.stl"));
    const failedApp = createAppFixture({
      localFilesRoot: root,
      syncStatus: "failed",
      size: Buffer.byteLength(content),
      sha256: sha256(content),
      pullJobImpl: async () => ({ status: "failed", reason: "download-failed" }),
    });
    const failed = await dispatch(failedApp, {
      method: "POST",
      url: "/local/files/10/pull",
      host: "127.0.0.1:5177",
      headers: { origin: "http://127.0.0.1:5177", accept: "application/json" },
      body: `order_id=1&csrf=${failedApp.csrfToken}`,
    });
    assert.equal(failed.statusCode, 409);
    assert.deepEqual(Object.keys(JSON.parse(failed.body)).sort(), ["detail", "errorCode", "message", "orderId"]);
    assert.equal(JSON.parse(failed.body).errorCode, "LOCAL_FILE_PULL_FAILED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function createAppFixture(options = {}) {
  const sha = options.sha256 || "a".repeat(64);
  const size = options.size || 10;
  const isTestAccount = options.isTestAccount ?? true;
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
      pullJobImpl: options.pullJobImpl,
      logger: options.logger,
      cloudClient: {
        async listOrders() {
          if (options.listError) throw options.listError;
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
                is_test_account: isTestAccount,
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
              is_test_account: isTestAccount,
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
                sync_status: options.syncStatus || "verified",
              },
            ],
            customer_service_requests: [],
          };
        },
        async confirmAndReply() {
          throw new Error("confirmAndReply must not be called for a real order");
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
