#!/usr/bin/env node
import { createServer } from "node:http";
import { parse } from "node:querystring";

import { createCloudClient } from "./lib/cloudClient.mjs";
import { loadWorkbenchConfig } from "./lib/config.mjs";
import {
  openVerifiedFileDirectory,
  verifyLocalFileMetadata,
  verifyLocalFileSha256,
} from "./lib/localFiles.mjs";
import {
  renderLocalSliceConfirmPage,
  renderMessagePage,
  renderOrderDetailPage,
  renderOrderListPage,
} from "./lib/render.mjs";
import { createCsrfToken, isAllowedHost, isSameOrigin, safeTokenEqual, securityHeaders } from "./lib/security.mjs";
import {
  getLatestSliceResultForReview,
  getOrCreateLocalReview,
  listAuditEventsForOrder,
  openWorkbenchDatabase,
  updateLocalReview,
} from "./lib/localDb.mjs";
import { runLocalOneShotSlice } from "./lib/localSlicing.mjs";

export function createWorkbenchApp(config, options = {}) {
  const cloudClient = options.cloudClient || createCloudClient(config, options);
  const csrfToken = options.csrfToken || createCsrfToken();
  const localFilesRoot = config.localFilesRoot;
  const localDb = options.localDb || config.localDb || null;
  const openImpl = options.openImpl;
  const localSliceImpl = options.localSliceImpl || runLocalOneShotSlice;

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
        const detail = await loadDetailWithLocalChecks(cloudClient, Number(orderMatch[1]), localFilesRoot, localDb);
        send(response, 200, renderOrderDetailPage({ ...detail, csrfToken }));
        return;
      }

      const reviewMatch = /^\/orders\/(\d+)\/local-review$/.exec(url.pathname);
      if (request.method === "POST" && reviewMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken)) return;
        if (!localDb) throw new Error("local workbench database is not available");
        const detail = await cloudClient.getOrder(Number(reviewMatch[1]));
        const review = updateLocalReview(localDb, detail.order, buildReviewPatch(parse(body)));
        send(response, 200, renderMessagePage({
          title: "Local draft saved",
          message: `Local state saved: ${review.state}. Nothing was synced online.`,
          backHref: `/orders/${Number(reviewMatch[1])}`,
        }));
        return;
      }

      const sliceConfirmMatch = /^\/orders\/(\d+)\/local-slice\/confirm$/.exec(url.pathname);
      if (request.method === "POST" && sliceConfirmMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken)) return;
        const form = parse(body);
        const detail = await loadDetailWithLocalChecks(cloudClient, Number(sliceConfirmMatch[1]), localFilesRoot, localDb);
        const file = selectFileForLocalAction(detail.detail, Number(form.sync_job_id));
        send(response, 200, renderLocalSliceConfirmPage({
          detail,
          file,
          csrfToken,
          profileName: config.profileName,
          profileKey: config.profileKey,
        }));
        return;
      }

      const sliceRunMatch = /^\/orders\/(\d+)\/local-slice\/run$/.exec(url.pathname);
      if (request.method === "POST" && sliceRunMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken)) return;
        if (!localDb) throw new Error("local workbench database is not available");
        const form = parse(body);
        const detail = await cloudClient.getOrder(Number(sliceRunMatch[1]));
        const file = selectFileForLocalAction(detail, Number(form.sync_job_id));
        const result = await localSliceImpl({
          db: localDb,
          order: detail.order,
          file,
          config,
          options: {
            execFileImpl: options.execFileImpl,
            spawnImpl: options.spawnImpl,
          },
        });
        send(response, result.ok ? 200 : 409, renderMessagePage({
          title: result.ok ? "Local slicing completed" : "Local slicing failed",
          message: result.ok
            ? `Local slice result ${result.slice.id} saved. Status=${result.slice.status}. Nothing was synced online.`
            : `Local slice failed: ${result.error}. Nothing was synced online.`,
          backHref: `/orders/${Number(sliceRunMatch[1])}`,
        }));
        return;
      }

      const verifyMatch = /^\/local\/files\/(\d+)\/verify-sha$/.exec(url.pathname);
      if (request.method === "POST" && verifyMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken)) return;
        const form = parse(body);
        const file = await refetchFileForSyncJob(cloudClient, Number(form.order_id), Number(verifyMatch[1]));
        const result = await verifyLocalFileSha256(file, { rootDir: localFilesRoot });
        send(response, 200, renderMessagePage({
          title: "SHA verification result",
          message: `File ${file.masked_filename}: exists=${String(result.exists)}, size_match=${String(result.size_matches)}, sha_match=${String(result.sha_matches)}`,
          backHref: `/orders/${Number(form.order_id)}`,
        }));
        return;
      }

      const openMatch = /^\/local\/files\/(\d+)\/open-directory$/.exec(url.pathname);
      if (request.method === "POST" && openMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken)) return;
        const form = parse(body);
        const file = await refetchFileForSyncJob(cloudClient, Number(form.order_id), Number(openMatch[1]));
        const result = await openVerifiedFileDirectory(file, { rootDir: localFilesRoot, openImpl });
        send(response, result.ok ? 200 : 409, renderMessagePage({
          title: "Open local directory",
          message: result.ok ? "Local directory open requested." : `Local directory was not opened: ${result.reason}`,
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
        title: "Local workbench error",
        message: redactString(error instanceof Error ? error.message : String(error)),
      }));
    }
  }

  return { handleRequest, csrfToken };
}

export async function startWorkbenchServer(config = loadWorkbenchConfig(), options = {}) {
  const localDb = options.localDb || await openWorkbenchDatabase(config.workbenchDbPath);
  const app = createWorkbenchApp({ ...config, localDb }, { ...options, localDb });
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

async function loadDetailWithLocalChecks(cloudClient, orderId, localFilesRoot, localDb = null) {
  const detail = await cloudClient.getOrder(orderId);
  const localChecks = new Map();
  for (const file of detail.files || []) {
    if (!file.local_file_sync_job_id) continue;
    localChecks.set(file.local_file_sync_job_id, await verifyLocalFileMetadata(file, { rootDir: localFilesRoot }));
  }
  const review = localDb ? getOrCreateLocalReview(localDb, detail.order) : null;
  const sliceResult = localDb && review ? getLatestSliceResultForReview(localDb, review) : null;
  const auditEvents = localDb ? listAuditEventsForOrder(localDb, detail.order.id) : [];
  return { detail, localChecks, review, sliceResult, auditEvents };
}

async function refetchFileForSyncJob(cloudClient, orderId, syncJobId) {
  if (!Number.isInteger(orderId) || orderId <= 0) throw new Error("invalid order id");
  if (!Number.isInteger(syncJobId) || syncJobId <= 0) throw new Error("invalid sync job id");
  const detail = await cloudClient.getOrder(orderId);
  return selectFileForLocalAction(detail, syncJobId);
}

function selectFileForLocalAction(detail, syncJobId) {
  if (!Number.isInteger(syncJobId) || syncJobId <= 0) throw new Error("invalid sync job id");
  const file = (detail.files || []).find((item) => Number(item.local_file_sync_job_id) === syncJobId);
  if (!file) throw new Error("sync job not found on latest order detail");
  return file;
}

function assertLocalPost(request, response, config, body, csrfToken) {
  if (!isSameOrigin(request.headers, config.port)) {
    send(response, 403, "Forbidden origin", "text/plain");
    return false;
  }
  const form = parse(body || "");
  if (!safeTokenEqual(String(form.csrf || ""), csrfToken)) {
    send(response, 403, "Invalid CSRF token", "text/plain");
    return false;
  }
  return true;
}

function buildReviewPatch(form) {
  const patch = {};
  for (const key of [
    "state",
    "selected_file_id",
    "selected_sync_job_id",
    "suggested_price_cents",
    "confirmed_price_cents",
    "lead_time_min_hours",
    "lead_time_max_hours",
    "estimated_ship_at",
    "reply_template",
    "reply_draft",
    "operator_note",
  ]) {
    if (key in form) patch[key] = form[key];
  }
  return patch;
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
