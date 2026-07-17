#!/usr/bin/env node
import { createServer } from "node:http";
import { parse } from "node:querystring";
import { createCloudClient } from "./lib/cloudClient.mjs";
import { loadWorkbenchConfig } from "./lib/config.mjs";
import { openVerifiedFileDirectory, verifyLocalFileMetadata, verifyLocalFileSha256 } from "./lib/localFiles.mjs";
import { renderMessagePage, renderOrderDetailPage, renderOrderListPage } from "./lib/render.mjs";
import { createCsrfToken, isAllowedHost, isSameOrigin, safeTokenEqual, securityHeaders } from "./lib/security.mjs";

export function createWorkbenchApp(config, options = {}) {
  const cloudClient = options.cloudClient || createCloudClient(config, options);
  const csrfToken = options.csrfToken || createCsrfToken();
  const localFilesRoot = config.localFilesRoot;
  const openImpl = options.openImpl;

  async function handleRequest(request, response) {
    const hostHeader = request.headers.host || "";
    if (!isAllowedHost(hostHeader, config.port)) {
      send(response, 403, "Forbidden host", "text/plain");
      return;
    }

    const url = new URL(request.url || "/", `http://${hostHeader}`);

    try {
      if (request.method === "GET" && url.pathname === "/") {
        const payload = await cloudClient.listOrders({
          q: url.searchParams.get("q"),
          status: url.searchParams.get("status"),
          sync_status: url.searchParams.get("sync_status"),
        });
        send(response, 200, renderOrderListPage({
          orders: payload.orders || [],
          query: Object.fromEntries(url.searchParams),
          csrfToken,
        }));
        return;
      }

      const orderMatch = /^\/orders\/(\d+)$/.exec(url.pathname);
      if (request.method === "GET" && orderMatch) {
        const detail = await loadDetailWithLocalChecks(cloudClient, Number(orderMatch[1]), localFilesRoot);
        send(response, 200, renderOrderDetailPage({ ...detail, csrfToken }));
        return;
      }

      const verifyMatch = /^\/local\/files\/(\d+)\/verify-sha$/.exec(url.pathname);
      if (request.method === "POST" && verifyMatch) {
        if (!isSameOrigin(request.headers, config.port)) {
          send(response, 403, "Forbidden origin", "text/plain");
          return;
        }
        const form = parse(await readBody(request));
        if (!safeTokenEqual(String(form.csrf || ""), csrfToken)) {
          send(response, 403, "Invalid CSRF token", "text/plain");
          return;
        }
        const file = await refetchFileForSyncJob(cloudClient, Number(form.order_id), Number(verifyMatch[1]));
        const result = await verifyLocalFileSha256(file, { rootDir: localFilesRoot });
        send(response, 200, renderMessagePage({
          title: "SHA 验证结果",
          message: `文件 ${file.masked_filename}：存在=${String(result.exists)}，大小匹配=${String(result.size_matches)}，SHA匹配=${String(result.sha_matches)}`,
          backHref: `/orders/${Number(form.order_id)}`,
        }));
        return;
      }

      const openMatch = /^\/local\/files\/(\d+)\/open-directory$/.exec(url.pathname);
      if (request.method === "POST" && openMatch) {
        if (!isSameOrigin(request.headers, config.port)) {
          send(response, 403, "Forbidden origin", "text/plain");
          return;
        }
        const form = parse(await readBody(request));
        if (!safeTokenEqual(String(form.csrf || ""), csrfToken)) {
          send(response, 403, "Invalid CSRF token", "text/plain");
          return;
        }
        const file = await refetchFileForSyncJob(cloudClient, Number(form.order_id), Number(openMatch[1]));
        const result = await openVerifiedFileDirectory(file, { rootDir: localFilesRoot, openImpl });
        const message = result.ok ? "本地目录已请求打开。" : `本地目录未打开：${result.reason}`;
        send(response, result.ok ? 200 : 409, renderMessagePage({
          title: "打开本地目录",
          message,
          backHref: `/orders/${Number(form.order_id)}`,
        }));
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/local/")) {
        send(response, 405, "Local actions require POST", "text/plain");
        return;
      }

      send(response, 404, "Not found", "text/plain");
    } catch (error) {
      send(response, 500, renderMessagePage({
        title: "本地工作台错误",
        message: redactString(error instanceof Error ? error.message : String(error)),
      }));
    }
  }

  return { handleRequest, csrfToken };
}

export async function startWorkbenchServer(config = loadWorkbenchConfig(), options = {}) {
  const app = createWorkbenchApp(config, options);
  const server = createServer((request, response) => {
    void app.handleRequest(request, response);
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  return { server, app };
}

async function loadDetailWithLocalChecks(cloudClient, orderId, localFilesRoot) {
  const detail = await cloudClient.getOrder(orderId);
  const localChecks = new Map();
  for (const file of detail.files || []) {
    if (!file.local_file_sync_job_id) continue;
    localChecks.set(file.local_file_sync_job_id, await verifyLocalFileMetadata(file, { rootDir: localFilesRoot }));
  }
  return { detail, localChecks };
}

async function refetchFileForSyncJob(cloudClient, orderId, syncJobId) {
  if (!Number.isInteger(orderId) || orderId <= 0) throw new Error("invalid order id");
  if (!Number.isInteger(syncJobId) || syncJobId <= 0) throw new Error("invalid sync job id");
  const detail = await cloudClient.getOrder(orderId);
  const file = (detail.files || []).find((item) => Number(item.local_file_sync_job_id) === syncJobId);
  if (!file) throw new Error("sync job not found on latest order detail");
  return file;
}

function send(response, statusCode, body, contentType = "text/html; charset=utf-8") {
  response.writeHead(statusCode, {
    ...securityHeaders(),
    "Content-Type": contentType,
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolvePromise(body));
    request.on("error", reject);
  });
}

function redactString(value) {
  return String(value || "")
    .replace(/Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(token|secret|api[_-]?v?3?[_-]?key|private[_-]?key)\s*[:=]\s*["']?[^"',\s]+["']?/gi, "$1=[REDACTED]")
    .replace(/\b1[3-9]\d{9}\b/g, "[REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED]");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadWorkbenchConfig();
  const { server } = await startWorkbenchServer(config);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`Make3D Local Order Workbench listening on http://${config.host}:${port}`);
}
