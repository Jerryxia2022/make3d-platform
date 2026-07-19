#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { parse } from "node:querystring";

import { createCloudClient } from "./lib/cloudClient.mjs";
import { loadWorkbenchConfig } from "./lib/config.mjs";
import {
  ensureLocalFilesRoot,
  openVerifiedFileDirectory,
  verifyLocalFileMetadata,
  verifyLocalFileSha256,
} from "./lib/localFiles.mjs";
import { pullOrReuseLocalFile } from "./lib/filePull.mjs";
import {
  renderLocalSliceConfirmPage,
  renderMessagePage,
  renderOnlineSyncConfirmPage,
  renderOrderDetailPage,
  renderOrderListPage,
} from "./lib/render.mjs";
import {
  createCsrfToken,
  inspectLocalRequestOrigin,
  isAllowedHost,
  safeTokenEqual,
  securityHeaders,
} from "./lib/security.mjs";
import {
  getLatestSliceResultForReview,
  getOrCreateLocalReview,
  listAuditEventsForOrder,
  markLocalReviewSyncFailure,
  markLocalReviewSyncSuccess,
  listLocalOrderOverviews,
  openWorkbenchDatabase,
  updateLocalReview,
} from "./lib/localDb.mjs";
import { buildOrderListView, requiresOrderDetailEnrichment } from "./lib/orderList.mjs";
import {
  buildSliceParams,
  getLocalSliceRuntimeStatus,
  isLocalSliceRunning,
  runLocalOneShotSlice,
} from "./lib/localSlicing.mjs";

const NULL_LOGGER = { info() {}, warn() {} };

export function createWorkbenchApp(config, options = {}) {
  const cloudClient = options.cloudClient || createCloudClient(config, options);
  const csrfToken = options.csrfToken || createCsrfToken();
  const localFilesRoot = config.localFilesRoot;
  const localDb = options.localDb || config.localDb || null;
  const openImpl = options.openImpl;
  const pullJobImpl = options.pullJobImpl;
  const localSliceImpl = options.localSliceImpl || runLocalOneShotSlice;
  const logger = options.logger || NULL_LOGGER;
  const listDetailCache = new Map();

  async function handleRequest(request, response) {
    const hostHeader = request.headers.host || "";
    if (!isAllowedHost(hostHeader, config.port)) {
      send(response, 403, "禁止访问：本地工作台仅允许本机地址", "text/plain; charset=utf-8");
      return;
    }

    const url = new URL(request.url || "/", `http://${hostHeader}`);

    try {
      if (request.method === "GET" && ["/", "/orders"].includes(url.pathname)) {
        const query = Object.fromEntries(url.searchParams);
        try {
          const payload = await cloudClient.listOrders({ limit: 100 });
          const orders = payload.orders || [];
          const localOverviews = localDb
            ? listLocalOrderOverviews(localDb, orders.map((order) => order.id))
            : new Map();
          const details = requiresOrderDetailEnrichment(query)
            ? await loadOrderListDetails(cloudClient, orders, listDetailCache)
            : new Map();
          const listView = buildOrderListView({ orders, localOverviews, details, query });
          send(response, 200, renderOrderListPage({ ...listView, csrfToken }));
        } catch (error) {
          logger?.warn?.(`[make3d-workbench-list] ${JSON.stringify({ status: "failed", message: localizeWorkbenchError(error) })}`);
          send(response, 502, renderOrderListPage({
            rows: [],
            stats: emptyListStats(),
            query,
            pagination: { page: 1, pageSize: 20, totalRows: 0, totalPages: 1, startRow: 0, endRow: 0 },
            error: "订单数据加载失败，请检查云端 API 或网络后重试。",
            csrfToken,
          }));
        }
        return;
      }

      if (request.method === "GET" && url.pathname === "/workbench.js") {
        const script = await readFile(new URL("./public/workbench.js", import.meta.url), "utf8");
        send(response, 200, script, "text/javascript; charset=utf-8");
        return;
      }

      const orderMatch = /^\/orders\/(\d+)$/.exec(url.pathname);
      if (request.method === "GET" && orderMatch) {
        const detail = await loadDetailWithLocalChecks(cloudClient, Number(orderMatch[1]), localFilesRoot, localDb);
        send(response, 200, renderOrderDetailPage({ ...detail, csrfToken }));
        return;
      }

      const fileStatusMatch = /^\/api\/local\/orders\/(\d+)\/files$/.exec(url.pathname);
      if (request.method === "GET" && fileStatusMatch) {
        const detail = await loadDetailWithLocalChecks(
          cloudClient,
          Number(fileStatusMatch[1]),
          localFilesRoot,
          localDb,
        );
        sendJson(response, 200, buildFileStatusResponse(detail));
        return;
      }

      const sliceStatusMatch = /^\/api\/local\/orders\/(\d+)\/slice-status$/.exec(url.pathname);
      if (request.method === "GET" && sliceStatusMatch) {
        const orderId = Number(sliceStatusMatch[1]);
        const detail = await loadDetailWithLocalChecks(cloudClient, orderId, localFilesRoot, localDb);
        const statusPayload = buildSliceStatusResponse(detail, getLocalSliceRuntimeStatus(orderId));
        logLocalActionResult(logger, request, 200, `slice-status-${statusPayload.stage || "UNKNOWN"}`);
        sendJson(response, 200, statusPayload);
        return;
      }

      const reviewMatch = /^\/orders\/(\d+)\/local-review$/.exec(url.pathname);
      if (request.method === "POST" && reviewMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken, logger)) return;
        if (!localDb) throw new Error("local workbench database is not available");
        const detail = await cloudClient.getOrder(Number(reviewMatch[1]));
        const review = updateLocalReview(localDb, detail.order, buildReviewPatch(parse(body)));
        if (acceptsJson(request)) {
          sendJson(response, 200, {
            orderId: Number(reviewMatch[1]),
            saved: true,
            state: review.state,
            updatedAt: review.updated_at || null,
            message: "本地价格、货期和回复草稿已保存，未同步线上订单。",
          });
          return;
        }
        send(response, 200, renderMessagePage({
          title: "本地草稿已保存",
          message: `价格、货期和回复草稿已保存。本地处理状态：${formatLocalStateForMessage(review.state)}。本次没有同步线上订单。`,
          backHref: `/orders/${Number(reviewMatch[1])}`,
        }));
        return;
      }

      const onlineSyncPrepareMatch = /^\/orders\/(\d+)\/online-sync\/prepare$/.exec(url.pathname);
      if (request.method === "POST" && onlineSyncPrepareMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken, logger)) return;
        if (!localDb) throw new Error("local workbench database is not available");
        const detail = await loadDetailWithLocalChecks(cloudClient, Number(onlineSyncPrepareMatch[1]), localFilesRoot, localDb);
        if (detail.detail.order?.is_test_account !== true) {
          send(response, 403, "真实订单在本地工作台中保持只读，禁止同步线上", "text/plain; charset=utf-8");
          return;
        }
        const payload = buildOnlineSyncPayload(detail.review, detail.detail.order_version, randomUUID());
        send(response, 200, renderOnlineSyncConfirmPage({ detail, payload, csrfToken }));
        return;
      }

      const onlineSyncRunMatch = /^\/orders\/(\d+)\/online-sync\/run$/.exec(url.pathname);
      if (request.method === "POST" && onlineSyncRunMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken, logger)) return;
        const form = parse(body);
        const orderId = Number(onlineSyncRunMatch[1]);
        const latest = await cloudClient.getOrder(orderId);
        if (latest.order?.is_test_account !== true) {
          send(response, 403, "真实订单在本地工作台中保持只读，禁止同步线上", "text/plain; charset=utf-8");
          return;
        }
        let result;
        try {
          result = await cloudClient.confirmAndReply(orderId, {
            client_request_id: form.client_request_id,
            expected_order_version: form.expected_order_version,
            confirmed_quote_amount_cents: form.confirmed_quote_amount_cents,
            lead_time_min_hours: form.lead_time_min_hours,
            lead_time_max_hours: form.lead_time_max_hours,
            estimated_ship_at: form.estimated_ship_at,
            expected_ship_date: form.expected_ship_date,
            price_adjustment_reason: form.price_adjustment_reason,
            production_note: form.production_note,
            message_type: form.message_type,
            message_body: form.message_body,
          });
          const refreshed = await cloudClient.getOrder(orderId);
          const onlineConfirmation = refreshed.latest_operator_confirmation;
          if (
            Number(onlineConfirmation?.confirmed_quote_amount_cents) !== Number(form.confirmed_quote_amount_cents)
            || String(onlineConfirmation?.expected_ship_date || "") !== String(form.expected_ship_date || "")
          ) {
            throw new Error("online readback did not match the submitted business values");
          }
          markLocalReviewSyncSuccess(localDb, latest.order, result.result, form.client_request_id);
        } catch (error) {
          const conflict = Number(error?.status) === 409 || /ORDER_VERSION_CONFLICT|IDEMPOTENCY_KEY_REUSED/.test(String(error?.code || error?.message || ""));
          markLocalReviewSyncFailure(localDb, orderId, error, conflict);
          send(response, conflict ? 409 : 502, renderMessagePage({
            title: conflict ? "线上数据存在冲突" : "同步线上失败",
            message: conflict
              ? "线上订单已发生变化，本地修改未被覆盖。请返回订单详情查看线上最新值并人工合并。"
              : localizeWorkbenchError(error),
            backHref: `/orders/${orderId}`,
          }));
          return;
        }
        send(response, 200, renderMessagePage({
          title: "TEST 订单已同步",
          message: result.result?.created
            ? "人工报价、预计货期和客户回复已同步到 TEST 订单。"
            : "该 TEST 订单同步请求已经处理过，没有重复新增记录。",
          backHref: `/orders/${orderId}`,
        }));
        return;
      }

      const sliceConfirmMatch = /^\/orders\/(\d+)\/local-slice\/confirm$/.exec(url.pathname);
      if (request.method === "POST" && sliceConfirmMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken, logger)) return;
        const form = parse(body);
        const detail = await loadDetailWithLocalChecks(cloudClient, Number(sliceConfirmMatch[1]), localFilesRoot, localDb);
        if (detail.detail.order?.is_test_account !== true) {
          send(response, 403, "真实订单只允许本地查看，禁止启动切片", "text/plain; charset=utf-8");
          return;
        }
        const file = selectFileForLocalAction(detail.detail, Number(form.sync_job_id));
        const sliceParams = buildSliceParams(detail.detail.order, parseSliceOptions(form));
        send(response, 200, renderLocalSliceConfirmPage({
          detail,
          file,
          csrfToken,
          profileName: config.profileName,
          profileKey: config.profileKey,
          sliceParams,
          forceReslice: String(form.force_reslice || "") === "1",
        }));
        return;
      }

      const sliceRunMatch = /^\/orders\/(\d+)\/local-slice\/run$/.exec(url.pathname);
      if (request.method === "POST" && sliceRunMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken, logger)) return;
        if (!localDb) throw new Error("local workbench database is not available");
        const form = parse(body);
        const orderId = Number(sliceRunMatch[1]);
        const loaded = await loadDetailWithLocalChecks(cloudClient, orderId, localFilesRoot, localDb);
        const detail = loaded.detail;
        if (detail.order?.is_test_account !== true) {
          send(response, 403, "真实订单只允许本地查看，禁止启动切片", "text/plain; charset=utf-8");
          return;
        }
        const file = selectFileForLocalAction(detail, Number(form.sync_job_id));
        const forceReslice = String(form.force_reslice || "") === "1";
        if (!forceReslice && isCompleteSliceForFile(loaded.sliceResult, file)) {
          if (acceptsJson(request)) {
            sendJson(response, 409, {
              errorCode: "ALREADY_SLICED",
              message: "该文件已有完整切片结果，请查看结果；如参数需要变化，请使用重新切片。",
              orderId,
              sliceResultId: loaded.sliceResult.id,
            });
          } else {
            send(response, 409, renderOrderDetailPage({
              ...loaded,
              csrfToken,
              notice: { kind: "warning", message: "该文件已有完整切片结果，未重复运行 PrusaSlicer。" },
            }));
          }
          return;
        }
        if (isLocalSliceRunning()) {
          sendJson(response, 409, {
            errorCode: "SLICE_ALREADY_RUNNING",
            message: "已有本地切片正在运行，请等待当前任务完成。",
            orderId,
          });
          return;
        }
        const slicePromise = localSliceImpl({
          db: localDb,
          order: detail.order,
          file,
          config,
          options: {
            execFileImpl: options.execFileImpl,
            spawnImpl: options.spawnImpl,
            sliceParams: parseSliceOptions(form),
          },
        });
        if (acceptsJson(request)) {
          void Promise.resolve(slicePromise).catch((error) => {
            logger?.warn?.(`[make3d-workbench-slice] ${JSON.stringify({ orderId, status: "failed", message: localizeWorkbenchError(error) })}`);
          });
          logLocalActionResult(logger, request, 202, "slice-started");
          sendJson(response, 202, {
            orderId,
            stage: "VALIDATING",
            message: "切片任务已开始，正在验证 STL 文件。",
            statusUrl: `/api/local/orders/${orderId}/slice-status`,
          });
          return;
        }
        const result = await slicePromise;
        const refreshed = await loadDetailWithLocalChecks(
          cloudClient,
          orderId,
          localFilesRoot,
          localDb,
        );
        send(response, result.ok ? 200 : 409, renderOrderDetailPage({
          ...refreshed,
          csrfToken,
          notice: {
            kind: result.ok ? "success" : result.partial ? "warning" : "error",
            message: result.ok
              ? `本地切片结果 ${result.slice.id} 已完整保存，G-code、打印时间和耗材重量均已验证。本次没有同步线上订单。`
              : result.partial
                ? "G-code 已生成，但打印时间或耗材重量未完整解析，不能作为完整切片成功。"
              : `本地切片未完成：${result.error}。请根据下方切片结果提示检查模型或配置。本次没有同步线上订单。`,
          },
        }));
        return;
      }

      const pullMatch = /^\/local\/files\/(\d+)\/pull$/.exec(url.pathname);
      if (request.method === "POST" && pullMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken, logger)) return;
        const form = parse(body);
        const orderId = Number(form.order_id);
        const detail = await loadDetailWithLocalChecks(cloudClient, orderId, localFilesRoot, localDb);
        const file = selectFileForLocalAction(detail.detail, Number(pullMatch[1]));
        const result = await pullOrReuseLocalFile({ ...file, order_id: orderId }, {
          rootDir: localFilesRoot,
          pullJobImpl,
        });
        const refreshed = await loadDetailWithLocalChecks(cloudClient, orderId, localFilesRoot, localDb);
        logLocalActionResult(logger, request, result.ok ? 200 : 409, result.status);
        if (acceptsJson(request)) {
          sendJson(response, result.ok ? 200 : 409, result.ok ? result : {
            errorCode: result.errorCode,
            message: result.message,
            detail: result.detail,
            orderId,
          });
          return;
        }
        send(response, result.ok ? 200 : 409, renderOrderDetailPage({
          ...refreshed,
          csrfToken,
          notice: {
            kind: result.ok ? "success" : "error",
            message: result.message,
          },
        }));
        return;
      }

      const verifyMatch = /^\/local\/files\/(\d+)\/verify-sha$/.exec(url.pathname);
      if (request.method === "POST" && verifyMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken, logger)) return;
        const form = parse(body);
        const detail = await loadDetailWithLocalChecks(cloudClient, Number(form.order_id), localFilesRoot, localDb);
        const file = selectFileForLocalAction(detail.detail, Number(verifyMatch[1]));
        const result = await verifyLocalFileSha256(file, { rootDir: localFilesRoot });
        detail.localChecks.set(Number(verifyMatch[1]), result);
        logLocalActionResult(logger, request, 200, result.sha_matches ? "sha-verified" : "sha-check-failed");
        send(response, 200, renderOrderDetailPage({
          ...detail,
          csrfToken,
          notice: {
            kind: result.exists && result.size_matches && result.sha_matches ? "success" : "error",
            message: `SHA 校验完成：文件存在=${formatBoolean(result.exists)}，大小一致=${formatBoolean(result.size_matches)}，SHA一致=${formatBoolean(result.sha_matches)}。`,
          },
        }));
        return;
      }

      const openMatch = /^\/local\/files\/(\d+)\/open-directory$/.exec(url.pathname);
      if (request.method === "POST" && openMatch) {
        const body = await readBody(request);
        if (!assertLocalPost(request, response, config, body, csrfToken, logger)) return;
        const form = parse(body);
        const detail = await loadDetailWithLocalChecks(cloudClient, Number(form.order_id), localFilesRoot, localDb);
        const file = selectFileForLocalAction(detail.detail, Number(openMatch[1]));
        const result = await openVerifiedFileDirectory(file, { rootDir: localFilesRoot, openImpl });
        if (result.verification) detail.localChecks.set(Number(openMatch[1]), result.verification);
        const opened = result.opened === true;
        const statusCode = result.ok || opened ? 200 : 409;
        logLocalActionResult(logger, request, statusCode, result.status || result.reason);
        if (acceptsJson(request)) {
          sendJson(response, statusCode, {
            orderId: Number(form.order_id),
            status: result.status || "directory-open-failed",
            message: result.ok
              ? "已打开正确的 STL 文件夹并确认 Windows 文件资源管理器位于前台。"
              : opened
                ? "文件夹已打开，但 Windows 未允许工作台把文件资源管理器切换到前台。"
                : `无法打开本地文件夹：${formatLocalFileError(result.reason || result.status)}。`,
            windowFound: result.windowFound === true,
            restored: result.restored === true,
            foregroundVerified: result.foregroundVerified === true,
            targetHwnd: result.targetHwnd || null,
            foregroundHwnd: result.foregroundHwnd || null,
            windowsPath: result.windowsPath || null,
            diagnostics: result.diagnostics || null,
          });
          return;
        }
        send(response, statusCode, renderOrderDetailPage({
          ...detail,
          csrfToken,
          notice: {
            kind: result.ok ? "success" : opened ? "warning" : "error",
            message: result.ok
              ? "已打开正确的 STL / 模型文件夹，并确认 Windows 文件资源管理器位于前台。"
              : opened
                ? "文件夹已打开，但 Windows 未允许工作台把文件资源管理器切换到前台。"
                : `无法打开本地文件夹：${formatLocalFileError(result.reason || result.status)}。`,
            copyValue: result.ok || opened ? null : result.windowsPath,
          },
        }));
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/local/")) {
        send(response, 405, "本地操作必须通过页面按钮提交", "text/plain; charset=utf-8");
        return;
      }

      if (["PUT", "PATCH", "DELETE"].includes(String(request.method || ""))) {
        response.setHeader("Allow", "GET, POST");
        send(response, 405, "该本地工作台不提供 PUT、PATCH 或 DELETE 写接口", "text/plain; charset=utf-8");
        return;
      }

      send(response, 404, "页面不存在", "text/plain; charset=utf-8");
    } catch (error) {
      const statusCode = isValidationError(error) ? 422 : 500;
      send(response, statusCode, renderMessagePage({
        title: statusCode === 422 ? "输入内容有误" : "本地工作台操作失败",
        message: localizeWorkbenchError(error),
      }));
    }
  }

  return { handleRequest, csrfToken };
}

export async function startWorkbenchServer(config = loadWorkbenchConfig(), options = {}) {
  await ensureLocalFilesRoot(config.localFilesRoot);
  const localDb = options.localDb || await openWorkbenchDatabase(config.workbenchDbPath);
  const app = createWorkbenchApp(
    { ...config, localDb },
    { ...options, localDb, logger: options.logger || console },
  );
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
    const shouldVerifySha = ["verified", "local_synced"].includes(String(file.sync_status || ""));
    localChecks.set(
      file.local_file_sync_job_id,
      shouldVerifySha
        ? await verifyLocalFileSha256(file, { rootDir: localFilesRoot })
        : await verifyLocalFileMetadata(file, { rootDir: localFilesRoot }),
    );
  }
  const review = localDb ? getOrCreateLocalReview(localDb, { ...detail.order, order_version: detail.order_version }) : null;
  const sliceResult = localDb && review ? getLatestSliceResultForReview(localDb, review) : null;
  const auditEvents = localDb ? listAuditEventsForOrder(localDb, detail.order.id) : [];
  return { detail, localChecks, localFilesRoot, review, sliceResult, auditEvents };
}

function selectFileForLocalAction(detail, syncJobId) {
  if (!Number.isInteger(syncJobId) || syncJobId <= 0) throw new Error("invalid sync job id");
  const file = (detail.files || []).find((item) => Number(item.local_file_sync_job_id) === syncJobId);
  if (!file) throw new Error("sync job not found on latest order detail");
  return file;
}

function parseSliceOptions(form = {}) {
  return {
    layer_height_microns: decimalMillimetersToMicrons(form.layer_height_mm, 200, "layer_height_mm"),
    fill_density_percent: optionalInteger(form.fill_density_percent, 50, "fill_density_percent"),
    support_mode: String(form.support_mode || "none"),
    brim_width_microns: decimalMillimetersToMicrons(form.brim_width_mm, 0, "brim_width_mm"),
  };
}

function decimalMillimetersToMicrons(value, fallback, name) {
  if (value == null || value === "") return fallback;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) throw new Error(`${name} must use up to 3 decimal places`);
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  if (!Number.isSafeInteger(result)) throw new Error(`${name} is invalid`);
  return result;
}

function optionalInteger(value, fallback, name) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${name} must be an integer`);
  return number;
}

function isCompleteSliceForFile(slice, file) {
  return slice?.status === "parsed"
    && Number(slice.file_id) === Number(file?.file_id)
    && Number(slice.gcode_size_bytes) > 0
    && Number(slice.print_time_seconds) > 0
    && Number(slice.material_weight_grams) > 0;
}

function buildSliceStatusResponse(detail, runtime) {
  const slice = detail.sliceResult || null;
  const stage = runtime?.stage || storedSliceStage(slice);
  const metrics = parseJsonObject(slice?.metrics_json);
  const execution = metrics.execution && typeof metrics.execution === "object" ? metrics.execution : {};
  return {
    orderId: Number(detail.detail.order.id),
    stage,
    terminal: runtime?.terminal ?? new Set(["SUCCESS", "PARTIAL", "FAILED"]).has(stage),
    message: runtime?.message || storedSliceMessage(slice, stage),
    sliceResultId: runtime?.sliceResultId || slice?.id || null,
    result: slice ? {
      status: slice.status,
      startedAt: slice.started_at || null,
      completedAt: slice.completed_at || null,
      durationSeconds: slice.duration_seconds ?? null,
      printTimeSeconds: slice.print_time_seconds ?? null,
      materialWeightGrams: slice.material_weight_grams ?? null,
      gcodePath: execution.gcode_absolute_path || (slice.gcode_relative_path ? `/srv/make3d-worker/${slice.gcode_relative_path}` : null),
      gcodeSizeBytes: slice.gcode_size_bytes ?? null,
      gcodeSha256: slice.gcode_sha256 || null,
      slicerVersion: slice.slicer_version || null,
      profileName: slice.profile_name || null,
      profilePath: execution.profile_path || null,
      binaryPath: execution.binary_path || null,
      exitCode: execution.exit_code ?? null,
      sliceParams: metrics.slice_params || null,
      failureStage: metrics.failed_stage || null,
      failureSummary: slice.failure_summary || null,
    } : null,
  };
}

function storedSliceStage(slice) {
  if (!slice) return "IDLE";
  if (slice.status === "parsed") return "SUCCESS";
  if (slice.status === "partial") return "PARTIAL";
  if (slice.status === "failed") return "FAILED";
  if (slice.status === "slicing") return "SLICING";
  return "IDLE";
}

function storedSliceMessage(slice, stage) {
  if (stage === "SUCCESS") return "切片完成，G-code、打印时间和耗材重量均已验证";
  if (stage === "PARTIAL") return "G-code 已生成，但打印时间或耗材重量未完整解析";
  if (stage === "FAILED") return slice?.failure_summary || "切片失败";
  if (stage === "SLICING") return "正在生成 G-code";
  return "尚未开始切片";
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function assertLocalPost(request, response, config, body, csrfToken, logger) {
  const originCheck = inspectLocalRequestOrigin(request.headers, config.port);
  const form = parse(body || "");
  const csrfPresent = Boolean(String(form.csrf || ""));
  const csrfOk = csrfPresent && safeTokenEqual(String(form.csrf || ""), csrfToken);
  const diagnostics = {
    method: String(request.method || ""),
    path: String(request.url || "").split("?")[0],
    host: String(request.headers.host || ""),
    origin: originCheck.origin || null,
    refererOrigin: originCheck.referer || null,
    fetchSite: originCheck.fetchSite || null,
    cookiePresent: Boolean(request.headers.cookie),
    csrfPresent,
    csrfValid: csrfOk,
  };

  if (!originCheck.ok) {
    logger?.warn?.(`[make3d-workbench-request] ${JSON.stringify({
      ...diagnostics,
      status: 403,
      result: originCheck.reason,
    })}`);
    send(response, 403, "禁止跨站提交", "text/plain; charset=utf-8");
    return false;
  }
  if (!csrfOk) {
    logger?.warn?.(`[make3d-workbench-request] ${JSON.stringify({
      ...diagnostics,
      status: 403,
      result: "csrf-rejected",
    })}`);
    send(response, 403, "页面校验已失效，请刷新后重试", "text/plain; charset=utf-8");
    return false;
  }
  logger?.info?.(`[make3d-workbench-request] ${JSON.stringify({
    ...diagnostics,
    status: "accepted",
    result: "csrf-and-origin-accepted",
  })}`);
  return true;
}

function logLocalActionResult(logger, request, status, result) {
  logger?.info?.(`[make3d-workbench-result] ${JSON.stringify({
    method: String(request.method || ""),
    path: String(request.url || "").split("?")[0],
    status,
    result: String(result || "completed").slice(0, 80),
  })}`);
}

function acceptsJson(request) {
  return String(request.headers.accept || "").toLowerCase().includes("application/json");
}

function buildFileStatusResponse(detail) {
  return {
    orderId: detail.detail.order.id,
    orderNo: detail.detail.order.order_no,
    localFilesRoot: detail.localFilesRoot,
    files: (detail.detail.files || []).map((file) => {
      const check = detail.localChecks.get(file.local_file_sync_job_id) || {};
      return {
        fileId: file.file_id,
        syncJobId: file.local_file_sync_job_id,
        originalFilename: file.original_filename || file.masked_filename,
        originalFilenameMasked: !file.original_filename,
        source: "production_uploads_via_worker_api",
        status: file.sync_status || "not_scheduled",
        savedFilename: check.path ? String(check.path).split(/[\\/]/).pop() : null,
        savedDirectory: check.directory || null,
        savedPath: check.path || null,
        relativePath: file.relative_path || null,
        sizeBytes: check.size ?? null,
        expectedSizeBytes: file.expected_size_bytes ?? file.filesize ?? null,
        expectedSha256: file.expected_sha256 || null,
        localSha256: check.sha256 || null,
        fileExists: check.exists === true,
        sizeMatches: check.size_matches ?? null,
        shaMatches: check.sha_matches ?? null,
        downloadedAt: file.local_synced_at || check.modified_at || null,
        error: check.error || file.last_error_summary || null,
      };
    }),
  };
}

function buildReviewPatch(form) {
  const patch = {};
  for (const key of [
    "state",
    "selected_file_id",
    "selected_sync_job_id",
    "lead_time_min_hours",
    "lead_time_max_hours",
    "estimated_ship_at",
    "expected_ship_date",
    "price_adjustment_reason",
    "production_note",
    "reply_template",
    "reply_draft",
    "operator_note",
  ]) {
    if (key in form) patch[key] = form[key];
  }
  if ("suggested_price_yuan" in form) {
    patch.suggested_price_cents = parseYuanToCents(form.suggested_price_yuan, "suggested_price_yuan");
  } else if ("suggested_price_cents" in form) {
    patch.suggested_price_cents = form.suggested_price_cents;
  }
  if ("confirmed_price_yuan" in form) {
    patch.confirmed_price_cents = parseYuanToCents(form.confirmed_price_yuan, "confirmed_price_yuan");
  } else if ("confirmed_price_cents" in form) {
    patch.confirmed_price_cents = form.confirmed_price_cents;
  }
  return patch;
}

function parseYuanToCents(value, name) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`${name} must be a non-negative amount with at most 2 decimal places`);
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0") || "0");
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${name} is too large`);
  return Number(cents);
}

function buildOnlineSyncPayload(review, expectedOrderVersion, clientRequestId) {
  if (!review) throw new Error("local review draft is required");
  if (!expectedOrderVersion) throw new Error("online order version is required");
  const messageBody = String(review.reply_draft || "").trim();
  if (!messageBody) throw new Error("reply draft is required before online sync");
  return {
    client_request_id: `workbench:${clientRequestId}`,
    expected_order_version: expectedOrderVersion,
    confirmed_quote_amount_cents: review.confirmed_price_cents,
    lead_time_min_hours: review.lead_time_min_hours,
    lead_time_max_hours: review.lead_time_max_hours,
    estimated_ship_at: review.estimated_ship_at || "",
    expected_ship_date: review.expected_ship_date || "",
    price_adjustment_reason: review.price_adjustment_reason || "",
    production_note: review.production_note || "",
    message_type: mapReplyTemplateToMessageType(review.reply_template),
    message_body: messageBody,
  };
}

function mapReplyTemplateToMessageType(value) {
  const map = {
    FILE_RECEIVED: "FILE_RECEIVED",
    FILE_CONFIRMED: "FILE_CONFIRMED",
    MODEL_PROBLEM_REUPLOAD: "REUPLOAD_REQUIRED",
    CONFIRM_MATERIAL_COLOR_QUANTITY: "MATERIAL_CONFIRM_REQUIRED",
    QUOTE_MANUAL_CONFIRM: "QUOTE_CONFIRMATION",
    LEAD_TIME_UPDATED: "LEAD_TIME_CONFIRMATION",
    CONFIRM_SUPPORT_OR_APPEARANCE: "GENERAL_REPLY",
    PLAIN_TEXT: "TEXT",
  };
  return map[value] || "GENERAL_REPLY";
}

function send(response, statusCode, body, contentType = "text/html; charset=utf-8") {
  response.writeHead(statusCode, {
    ...securityHeaders(),
    "Content-Type": contentType,
  });
  response.end(body);
}

function sendJson(response, statusCode, payload) {
  send(response, statusCode, `${JSON.stringify(payload)}\n`, "application/json; charset=utf-8");
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

function localizeWorkbenchError(error) {
  const message = redactString(error instanceof Error ? error.message : String(error));
  if (/suggested_price_yuan|confirmed_price_yuan/.test(message)) {
    return "价格必须是大于或等于 0 的数字，最多保留两位小数，例如 128.50。";
  }
  if (/suggested_price_cents|confirmed_price_cents/.test(message)) {
    return "价格格式不正确，请输入大于或等于 0 的人民币金额。";
  }
  if (/lead_time_max_hours must be >= min/.test(message)) {
    return "最长货期不能小于最短货期。";
  }
  if (/lead_time_.*must be|lead_time_.*too large/.test(message)) {
    return "货期必须使用大于或等于 0 的整数小时，且不能超过 90 天。";
  }
  if (/expected_ship_date/.test(message)) return "预计发货日期必须是有效的 YYYY-MM-DD 日期。";
  if (/reply draft is required/.test(message)) return "请先填写给客户的回复草稿。";
  if (/online order version is required/.test(message)) return "暂时无法读取线上订单版本，请刷新页面后重试。";
  if (/local workbench database is not available/.test(message)) return "本地工作台数据库暂不可用。";
  if (/request body too large/.test(message)) return "提交内容过长，请缩短后重试。";
  return `操作未完成：${message}`;
}

function formatBoolean(value) {
  if (value === true) return "是";
  if (value === false) return "否";
  return "未检查";
}

function formatLocalFileError(value) {
  const map = {
    "sync-not-verified": "文件尚未完成同步验证",
    "file-not-verified": "本地文件未通过验证",
    "not-found": "本地文件不存在",
    "sha256-mismatch": "本地文件 SHA 不一致",
    "not-file": "目标不是文件",
    "opener-unavailable": "当前 WSL 无法启动 Windows 文件资源管理器",
    "directory-open-failed": "Windows 文件资源管理器未能打开目标目录",
    "directory-opened-not-focused": "文件夹已打开，但未取得前台焦点",
    "directory-not-found": "目标目录不存在",
  };
  return map[value] || String(value || "未知错误");
}

function formatLocalStateForMessage(value) {
  const map = {
    UNREVIEWED: "未处理",
    REVIEWING: "处理中",
    FILE_PROBLEM: "文件存在问题",
    READY_TO_SLICE: "可以切片",
    SLICING: "切片中",
    SLICE_REVIEWED: "切片结果已查看",
    SLICE_CONFIRMED: "切片结果已确认",
    SLICE_NEEDS_FIX: "切片需要调整",
    QUOTE_DRAFTED: "报价草稿已填写",
    READY_FOR_ONLINE_SYNC: "可以同步 TEST 订单",
    CLOSED: "已关闭",
  };
  return map[value] || String(value || "未处理");
}

function isValidationError(error) {
  const message = String(error?.message || error || "");
  return /must be|invalid |too large|too long|>= 0|must be >= min|request body too large|sync job not found|not available/i.test(message)
    && !/database|sqlite|internal|failed to fetch|ECONN|ENOTFOUND|EAI_AGAIN|permission denied/i.test(message);
}

async function loadOrderListDetails(cloudClient, orders, cache, concurrency = 8) {
  const result = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < orders.length) {
      const order = orders[cursor++];
      const orderId = Number(order.id);
      const cached = cache.get(orderId);
      if (cached && Date.now() - cached.savedAt < 30_000) {
        result.set(orderId, cached.detail);
        continue;
      }
      try {
        const detail = await cloudClient.getOrder(orderId);
        cache.set(orderId, { detail, savedAt: Date.now() });
        result.set(orderId, detail);
      } catch {
        // List rendering remains available even if one detail lookup fails.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(orders.length, 1)) }, () => worker()));
  return result;
}

function emptyListStats() {
  return { all: 0, actionable: 0, fileAbnormal: 0, sliceFailed: 0, waitingCustomer: 0, todayNew: 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadWorkbenchConfig();
  const { server } = await startWorkbenchServer(config);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`Make3D Local Order Workbench listening on http://${config.host}:${port}`);
}
