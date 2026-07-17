import { timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { NextResponse } from "next/server.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type OperatorWorkbenchAuthContext = {
  readonly authenticated: true;
};

export type OperatorWorkbenchOrderFilters = {
  query?: string | null;
  status?: string | null;
  syncStatus?: string | null;
  limit?: number | null;
};

type OrderSummaryRow = {
  id: number;
  orderNo: string;
  createdAt: string;
  updatedAt: string | null;
  status: string;
  paymentStatus: string | null;
  material: string;
  color: string | null;
  quantity: number;
  estimatedPrice: number | null;
  payablePrice: number | null;
  finalPrice: number | null;
  estimatedLeadTimeMinHours: number | null;
  estimatedLeadTimeMaxHours: number | null;
  finalLeadTimeHours: number | null;
  remark: string | null;
  fileCount: number;
  syncJobCount: number;
  verifiedSyncCount: number;
  localSyncedCount: number;
  failedSyncCount: number;
  pendingSyncCount: number;
  isTestAccount: 0 | 1 | boolean | null;
};

type FileDetailRow = {
  fileId: number;
  filename: string;
  filesize: number;
  createdAt: string;
  material: string | null;
  color: string | null;
  quantity: number;
  boundingBoxX: number | null;
  boundingBoxY: number | null;
  boundingBoxZ: number | null;
  riskLevel: string | null;
  riskNotice: string | null;
  requiresManualConfirmation: 0 | 1 | boolean;
  localFileSyncJobId: number | null;
  syncStatus: string | null;
  relativePath: string | null;
  localPath: string | null;
  expectedSizeBytes: number | null;
  expectedSha256: string | null;
  localSyncedAt: string | null;
  lastError: string | null;
};

type CustomerServiceMessageRow = {
  id: number;
  orderId: number | null;
  message: string;
  status: string;
  source: string | null;
  category: string | null;
  customerVisibleReply: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export function requireOperatorWorkbenchAuth(request: Request): OperatorWorkbenchAuthContext | NextResponse {
  const expectedToken = process.env.MAKE3D_LOCAL_WORKBENCH_TOKEN?.trim();

  if (!expectedToken) {
    return NextResponse.json({ error: "Operator workbench API is not configured" }, { status: 503 });
  }

  const providedToken = extractBearerToken(request);

  if (!providedToken || !safeTokenEqual(providedToken, expectedToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { authenticated: true };
}

export function isOperatorWorkbenchAuthContext(
  value: OperatorWorkbenchAuthContext | NextResponse,
): value is OperatorWorkbenchAuthContext {
  return !(value instanceof NextResponse);
}

export function listOperatorWorkbenchOrders(db: DatabaseSync, filters: OperatorWorkbenchOrderFilters = {}) {
  const where: string[] = [];
  const values: (number | string)[] = [];
  const query = String(filters.query || "").trim();
  const status = String(filters.status || "").trim();
  const syncStatus = String(filters.syncStatus || "").trim();
  const limit = normalizeLimit(filters.limit);

  if (query) {
    where.push("(orders.order_no LIKE ? OR orders.remark LIKE ?)");
    const like = `%${query}%`;
    values.push(like, like);
  }

  if (status) {
    where.push("orders.status = ?");
    values.push(status);
  }

  const sql = `
    SELECT
      orders.id,
      orders.order_no AS orderNo,
      orders.created_at AS createdAt,
      orders.updated_at AS updatedAt,
      orders.status,
      orders.payment_status AS paymentStatus,
      orders.material,
      orders.color,
      orders.quantity,
      orders.estimated_price AS estimatedPrice,
      orders.payable_price AS payablePrice,
      orders.final_price AS finalPrice,
      orders.estimated_lead_time_min_hours AS estimatedLeadTimeMinHours,
      orders.estimated_lead_time_max_hours AS estimatedLeadTimeMaxHours,
      orders.final_lead_time_hours AS finalLeadTimeHours,
      orders.remark,
      COALESCE(file_counts.fileCount, 0) AS fileCount,
      COALESCE(sync_counts.syncJobCount, 0) AS syncJobCount,
      COALESCE(sync_counts.verifiedSyncCount, 0) AS verifiedSyncCount,
      COALESCE(sync_counts.localSyncedCount, 0) AS localSyncedCount,
      COALESCE(sync_counts.failedSyncCount, 0) AS failedSyncCount,
      COALESCE(sync_counts.pendingSyncCount, 0) AS pendingSyncCount,
      customers.is_test_account AS isTestAccount
    FROM orders
    LEFT JOIN customers ON customers.id = orders.customer_id
    LEFT JOIN (
      SELECT order_id, COUNT(*) AS fileCount
      FROM files
      GROUP BY order_id
    ) AS file_counts ON file_counts.order_id = orders.id
    LEFT JOIN (
      SELECT
        order_id,
        COUNT(*) AS syncJobCount,
        SUM(CASE WHEN sync_status = 'verified' THEN 1 ELSE 0 END) AS verifiedSyncCount,
        SUM(CASE WHEN sync_status = 'local_synced' THEN 1 ELSE 0 END) AS localSyncedCount,
        SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) AS failedSyncCount,
        SUM(CASE WHEN sync_status IN ('pending', 'locked', 'downloaded') THEN 1 ELSE 0 END) AS pendingSyncCount
      FROM local_file_sync_jobs
      GROUP BY order_id
    ) AS sync_counts ON sync_counts.order_id = orders.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY orders.created_at DESC, orders.id DESC
    LIMIT ?`;

  values.push(limit);

  const orders = (db.prepare(sql).all(...values) as OrderSummaryRow[])
    .map(toOrderSummary)
    .filter((order) => !syncStatus || order.file_sync_summary.status === syncStatus);

  return { orders };
}

export function getOperatorWorkbenchOrderDetail(db: DatabaseSync, id: number) {
  const order = (db
    .prepare(
      `
      SELECT
        orders.id,
        orders.order_no AS orderNo,
        orders.created_at AS createdAt,
        orders.updated_at AS updatedAt,
        orders.status,
        orders.payment_status AS paymentStatus,
        orders.material,
        orders.color,
        orders.quantity,
        orders.estimated_price AS estimatedPrice,
        orders.payable_price AS payablePrice,
        orders.final_price AS finalPrice,
        orders.estimated_lead_time_min_hours AS estimatedLeadTimeMinHours,
        orders.estimated_lead_time_max_hours AS estimatedLeadTimeMaxHours,
        orders.final_lead_time_hours AS finalLeadTimeHours,
        orders.remark,
        (SELECT COUNT(*) FROM files WHERE files.order_id = orders.id) AS fileCount,
        (SELECT COUNT(*) FROM local_file_sync_jobs WHERE local_file_sync_jobs.order_id = orders.id) AS syncJobCount,
        (SELECT COUNT(*) FROM local_file_sync_jobs WHERE local_file_sync_jobs.order_id = orders.id AND sync_status = 'verified') AS verifiedSyncCount,
        (SELECT COUNT(*) FROM local_file_sync_jobs WHERE local_file_sync_jobs.order_id = orders.id AND sync_status = 'local_synced') AS localSyncedCount,
        (SELECT COUNT(*) FROM local_file_sync_jobs WHERE local_file_sync_jobs.order_id = orders.id AND sync_status = 'failed') AS failedSyncCount,
        (SELECT COUNT(*) FROM local_file_sync_jobs WHERE local_file_sync_jobs.order_id = orders.id AND sync_status IN ('pending', 'locked', 'downloaded')) AS pendingSyncCount,
        customers.is_test_account AS isTestAccount
      FROM orders
      LEFT JOIN customers ON customers.id = orders.customer_id
      WHERE orders.id = ?`,
    )
    .get(id) as OrderSummaryRow | undefined);

  if (!order) return null;

  const files = db
    .prepare(
      `
      SELECT
        files.id AS fileId,
        files.filename,
        files.filesize,
        files.created_at AS createdAt,
        files.material,
        files.color,
        files.quantity,
        files.bounding_box_x AS boundingBoxX,
        files.bounding_box_y AS boundingBoxY,
        files.bounding_box_z AS boundingBoxZ,
        files.risk_level AS riskLevel,
        files.risk_notice AS riskNotice,
        files.requires_manual_confirmation AS requiresManualConfirmation,
        local_file_sync_jobs.id AS localFileSyncJobId,
        local_file_sync_jobs.sync_status AS syncStatus,
        local_file_sync_jobs.relative_path AS relativePath,
        local_file_sync_jobs.local_path AS localPath,
        local_file_sync_jobs.file_size_bytes AS expectedSizeBytes,
        local_file_sync_jobs.sha256 AS expectedSha256,
        local_file_sync_jobs.local_synced_at AS localSyncedAt,
        local_file_sync_jobs.last_error AS lastError
      FROM files
      LEFT JOIN local_file_sync_jobs ON local_file_sync_jobs.file_id = files.id
      WHERE files.order_id = ?
      ORDER BY files.created_at ASC, files.id ASC`,
    )
    .all(id)
    .map(toSafeFileSummary);

  const customerServiceRequests = db
    .prepare(
      `
      SELECT
        id,
        order_id AS orderId,
        message,
        status,
        source,
        category,
        customer_visible_reply AS customerVisibleReply,
        handled_by AS handledBy,
        handled_at AS handledAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM customer_service_requests
      WHERE order_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 20`,
    )
    .all(id)
    .map(toCustomerServiceMessage);

  return {
    order: toOrderSummary(order),
    files,
    customer_service_requests: customerServiceRequests,
  };
}

function toOrderSummary(row: OrderSummaryRow) {
  return {
    id: row.id,
    order_no: row.orderNo,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    status: row.status,
    payment_status: row.paymentStatus,
    material: row.material,
    color: row.color,
    quantity: row.quantity,
    estimated_price: row.estimatedPrice,
    payable_price: row.payablePrice,
    final_price: row.finalPrice,
    estimated_lead_time_min_hours: row.estimatedLeadTimeMinHours,
    estimated_lead_time_max_hours: row.estimatedLeadTimeMaxHours,
    final_lead_time_hours: row.finalLeadTimeHours,
    remark: summarizeText(row.remark, 240),
    file_count: Number(row.fileCount || 0),
    file_sync_summary: buildFileSyncSummary(row),
    is_test_account: Boolean(row.isTestAccount),
  };
}

function toSafeFileSummary(value: unknown) {
  const row = value as FileDetailRow;
  const path = sanitizeLocalRelativePath(row.localPath) || sanitizeRelativePath(row.relativePath);
  return {
    file_id: row.fileId,
    masked_filename: maskFilename(row.filename),
    format: getFileFormat(row.filename),
    filesize: row.filesize,
    created_at: row.createdAt,
    material: row.material,
    color: row.color,
    quantity: row.quantity,
    bounding_box_x: row.boundingBoxX,
    bounding_box_y: row.boundingBoxY,
    bounding_box_z: row.boundingBoxZ,
    risk_level: row.riskLevel,
    risk_notice: summarizeText(row.riskNotice, 500),
    requires_manual_confirmation: Boolean(row.requiresManualConfirmation),
    local_file_sync_job_id: row.localFileSyncJobId,
    sync_status: row.syncStatus,
    relative_path: path.ok ? path.path : null,
    relative_path_status: path.ok ? "ok" : path.reason,
    expected_size_bytes: row.expectedSizeBytes ?? row.filesize,
    expected_sha256: normalizeSha256(row.expectedSha256),
    local_synced_at: row.localSyncedAt,
    last_error_summary: summarizeText(row.lastError, 300),
  };
}

function toCustomerServiceMessage(value: unknown) {
  const row = value as CustomerServiceMessageRow;
  return {
    id: row.id,
    order_id: row.orderId,
    message: summarizeText(row.message, 1000),
    status: row.status,
    source: row.source,
    category: row.category,
    customer_visible_reply: summarizeText(row.customerVisibleReply, 1000),
    handled_by: row.handledBy ? "operator" : null,
    handled_at: row.handledAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function buildFileSyncSummary(row: OrderSummaryRow) {
  const fileCount = Number(row.fileCount || 0);
  const syncJobCount = Number(row.syncJobCount || 0);
  const verified = Number(row.verifiedSyncCount || 0);
  const localSynced = Number(row.localSyncedCount || 0);
  const failed = Number(row.failedSyncCount || 0);
  const pending = Number(row.pendingSyncCount || 0);
  const complete = verified + localSynced;
  const missing = Math.max(0, fileCount - syncJobCount);

  let status = "unknown";
  if (fileCount === 0) status = "no_files";
  else if (failed > 0) status = "failed";
  else if (missing > 0) status = "missing_sync_job";
  else if (complete >= fileCount) status = "verified";
  else if (pending > 0) status = "syncing";

  return {
    status,
    file_count: fileCount,
    sync_job_count: syncJobCount,
    verified_count: verified,
    local_synced_count: localSynced,
    failed_count: failed,
    pending_count: pending,
    missing_job_count: missing,
  };
}

export function sanitizeRelativePath(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return { ok: false as const, reason: "empty-path" };
  if (text.includes("\0")) return { ok: false as const, reason: "null-byte" };
  if (text.includes("\\") || text.includes("//")) return { ok: false as const, reason: "slash" };
  if (text.includes("%")) return { ok: false as const, reason: "percent-encoded" };
  if (text.startsWith("/") || /^[A-Za-z]:[\\/]/.test(text)) return { ok: false as const, reason: "absolute-path" };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return { ok: false as const, reason: "protocol" };
  if (text.includes("/srv/") || text.startsWith("srv/")) return { ok: false as const, reason: "srv-path" };
  const parts = text.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    return { ok: false as const, reason: "unsafe-segment" };
  }
  return { ok: true as const, path: text };
}

function sanitizeLocalRelativePath(value: string | null | undefined) {
  const text = String(value || "").trim();
  const root = "/srv/make3d-worker/files/";
  if (!text.startsWith(root)) return null;
  return sanitizeRelativePath(text.slice(root.length));
}

function normalizeSha256(value: string | null | undefined) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function maskFilename(filename: string) {
  const text = String(filename || "file").replace(/[\\/]/g, "_");
  const dot = text.lastIndexOf(".");
  const base = dot > 0 ? text.slice(0, dot) : text;
  const ext = dot > 0 ? text.slice(dot) : "";
  if (base.length <= 4) return `${base.slice(0, 1)}***${ext}`;
  return `${base.slice(0, 2)}***${base.slice(-2)}${ext}`;
}

function getFileFormat(filename: string) {
  const match = /\.([A-Za-z0-9]{1,12})$/.exec(filename || "");
  return match ? match[1].toLowerCase() : "";
}

function summarizeText(value: string | null | undefined, maxLength: number) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text || null;
}

function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

function safeTokenEqual(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function normalizeLimit(value: number | null | undefined) {
  const limit = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.trunc(limit), MAX_LIMIT));
}
