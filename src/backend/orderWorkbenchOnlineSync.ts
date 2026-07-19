import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { classifyTestSubject } from "./testClassification.ts";
import {
  ORDER_MESSAGE_TYPES,
  ORDER_WORKBENCH_WRITE_SCHEMA_VERSION,
  verifyOrderWorkbenchWriteSchema,
} from "./orderWorkbenchWriteSchema.ts";

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503;

export class OrderWorkbenchWriteError extends Error {
  readonly status: ErrorStatus;
  readonly code: string;

  constructor(status: ErrorStatus, code: string, message: string) {
    super(message);
    this.name = "OrderWorkbenchWriteError";
    this.status = status;
    this.code = code;
  }
}

export type ConfirmAndReplyInput = {
  readonly client_request_id?: unknown;
  readonly expected_order_version?: unknown;
  readonly confirmed_quote_amount_cents?: unknown;
  readonly lead_time_min_hours?: unknown;
  readonly lead_time_max_hours?: unknown;
  readonly estimated_ship_at?: unknown;
  readonly expected_ship_date?: unknown;
  readonly price_adjustment_reason?: unknown;
  readonly production_note?: unknown;
  readonly message_type?: unknown;
  readonly message_body?: unknown;
};

export type ConfirmAndReplyOptions = {
  readonly operatorId?: string | null;
  readonly failAfterConfirmationForTest?: boolean;
  readonly failAfterMessageForTest?: boolean;
  readonly failAtAuditForTest?: boolean;
  readonly failBeforeCommitForTest?: boolean;
};

const MAX_LEAD_TIME_HOURS = 24 * 90;
const CUSTOMER_VISIBLE_MESSAGE_LIMIT = 100;

export function getOrderWorkbenchOrderVersion(db: DatabaseSync, orderId: number) {
  const order = db
    .prepare(
      `
      SELECT
        id,
        customer_id,
        updated_at,
        status,
        payment_status,
        material,
        color,
        quantity
      FROM orders
      WHERE id = ?`,
    )
    .get(requirePositiveInteger(orderId, "order_id")) as Record<string, unknown> | undefined;

  if (!order) return null;

  const files = db
    .prepare(
      `
      SELECT id, filesize, created_at, material, color, quantity
      FROM files
      WHERE order_id = ?
      ORDER BY id ASC`,
    )
    .all(orderId);

  const payload = {
    order,
    file_digest: sha256Json(files),
    file_count: files.length,
    customer_service_requests: tableExists(db, "customer_service_requests")
      ? getCustomerServiceRequestVersionSummary(db, orderId)
      : null,
    order_messages: tableExists(db, "order_messages")
      ? getSummaryRow(
          db,
          `
          SELECT
            COUNT(*) AS count,
            MAX(id) AS latest_id,
            MAX(CASE WHEN sender_type = 'CUSTOMER' THEN id ELSE NULL END) AS latest_customer_sender_id,
            MAX(created_at) AS latest_created_at
          FROM order_messages
          WHERE order_id = ?`,
          orderId,
        )
      : null,
    operator_order_confirmations: tableExists(db, "operator_order_confirmations")
      ? getSummaryRow(
          db,
          `
          SELECT COUNT(*) AS count, MAX(id) AS latest_id, MAX(created_at) AS latest_created_at
          FROM operator_order_confirmations
          WHERE order_id = ?`,
          orderId,
        )
      : null,
  };

  return sha256Json(payload);
}

export function buildOrderWorkbenchRequestFingerprint(orderId: number, input: ConfirmAndReplyInput) {
  const normalized = normalizeConfirmAndReplyInput(input);
  return sha256Json({
    order_id: requirePositiveInteger(orderId, "order_id"),
    expected_order_version: normalized.expected_order_version,
    confirmed_quote_amount_cents: normalized.confirmed_quote_amount_cents,
    lead_time_min_hours: normalized.lead_time_min_hours,
    lead_time_max_hours: normalized.lead_time_max_hours,
    estimated_ship_at: normalized.estimated_ship_at,
    expected_ship_date: normalized.expected_ship_date,
    price_adjustment_reason: normalized.price_adjustment_reason,
    production_note: normalized.production_note,
    message_type: normalized.message_type,
    message_body: normalized.message_body,
  });
}

export function getLatestOperatorOrderConfirmation(db: DatabaseSync, orderId: number) {
  if (!tableExists(db, "operator_order_confirmations")) return null;
  const expectedShipDate = optionalColumnSelect(db, "operator_order_confirmations", "expected_ship_date", "expectedShipDate");
  const priceAdjustmentReason = optionalColumnSelect(db, "operator_order_confirmations", "price_adjustment_reason", "priceAdjustmentReason");
  const productionNote = optionalColumnSelect(db, "operator_order_confirmations", "production_note", "productionNote");
  const row = db
    .prepare(
      `
      SELECT
        id,
        order_id AS orderId,
        customer_id AS customerId,
        confirmed_quote_amount_cents AS confirmedQuoteAmountCents,
        lead_time_min_hours AS leadTimeMinHours,
        lead_time_max_hours AS leadTimeMaxHours,
        estimated_ship_at AS estimatedShipAt,
        ${expectedShipDate},
        ${priceAdjustmentReason},
        ${productionNote},
        operator_note AS operatorNote,
        operator_id AS operatorId,
        order_version_snapshot AS orderVersionSnapshot,
        created_at AS createdAt
      FROM operator_order_confirmations
      WHERE order_id = ?
      ORDER BY id DESC
      LIMIT 1`,
    )
    .get(requirePositiveInteger(orderId, "order_id")) as Record<string, unknown> | undefined;

  return row ? toConfirmation(row) : null;
}

export function listVisibleOrderMessagesForCustomer(db: DatabaseSync, orderId: number, customerId: number) {
  if (!tableExists(db, "order_messages")) return [];
  const rows = db
    .prepare(
      `
      SELECT
        order_messages.id,
        order_messages.order_id AS orderId,
        order_messages.customer_id AS customerId,
        order_messages.sender_type AS senderType,
        order_messages.message_type AS messageType,
        order_messages.body,
        order_messages.customer_visible AS customerVisible,
        order_messages.created_at AS createdAt
      FROM order_messages
      JOIN orders ON orders.id = order_messages.order_id
      WHERE order_messages.order_id = ?
        AND order_messages.customer_id = ?
        AND orders.customer_id = ?
        AND order_messages.customer_visible = 1
      ORDER BY order_messages.created_at ASC, order_messages.id ASC
      LIMIT ?`,
    )
    .all(
      requirePositiveInteger(orderId, "order_id"),
      requirePositiveInteger(customerId, "customer_id"),
      requirePositiveInteger(customerId, "customer_id"),
      CUSTOMER_VISIBLE_MESSAGE_LIMIT,
    ) as Record<string, unknown>[];

  return rows.map(toOrderMessage);
}

export function confirmAndReplyToTestOrder(
  db: DatabaseSync,
  orderId: number,
  input: ConfirmAndReplyInput,
  options: ConfirmAndReplyOptions = {},
) {
  const normalized = normalizeConfirmAndReplyInput(input);
  const requestFingerprint = buildOrderWorkbenchRequestFingerprint(orderId, normalized);
  const operatorId = normalizeOperatorId(options.operatorId ?? process.env.MAKE3D_LOCAL_WORKBENCH_OPERATOR_ID);
  assertOrderWorkbenchWriteSchemaReady(db);
  const idempotent = getExistingSyncResult(db, normalized.client_request_id, requestFingerprint);
  if (idempotent) return { ...idempotent, created: false };

  db.exec("BEGIN IMMEDIATE");
  try {
    const duplicate = getExistingSyncResult(db, normalized.client_request_id, requestFingerprint);
    if (duplicate) {
      db.exec("COMMIT");
      return { ...duplicate, created: false };
    }

    const context = readOrderCustomerContext(db, orderId);
    ensureTestOnlyWritable(context);

    const currentVersion = getOrderWorkbenchOrderVersion(db, orderId);
    if (!currentVersion) throw new OrderWorkbenchWriteError(404, "ORDER_NOT_FOUND", "Order not found");
    if (currentVersion !== normalized.expected_order_version) {
      throw new OrderWorkbenchWriteError(409, "ORDER_VERSION_CONFLICT", "Order has changed");
    }

    const beforeSummary = JSON.stringify({
      order_id: context.orderId,
      latest_confirmation_id: getLatestOperatorOrderConfirmation(db, context.orderId)?.id ?? null,
      order_version: currentVersion,
    });

    db.prepare(
      `
      INSERT INTO operator_order_confirmations (
        order_id,
        customer_id,
        confirmed_quote_amount_cents,
        lead_time_min_hours,
        lead_time_max_hours,
        estimated_ship_at,
        expected_ship_date,
        price_adjustment_reason,
        production_note,
        operator_note,
        operator_id,
        client_request_id,
        request_fingerprint,
        order_version_snapshot,
        schema_version,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      context.orderId,
      context.customerId,
      normalized.confirmed_quote_amount_cents,
      normalized.lead_time_min_hours,
      normalized.lead_time_max_hours,
      normalized.estimated_ship_at,
      normalized.expected_ship_date,
      normalized.price_adjustment_reason,
      normalized.production_note,
      null,
      operatorId,
      normalized.client_request_id,
      requestFingerprint,
      currentVersion,
      ORDER_WORKBENCH_WRITE_SCHEMA_VERSION,
    );

    if (options.failAfterConfirmationForTest) {
      throw new OrderWorkbenchWriteError(500, "INJECTED_TEST_FAILURE", "Injected transaction failure");
    }

    db.prepare(
      `
      INSERT INTO order_messages (
        order_id,
        customer_id,
        sender_type,
        message_type,
        body,
        customer_visible,
        operator_id,
        client_request_id,
        request_fingerprint,
        order_version_snapshot,
        schema_version,
        created_at
      ) VALUES (?, ?, 'OPERATOR', ?, ?, 1, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      context.orderId,
      context.customerId,
      normalized.message_type,
      normalized.message_body,
      operatorId,
      normalized.client_request_id,
      requestFingerprint,
      currentVersion,
      ORDER_WORKBENCH_WRITE_SCHEMA_VERSION,
    );

    if (options.failAfterMessageForTest) {
      throw new OrderWorkbenchWriteError(500, "INJECTED_TEST_FAILURE", "Injected transaction failure after message");
    }

    const confirmation = getConfirmationByClientRequestId(db, normalized.client_request_id);
    const message = getMessageByClientRequestId(db, normalized.client_request_id);
    const afterSummary = JSON.stringify({
      confirmation_id: confirmation?.id ?? null,
      message_id: message?.id ?? null,
      confirmed_quote_amount_cents: normalized.confirmed_quote_amount_cents,
      lead_time_min_hours: normalized.lead_time_min_hours,
      lead_time_max_hours: normalized.lead_time_max_hours,
      expected_ship_date: normalized.expected_ship_date,
      price_adjustment_reason: normalized.price_adjustment_reason,
      production_note: normalized.production_note,
    });

    db.prepare(
      `
      INSERT INTO operator_order_audit_events (
        order_id,
        operator_id,
        action,
        before_summary,
        after_summary,
        client_request_id,
        request_fingerprint,
        result,
        schema_version,
        created_at
      ) VALUES (?, ?, 'confirm_and_reply', ?, ?, ?, ?, 'ok', ?, datetime('now'))`,
    ).run(
      context.orderId,
      operatorId,
      sanitizeAuditText(beforeSummary),
      sanitizeAuditText(afterSummary),
      normalized.client_request_id,
      requestFingerprint,
      ORDER_WORKBENCH_WRITE_SCHEMA_VERSION,
    );

    if (options.failAtAuditForTest || options.failBeforeCommitForTest) {
      throw new OrderWorkbenchWriteError(500, "INJECTED_TEST_FAILURE", "Injected transaction failure before commit");
    }

    db.exec("COMMIT");

    const currentOrderVersion = getOrderWorkbenchOrderVersion(db, context.orderId);
    return {
      created: true,
      previous_order_version: currentVersion,
      current_order_version: currentOrderVersion,
      confirmation: getConfirmationByClientRequestId(db, normalized.client_request_id),
      message: getMessageByClientRequestId(db, normalized.client_request_id),
      request_fingerprint: requestFingerprint,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function readOrderCustomerContext(db: DatabaseSync, orderId: number) {
  const row = db
    .prepare(
      `
      SELECT
        orders.id AS orderId,
        orders.order_no AS orderNo,
        orders.customer_id AS orderCustomerId,
        customers.id AS customerId,
        customers.is_test_account AS customerIsTestAccount
      FROM orders
      LEFT JOIN customers ON customers.id = orders.customer_id
      WHERE orders.id = ?`,
    )
    .get(requirePositiveInteger(orderId, "order_id")) as Record<string, unknown> | undefined;

  if (!row) throw new OrderWorkbenchWriteError(404, "ORDER_NOT_FOUND", "Order not found");
  if (!row.orderCustomerId || !row.customerId || row.orderCustomerId !== row.customerId) {
    throw new OrderWorkbenchWriteError(403, "ORDER_CUSTOMER_RELATION_INVALID", "Order customer relation is not writable");
  }

  return {
    orderId: Number(row.orderId),
    orderNo: String(row.orderNo || ""),
    customerId: Number(row.customerId),
    customerIsTestAccount: row.customerIsTestAccount,
  };
}

function ensureTestOnlyWritable(context: ReturnType<typeof readOrderCustomerContext>) {
  const classification = classifyTestSubject({
    customerId: context.customerId,
    customerIsTestAccount: context.customerIsTestAccount as boolean | number | string | null,
    sourceMarkers: [context.orderNo],
  });

  if (!classification.isTest || classification.authoritativeTestFlag !== true || classification.failClosed) {
    throw new OrderWorkbenchWriteError(403, "TEST_ONLY_WRITE_REJECTED", "Only authoritative TEST orders can be updated");
  }
}

function normalizeConfirmAndReplyInput(input: ConfirmAndReplyInput) {
  const normalized = {
    client_request_id: requireClientRequestId(input.client_request_id),
    expected_order_version: requireSha(input.expected_order_version, "expected_order_version"),
    confirmed_quote_amount_cents: requireNonNegativeInteger(
      input.confirmed_quote_amount_cents,
      "confirmed_quote_amount_cents",
    ),
    lead_time_min_hours: input.lead_time_min_hours == null || input.lead_time_min_hours === ""
      ? 0
      : requireLeadTime(input.lead_time_min_hours, "lead_time_min_hours"),
    lead_time_max_hours: input.lead_time_max_hours == null || input.lead_time_max_hours === ""
      ? 0
      : requireLeadTime(input.lead_time_max_hours, "lead_time_max_hours"),
    estimated_ship_at: normalizeOptionalIso(input.estimated_ship_at, "estimated_ship_at"),
    expected_ship_date: normalizeOptionalDate(input.expected_ship_date, "expected_ship_date"),
    price_adjustment_reason: normalizeOptionalText(input.price_adjustment_reason, "price_adjustment_reason", 1000),
    production_note: normalizeOptionalText(input.production_note, "production_note", 2000),
    message_type: requireMessageType(input.message_type),
    message_body: requireBody(input.message_body),
  };
  if (normalized.lead_time_max_hours < normalized.lead_time_min_hours) {
    throw new OrderWorkbenchWriteError(422, "LEAD_TIME_RANGE_INVALID", "lead_time_max_hours must be >= min");
  }
  return normalized;
}

function assertOrderWorkbenchWriteSchemaReady(db: DatabaseSync) {
  const readiness = verifyOrderWorkbenchWriteSchema(db);
  if (!readiness.ok || readiness.version !== ORDER_WORKBENCH_WRITE_SCHEMA_VERSION) {
    throw new OrderWorkbenchWriteError(
      503,
      "WORKBENCH_WRITE_SCHEMA_NOT_READY",
      "Workbench write schema is not ready",
    );
  }
}

function requireMessageType(value: unknown) {
  const text = String(value || "").trim();
  if (!ORDER_MESSAGE_TYPES.includes(text as (typeof ORDER_MESSAGE_TYPES)[number])) {
    throw new OrderWorkbenchWriteError(422, "INVALID_MESSAGE_TYPE", "Invalid message_type");
  }
  return text;
}

function requireBody(value: unknown) {
  const text = String(value || "").replace(/\0/g, "").trim();
  if (!text) throw new OrderWorkbenchWriteError(422, "MESSAGE_BODY_REQUIRED", "message_body is required");
  if (text.length > 4000) throw new OrderWorkbenchWriteError(422, "MESSAGE_BODY_TOO_LONG", "message_body is too long");
  return text;
}

function requireLeadTime(value: unknown, name: string) {
  const number = requireNonNegativeInteger(value, name);
  if (number > MAX_LEAD_TIME_HOURS) {
    throw new OrderWorkbenchWriteError(422, "LEAD_TIME_TOO_LARGE", `${name} is too large`);
  }
  return number;
}

function requireNonNegativeInteger(value: unknown, name: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new OrderWorkbenchWriteError(422, "INVALID_INTEGER", `${name} must be a non-negative integer`);
  }
  return number;
}

function requirePositiveInteger(value: unknown, name: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new OrderWorkbenchWriteError(422, "INVALID_ID", `${name} must be a positive integer`);
  }
  return number;
}

function requireClientRequestId(value: unknown) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{12,120}$/.test(text)) {
    throw new OrderWorkbenchWriteError(422, "INVALID_CLIENT_REQUEST_ID", "Invalid client_request_id");
  }
  return text;
}

function requireSha(value: unknown, name: string) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) {
    throw new OrderWorkbenchWriteError(422, "INVALID_SHA256", `${name} must be sha256`);
  }
  return text;
}

function normalizeOptionalIso(value: unknown, name: string) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (text.length > 80 || Number.isNaN(Date.parse(text))) {
    throw new OrderWorkbenchWriteError(422, "INVALID_DATETIME", `${name} must be an ISO datetime`);
  }
  return text;
}

function normalizeOptionalDate(value: unknown, name: string) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new OrderWorkbenchWriteError(422, "INVALID_DATE", `${name} must use YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new OrderWorkbenchWriteError(422, "INVALID_DATE", `${name} is not a valid calendar date`);
  }
  return text;
}

function normalizeOptionalText(value: unknown, name: string, maxLength: number) {
  if (value == null || value === "") return null;
  const text = String(value).replace(/\0/g, "").trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw new OrderWorkbenchWriteError(422, "TEXT_TOO_LONG", `${name} is too long`);
  }
  return text;
}

function normalizeOperatorId(value: string | null | undefined) {
  const text = String(value || "local-workbench-01").trim();
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(text)) {
    throw new OrderWorkbenchWriteError(500, "OPERATOR_ID_INVALID", "Operator id is invalid");
  }
  return text;
}

function getExistingSyncResult(db: DatabaseSync, clientRequestId: string, requestFingerprint: string) {
  if (!tableExists(db, "operator_order_confirmations") || !tableExists(db, "order_messages")) return null;
  const confirmation = getConfirmationByClientRequestId(db, clientRequestId);
  const message = getMessageByClientRequestId(db, clientRequestId);
  if (!confirmation && !message) return null;
  if (!confirmation || !message) {
    throw new OrderWorkbenchWriteError(409, "IDEMPOTENCY_RECORD_INCOMPLETE", "Idempotency record is incomplete");
  }
  if (confirmation.request_fingerprint !== requestFingerprint || message.request_fingerprint !== requestFingerprint) {
    throw new OrderWorkbenchWriteError(409, "IDEMPOTENCY_KEY_REUSED", "client_request_id was reused with different content");
  }
  return {
    previous_order_version: confirmation.order_version_snapshot,
    current_order_version: getOrderWorkbenchOrderVersion(db, confirmation.order_id),
    confirmation,
    message,
  };
}

function getConfirmationByClientRequestId(db: DatabaseSync, clientRequestId: string) {
  const expectedShipDate = optionalColumnSelect(db, "operator_order_confirmations", "expected_ship_date", "expectedShipDate");
  const priceAdjustmentReason = optionalColumnSelect(db, "operator_order_confirmations", "price_adjustment_reason", "priceAdjustmentReason");
  const productionNote = optionalColumnSelect(db, "operator_order_confirmations", "production_note", "productionNote");
  const row = db
    .prepare(
      `
      SELECT
        id,
        order_id AS orderId,
        customer_id AS customerId,
        confirmed_quote_amount_cents AS confirmedQuoteAmountCents,
        lead_time_min_hours AS leadTimeMinHours,
        lead_time_max_hours AS leadTimeMaxHours,
        estimated_ship_at AS estimatedShipAt,
        ${expectedShipDate},
        ${priceAdjustmentReason},
        ${productionNote},
        operator_id AS operatorId,
        client_request_id AS clientRequestId,
        request_fingerprint AS requestFingerprint,
        order_version_snapshot AS orderVersionSnapshot,
        schema_version AS schemaVersion,
        created_at AS createdAt
      FROM operator_order_confirmations
      WHERE client_request_id = ?`,
    )
    .get(clientRequestId) as Record<string, unknown> | undefined;
  return row ? toConfirmation(row) : null;
}

function getMessageByClientRequestId(db: DatabaseSync, clientRequestId: string) {
  const row = db
    .prepare(
      `
      SELECT
        id,
        order_id AS orderId,
        customer_id AS customerId,
        sender_type AS senderType,
        message_type AS messageType,
        body,
        customer_visible AS customerVisible,
        operator_id AS operatorId,
        client_request_id AS clientRequestId,
        request_fingerprint AS requestFingerprint,
        order_version_snapshot AS orderVersionSnapshot,
        schema_version AS schemaVersion,
        created_at AS createdAt
      FROM order_messages
      WHERE client_request_id = ?`,
    )
    .get(clientRequestId) as Record<string, unknown> | undefined;
  return row ? toOrderMessage(row) : null;
}

function toConfirmation(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    order_id: Number(row.orderId),
    customer_id: Number(row.customerId),
    confirmed_quote_amount_cents: Number(row.confirmedQuoteAmountCents),
    lead_time_min_hours: Number(row.leadTimeMinHours),
    lead_time_max_hours: Number(row.leadTimeMaxHours),
    estimated_ship_at: row.estimatedShipAt ? String(row.estimatedShipAt) : null,
    expected_ship_date: row.expectedShipDate ? String(row.expectedShipDate) : null,
    price_adjustment_reason: row.priceAdjustmentReason ? String(row.priceAdjustmentReason) : null,
    production_note: row.productionNote ? String(row.productionNote) : null,
    operator_id: row.operatorId ? "operator" : null,
    client_request_id: String(row.clientRequestId || ""),
    request_fingerprint: String(row.requestFingerprint || ""),
    order_version_snapshot: String(row.orderVersionSnapshot || ""),
    schema_version: Number(row.schemaVersion),
    created_at: String(row.createdAt || ""),
  };
}

function toOrderMessage(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    order_id: Number(row.orderId),
    customer_id: Number(row.customerId),
    sender_type: String(row.senderType || ""),
    message_type: String(row.messageType || ""),
    body: String(row.body || ""),
    customer_visible: Boolean(row.customerVisible),
    operator_id: row.operatorId ? "operator" : null,
    client_request_id: String(row.clientRequestId || ""),
    request_fingerprint: String(row.requestFingerprint || ""),
    order_version_snapshot: String(row.orderVersionSnapshot || ""),
    schema_version: Number(row.schemaVersion),
    created_at: String(row.createdAt || ""),
  };
}

function getSummaryRow(db: DatabaseSync, sql: string, value: number) {
  const row = db.prepare(sql).get(value) as Record<string, unknown> | undefined;
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([key, item]) => [key, item == null ? null : item]),
  );
}

function getCustomerServiceRequestVersionSummary(db: DatabaseSync, orderId: number) {
  const updatedAtExpr = columnExists(db, "customer_service_requests", "updated_at") ? "MAX(updated_at)" : "NULL";
  return getSummaryRow(
    db,
    `
    SELECT COUNT(*) AS count, MAX(id) AS latest_id, ${updatedAtExpr} AS latest_updated_at
    FROM customer_service_requests
    WHERE order_id = ?`,
    orderId,
  );
}

function columnExists(db: DatabaseSync, table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .some((row) => row.name === column);
}

function optionalColumnSelect(db: DatabaseSync, table: string, column: string, alias: string) {
  return columnExists(db, table, column) ? `${column} AS ${alias}` : `NULL AS ${alias}`;
}

function tableExists(db: DatabaseSync, name: string) {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return Boolean(row);
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sanitizeAuditText(value: string | null | undefined) {
  if (value == null) return null;
  return String(value)
    .replace(/Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(token|secret|api[_-]?v?3?[_-]?key|private[_-]?key)\s*[:=]\s*["']?[^"',\s]+["']?/gi, "$1=[REDACTED]")
    .replace(/\b1[3-9]\d{9}\b/g, "[REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED]")
    .slice(0, 4000);
}
