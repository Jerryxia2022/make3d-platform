import type { DatabaseSync } from "node:sqlite";
import {
  getBeijingTimestamp,
  getBoundWechatAccountByCustomerId,
  getCustomerById,
  getOrderById,
  getOrderByIdForCustomer,
  type CustomerRecord,
  type OrderDetail,
} from "./database.ts";
import { ORDER_STATUSES } from "./orderStatus.ts";
import {
  WECHAT_PAY_CURRENCY,
  WechatPayApiClient,
  buildJsapiBridgeParams,
  createWechatPayBodyHash,
  decryptWechatPayResource,
  getWechatPayConfigDiagnostics,
  loadWechatPayConfig,
  verifyWechatPayHeaders,
  type WechatPayConfig,
  type WechatPayNotificationBody,
  type WechatPayTransaction,
  type WechatPayTradeQuery,
} from "./wechatPay.ts";

const PENDING_STATUS = ORDER_STATUSES[1];
const PAID_STATUS = ORDER_STATUSES[2];
const CANCELLED_STATUS = ORDER_STATUSES[8];
const PAYMENT_TTL_MINUTES = 30;

export type WechatPaymentScenario = "jsapi" | "native";

export type WechatPaymentRecord = {
  id: number;
  paymentNo: string;
  orderId: number;
  customerId: number;
  scenario: WechatPaymentScenario;
  amountCents: number;
  status: string;
  outTradeNo: string;
  providerTransactionId: string | null;
  providerTradeState: string | null;
  prepayId: string | null;
  codeUrl: string | null;
  requestId: string | null;
  expiresAt: string;
  paidAt: string | null;
  refundedAmountCents: number;
};

export type WechatRefundRecord = {
  id: number;
  refundNo: string;
  paymentId: number;
  orderId: number;
  amountCents: number;
  reason: string;
  status: string;
  outRefundNo: string;
  providerRefundId: string | null;
  requestId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdByAdminId: string | null;
  createdAt: string;
  successAt: string | null;
};

export function getWechatPayPublicAvailability(customer?: CustomerRecord | null) {
  const diagnostics = getWechatPayConfigDiagnostics();
  const allowedByTestMode =
    Boolean(customer?.isTestAccount && diagnostics.testCustomerIds.includes(customer.id));

  return {
    enabled: diagnostics.enabled && diagnostics.errors.length === 0,
    testOnly: diagnostics.testOnly,
    allowedByTestMode: diagnostics.testOnly ? allowedByTestMode : true,
    jsapiAuthReady: diagnostics.jsapiAuthReady,
    message:
      diagnostics.errors.length > 0
        ? "wechat_pay_config_invalid"
        : diagnostics.testOnly && !allowedByTestMode
          ? "wechat_pay_test_only"
          : null,
  };
}

export async function createWechatPayment(
  db: DatabaseSync,
  input: {
    orderId: number;
    customerId: number;
    scenario: WechatPaymentScenario;
  },
  client = new WechatPayApiClient(loadWechatPayConfig()),
) {
  const config = loadWechatPayConfig();
  const order = resolvePayableOrder(db, input.orderId, input.customerId, input.scenario, config);
  const amountCents = getPayableAmountCents(order);
  const existing = getReusablePendingPayment(db, order.id, input.scenario, amountCents);

  if (existing) {
    return buildCreatePaymentResponse(config, existing);
  }

  const payment = insertPendingPayment(db, order, input.scenario, amountCents);

  try {
    if (input.scenario === "jsapi") {
      const account = getRequiredJsapiAccount(db, order, config);
      const result = await client.prepayJsapi({
        description: buildPaymentDescription(order),
        outTradeNo: payment.outTradeNo,
        amountCents,
        payerOpenid: account.openid,
        timeExpire: toWechatTimeExpire(payment.expiresAt),
        attach: String(order.id),
      });
      updatePaymentPrepay(db, payment.paymentNo, {
        prepayId: result.data.prepay_id,
        requestId: result.requestId,
        status: "pending",
      });
      return buildCreatePaymentResponse(config, {
        ...payment,
        status: "pending",
        prepayId: result.data.prepay_id,
        requestId: result.requestId,
      });
    }

    const result = await client.prepayNative({
      description: buildPaymentDescription(order),
      outTradeNo: payment.outTradeNo,
      amountCents,
      timeExpire: toWechatTimeExpire(payment.expiresAt),
      attach: String(order.id),
    });
    updatePaymentPrepay(db, payment.paymentNo, {
      codeUrl: result.data.code_url,
      requestId: result.requestId,
      status: "pending",
    });
    return buildCreatePaymentResponse(config, {
      ...payment,
      status: "pending",
      codeUrl: result.data.code_url,
      requestId: result.requestId,
    });
  } catch (error) {
    markPaymentFailed(db, payment.paymentNo, error instanceof Error ? error.message : "wechat prepay failed");
    throw error;
  }
}

export async function refreshWechatPaymentStatus(
  db: DatabaseSync,
  paymentNo: string,
  options: { forceQuery?: boolean } = {},
  client = new WechatPayApiClient(loadWechatPayConfig()),
) {
  const payment = getWechatPaymentByPaymentNo(db, paymentNo);

  if (!payment) {
    throw new Error("payment_not_found");
  }

  if (payment.status === "paid" || payment.status === "refunded" || payment.status === "partially_refunded") {
    return payment;
  }

  if (!options.forceQuery && payment.status !== "pending") {
    return payment;
  }

  const result = await client.queryByOutTradeNo(payment.outTradeNo);
  return applyWechatTradeQuery(db, result.data, result.requestId).payment;
}

export async function closeWechatPayment(
  db: DatabaseSync,
  paymentNo: string,
  client = new WechatPayApiClient(loadWechatPayConfig()),
) {
  const payment = getWechatPaymentByPaymentNo(db, paymentNo);
  if (!payment) {
    throw new Error("payment_not_found");
  }
  if (payment.status === "paid") {
    throw new Error("paid_payment_cannot_be_closed");
  }
  if (payment.status === "closed") {
    return payment;
  }

  const result = await client.closeByOutTradeNo(payment.outTradeNo);
  db.prepare(
    `UPDATE order_payments
     SET status = 'closed',
         provider_trade_state = 'CLOSED',
         request_id = COALESCE(?, request_id),
         closed_at = ?,
         updated_at = ?
     WHERE payment_no = ?`,
  ).run(result.requestId, getBeijingTimestamp(), getBeijingTimestamp(), paymentNo);

  return getWechatPaymentByPaymentNo(db, paymentNo);
}

export async function handleWechatPayNotify(
  db: DatabaseSync,
  rawBody: string,
  headers: Headers | Record<string, string | null | undefined>,
) {
  const config = loadWechatPayConfig();
  const bodyHash = createWechatPayBodyHash(rawBody);
  const signatureValid = verifyWechatPayHeaders(config, headers, rawBody);
  const wechatpaySerial = readHeader(headers, "Wechatpay-Serial");
  const requestId = readHeader(headers, "Request-ID") || readHeader(headers, "Wechatpay-Request-Id");

  if (!signatureValid) {
    recordWechatPaymentEvent(db, {
      eventType: "notify",
      requestId,
      wechatpaySerial,
      bodyHash,
      processingStatus: "signature_failed",
      errorCode: "SIGNATURE_INVALID",
    });
    throw new Error("wechat_pay_notify_signature_invalid");
  }

  const notification = JSON.parse(rawBody) as WechatPayNotificationBody;
  const transaction = decryptWechatPayResource<WechatPayTransaction>(config.apiV3Key, notification.resource);
  const result = confirmWechatPaymentTransaction(db, transaction, {
    requestId,
    wechatpaySerial,
    bodyHash,
    eventType: notification.event_type,
  });

  return result;
}

export async function refundWechatPayment(
  db: DatabaseSync,
  input: {
    paymentNo: string;
    amountCents: number;
    reason: string;
    adminId: string;
  },
  client = new WechatPayApiClient(loadWechatPayConfig()),
) {
  const payment = getWechatPaymentByPaymentNo(db, input.paymentNo);
  const reason = input.reason.trim();

  if (!payment) {
    throw new Error("payment_not_found");
  }
  if (payment.status !== "paid" && payment.status !== "partially_refunded") {
    throw new Error("payment_is_not_refundable");
  }
  if (!reason) {
    throw new Error("refund_reason_required");
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("refund_amount_invalid");
  }
  if (input.amountCents > payment.amountCents - payment.refundedAmountCents) {
    throw new Error("refund_amount_exceeds_available");
  }

  const refundNo = createPaymentNo("M3DR");
  const outRefundNo = refundNo;
  const refundId = insertRefund(db, {
    refundNo,
    paymentId: payment.id,
    orderId: payment.orderId,
    amountCents: input.amountCents,
    reason,
    outRefundNo,
    adminId: input.adminId,
  });

  try {
    const result = await client.createRefund({
      outTradeNo: payment.outTradeNo,
      outRefundNo,
      reason,
      refundAmountCents: input.amountCents,
      totalAmountCents: payment.amountCents,
    });
    const status = normalizeRefundStatus(result.data.status || "PROCESSING");
    updateRefundFromProvider(db, refundId, {
      status,
      providerRefundId: result.data.refund_id || null,
      requestId: result.requestId,
      successAt: status === "success" ? result.data.success_time || getBeijingTimestamp() : null,
    });
    applyRefundToPayment(db, payment.id, input.amountCents, status);
  } catch (error) {
    updateRefundFromProvider(db, refundId, {
      status: "failed",
      failureCode: "REFUND_REQUEST_FAILED",
      failureMessage: error instanceof Error ? error.message : "wechat refund failed",
    });
    throw error;
  }

  return getWechatRefundByRefundNo(db, refundNo);
}

export async function queryWechatRefund(
  db: DatabaseSync,
  refundNo: string,
  client = new WechatPayApiClient(loadWechatPayConfig()),
) {
  const refund = getWechatRefundByRefundNo(db, refundNo);
  if (!refund) {
    throw new Error("refund_not_found");
  }

  const result = await client.queryRefund(refund.outRefundNo);
  const status = normalizeRefundStatus(result.data.status || refund.status);
  updateRefundFromProvider(db, refund.id, {
    status,
    providerRefundId: result.data.refund_id || refund.providerRefundId,
    requestId: result.requestId,
    successAt: status === "success" ? result.data.success_time || refund.successAt || getBeijingTimestamp() : null,
  });

  return getWechatRefundByRefundNo(db, refundNo);
}

export async function reconcileWechatPayments(
  db: DatabaseSync,
  client = new WechatPayApiClient(loadWechatPayConfig()),
) {
  const payments = listReconcilableWechatPayments(db);
  const results: Array<{ paymentNo: string; status: string; error?: string }> = [];

  for (const payment of payments) {
    try {
      const result = await client.queryByOutTradeNo(payment.outTradeNo);
      const applied = applyWechatTradeQuery(db, result.data, result.requestId);
      if (applied.payment.status === "pending" && Date.parse(payment.expiresAt) <= Date.now()) {
        await closeWechatPayment(db, payment.paymentNo, client);
        results.push({ paymentNo: payment.paymentNo, status: "closed" });
      } else {
        results.push({ paymentNo: payment.paymentNo, status: applied.payment.status });
      }
    } catch (error) {
      results.push({
        paymentNo: payment.paymentNo,
        status: "error",
        error: error instanceof Error ? error.message : "wechat reconcile failed",
      });
    }
  }

  return results;
}

export function getWechatPaymentByPaymentNo(
  db: DatabaseSync,
  paymentNo: string,
): WechatPaymentRecord | null {
  const row = db.prepare(wechatPaymentSelectSql("WHERE payment_no = ? LIMIT 1")).get(paymentNo);
  return row ? normalizeWechatPayment(row) : null;
}

export function listWechatPaymentsByOrderId(db: DatabaseSync, orderId: number) {
  return db
    .prepare(wechatPaymentSelectSql("WHERE provider = 'wechat' AND order_id = ? ORDER BY created_at DESC, id DESC"))
    .all(orderId)
    .map(normalizeWechatPayment);
}

export function getWechatRefundByRefundNo(db: DatabaseSync, refundNo: string) {
  const row = db
    .prepare(
      `SELECT
        id,
        refund_no AS refundNo,
        payment_id AS paymentId,
        order_id AS orderId,
        amount_cents AS amountCents,
        reason,
        status,
        out_refund_no AS outRefundNo,
        provider_refund_id AS providerRefundId,
        request_id AS requestId,
        failure_code AS failureCode,
        failure_message AS failureMessage,
        created_by_admin_id AS createdByAdminId,
        created_at AS createdAt,
        success_at AS successAt
       FROM wechat_refunds
       WHERE refund_no = ?
       LIMIT 1`,
    )
    .get(refundNo);

  return row ? (row as WechatRefundRecord) : null;
}

export function listWechatRefundsByPaymentId(db: DatabaseSync, paymentId: number) {
  return db
    .prepare(
      `SELECT
        id,
        refund_no AS refundNo,
        payment_id AS paymentId,
        order_id AS orderId,
        amount_cents AS amountCents,
        reason,
        status,
        out_refund_no AS outRefundNo,
        provider_refund_id AS providerRefundId,
        request_id AS requestId,
        failure_code AS failureCode,
        failure_message AS failureMessage,
        created_by_admin_id AS createdByAdminId,
        created_at AS createdAt,
        success_at AS successAt
       FROM wechat_refunds
       WHERE payment_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(paymentId) as WechatRefundRecord[];
}

function resolvePayableOrder(
  db: DatabaseSync,
  orderId: number,
  customerId: number,
  scenario: WechatPaymentScenario,
  config: WechatPayConfig,
) {
  if (!config.enabled) {
    throw new Error("wechat_pay_disabled");
  }
  if (scenario === "jsapi" && !config.jsapiAuthReady) {
    throw new Error("wechat_pay_jsapi_auth_directory_not_confirmed");
  }

  const order = getOrderByIdForCustomer(db, orderId, customerId);
  const customer = getCustomerById(db, customerId);
  if (!customer) {
    throw new Error("customer_not_found");
  }
  if (!isWechatPayAllowedForCustomer(config, customer)) {
    throw new Error("wechat_pay_test_only");
  }
  if (order.status !== PENDING_STATUS) {
    throw new Error("order_is_not_payable");
  }
  if (getPayableAmountCents(order) <= 0) {
    throw new Error("order_amount_invalid");
  }

  if (scenario === "jsapi") {
    getRequiredJsapiAccount(db, order, config);
  }

  return order;
}

function getRequiredJsapiAccount(db: DatabaseSync, order: OrderDetail, config: WechatPayConfig) {
  const account = getBoundWechatAccountByCustomerId(db, order.customerId);
  if (!account?.openid) {
    throw new Error("wechat_openid_not_bound");
  }
  if (account.appId !== config.appId) {
    throw new Error("wechat_openid_appid_mismatch");
  }
  return { openid: account.openid };
}

function isWechatPayAllowedForCustomer(config: WechatPayConfig, customer: CustomerRecord) {
  if (!config.testOnly) {
    return true;
  }

  return customer.isTestAccount && config.testCustomerIds.includes(customer.id);
}

function getPayableAmountCents(order: OrderDetail) {
  const amount = order.finalPrice ?? order.payablePrice ?? order.estimatedPrice ?? 0;
  return Math.round(amount * 100);
}

function getReusablePendingPayment(
  db: DatabaseSync,
  orderId: number,
  scenario: WechatPaymentScenario,
  amountCents: number,
) {
  const row = db
    .prepare(
      wechatPaymentSelectSql(
        `WHERE provider = 'wechat'
           AND order_id = ?
           AND scenario = ?
           AND amount_cents = ?
           AND status = 'pending'
           AND expires_at > ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      ),
    )
    .get(orderId, scenario, amountCents, getBeijingTimestamp());

  return row ? normalizeWechatPayment(row) : null;
}

function insertPendingPayment(
  db: DatabaseSync,
  order: OrderDetail,
  scenario: WechatPaymentScenario,
  amountCents: number,
) {
  const paymentNo = createPaymentNo("M3DP");
  const outTradeNo = paymentNo;
  const now = getBeijingTimestamp();
  const expiresAt = getBeijingTimestamp(new Date(Date.now() + PAYMENT_TTL_MINUTES * 60 * 1000));
  const idempotencyKey = `${order.id}:${scenario}:${paymentNo}`;
  db.prepare(
    `INSERT INTO order_payments (
      payment_no,
      order_id,
      customer_id,
      payment_method,
      provider,
      method,
      scenario,
      expected_amount_cents,
      paid_amount_cents,
      paid_at,
      status,
      out_trade_no,
      idempotency_key,
      expires_at,
      updated_at,
      created_at
    ) VALUES (?, ?, ?, ?, 'wechat', 'online', ?, ?, 0, ?, 'created', ?, ?, ?, ?, ?)`,
  ).run(
    paymentNo,
    order.id,
    order.customerId,
    `wechat_${scenario}`,
    scenario,
    amountCents,
    now,
    outTradeNo,
    idempotencyKey,
    expiresAt,
    now,
    now,
  );

  const payment = getWechatPaymentByPaymentNo(db, paymentNo);
  if (!payment) {
    throw new Error("payment_create_failed");
  }
  return payment;
}

function updatePaymentPrepay(
  db: DatabaseSync,
  paymentNo: string,
  input: {
    status: string;
    prepayId?: string | null;
    codeUrl?: string | null;
    requestId?: string | null;
  },
) {
  db.prepare(
    `UPDATE order_payments
     SET status = ?,
         prepay_id = COALESCE(?, prepay_id),
         code_url = COALESCE(?, code_url),
         code_url_expires_at = CASE WHEN ? IS NOT NULL THEN expires_at ELSE code_url_expires_at END,
         request_id = COALESCE(?, request_id),
         updated_at = ?
     WHERE payment_no = ?`,
  ).run(
    input.status,
    input.prepayId ?? null,
    input.codeUrl ?? null,
    input.codeUrl ?? null,
    input.requestId ?? null,
    getBeijingTimestamp(),
    paymentNo,
  );
}

function markPaymentFailed(db: DatabaseSync, paymentNo: string, message: string) {
  db.prepare(
    `UPDATE order_payments
     SET status = 'failed',
         failure_code = 'PREPAY_FAILED',
         failure_message = ?,
         updated_at = ?
     WHERE payment_no = ?`,
  ).run(message.slice(0, 500), getBeijingTimestamp(), paymentNo);
}

function applyWechatTradeQuery(db: DatabaseSync, trade: WechatPayTradeQuery, requestId: string | null) {
  if (trade.trade_state === "SUCCESS") {
    return confirmWechatPaymentTransaction(db, trade as WechatPayTransaction, {
      requestId,
      eventType: "query",
    });
  }

  const payment = getPaymentByOutTradeNo(db, trade.out_trade_no || "");
  if (!payment) {
    throw new Error("payment_not_found");
  }

  const status = trade.trade_state === "CLOSED" ? "closed" : trade.trade_state === "NOTPAY" ? "pending" : "abnormal";
  db.prepare(
    `UPDATE order_payments
     SET status = ?,
         provider_trade_state = ?,
         request_id = COALESCE(?, request_id),
         closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, ?) ELSE closed_at END,
         updated_at = ?
     WHERE id = ? AND status != 'paid'`,
  ).run(status, trade.trade_state || null, requestId, status, getBeijingTimestamp(), getBeijingTimestamp(), payment.id);

  return {
    payment: getWechatPaymentByPaymentNo(db, payment.paymentNo) || payment,
    newlyConfirmed: false,
  };
}

function confirmWechatPaymentTransaction(
  db: DatabaseSync,
  trade: WechatPayTransaction,
  meta: {
    requestId?: string | null;
    wechatpaySerial?: string | null;
    bodyHash?: string | null;
    eventType: string;
  },
) {
  const config = loadWechatPayConfig();
  const payment = getPaymentByOutTradeNo(db, trade.out_trade_no);
  if (!payment) {
    recordWechatPaymentEvent(db, {
      eventType: meta.eventType,
      requestId: meta.requestId,
      wechatpaySerial: meta.wechatpaySerial,
      bodyHash: meta.bodyHash,
      processingStatus: "failed",
      errorCode: "PAYMENT_NOT_FOUND",
    });
    throw new Error("payment_not_found");
  }

  const total = trade.amount?.total;
  const currency = trade.amount?.currency || WECHAT_PAY_CURRENCY;
  const mismatch =
    trade.mchid !== config.mchId ||
    trade.appid !== config.appId ||
    trade.out_trade_no !== payment.outTradeNo ||
    total !== payment.amountCents ||
    currency !== WECHAT_PAY_CURRENCY ||
    trade.trade_state !== "SUCCESS";

  if (mismatch) {
    db.prepare(
      `UPDATE order_payments
       SET status = 'abnormal',
           provider_trade_state = ?,
           failure_code = 'PAYMENT_MISMATCH',
           failure_message = 'wechat payment fields did not match local payment',
           updated_at = ?
       WHERE id = ? AND status != 'paid'`,
    ).run(trade.trade_state || null, getBeijingTimestamp(), payment.id);
    recordWechatPaymentEvent(db, {
      paymentId: payment.id,
      orderId: payment.orderId,
      eventType: meta.eventType,
      requestId: meta.requestId,
      wechatpaySerial: meta.wechatpaySerial,
      bodyHash: meta.bodyHash,
      processingStatus: "failed",
      errorCode: "PAYMENT_MISMATCH",
    });
    throw new Error("payment_mismatch");
  }

  if (payment.status === "paid") {
    recordWechatPaymentEvent(db, {
      paymentId: payment.id,
      orderId: payment.orderId,
      eventType: meta.eventType,
      requestId: meta.requestId,
      wechatpaySerial: meta.wechatpaySerial,
      bodyHash: meta.bodyHash,
      processingStatus: "duplicate",
    });
    return { payment, newlyConfirmed: false };
  }

  const now = getBeijingTimestamp();
  let newlyConfirmed = false;

  try {
    db.exec("BEGIN IMMEDIATE");
    const lockedPayment = getWechatPaymentByPaymentNo(db, payment.paymentNo);
    if (!lockedPayment || lockedPayment.status === "paid") {
      db.exec("COMMIT");
      return { payment: lockedPayment || payment, newlyConfirmed: false };
    }

    const order = getOrderById(db, payment.orderId);
    const nextOrderStatus =
      order.status === PENDING_STATUS || order.status === CANCELLED_STATUS ? PAID_STATUS : order.status;
    db.prepare(
      `UPDATE order_payments
       SET status = 'paid',
           paid_amount_cents = ?,
           paid_at = ?,
           provider_transaction_id = ?,
           platform_trade_no = ?,
           provider_trade_state = ?,
           provider_payer_binding_id = ?,
           request_id = COALESCE(?, request_id),
           updated_at = ?
       WHERE id = ? AND status != 'paid'`,
    ).run(
      payment.amountCents,
      trade.success_time || now,
      trade.transaction_id || null,
      trade.transaction_id || null,
      trade.trade_state,
      trade.payer?.openid || null,
      meta.requestId || null,
      now,
      payment.id,
    );

    db.prepare(
      `UPDATE orders
       SET status = ?,
           payment_status = 'paid',
           payment_method = 'wechat',
           paid_at = COALESCE(paid_at, ?),
           payment_confirmed_at = COALESCE(payment_confirmed_at, ?),
           payment_confirmed_by = COALESCE(payment_confirmed_by, 'wechat_pay'),
           updated_at = ?
       WHERE id = ?
         AND payment_status != 'paid'`,
    ).run(nextOrderStatus, trade.success_time || now, now, now, payment.orderId);

    const orderAfter = getOrderById(db, payment.orderId);
    if (order.status !== orderAfter.status) {
      db.prepare(
        `INSERT INTO order_status_logs (
          order_id,
          from_status,
          to_status,
          operator,
          note,
          created_at
        ) VALUES (?, ?, ?, 'wechat_pay', 'wechat pay api v3 confirmed', ?)`,
      ).run(payment.orderId, order.status, orderAfter.status, now);
    }

    recordWechatPaymentEvent(db, {
      paymentId: payment.id,
      orderId: payment.orderId,
      eventType: meta.eventType,
      requestId: meta.requestId,
      wechatpaySerial: meta.wechatpaySerial,
      bodyHash: meta.bodyHash,
      processingStatus: "success",
    });
    newlyConfirmed = order.paymentStatus !== "paid";
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    payment: getWechatPaymentByPaymentNo(db, payment.paymentNo) || payment,
    newlyConfirmed,
  };
}

function recordWechatPaymentEvent(
  db: DatabaseSync,
  input: {
    paymentId?: number | null;
    orderId?: number | null;
    eventType: string;
    requestId?: string | null;
    wechatpaySerial?: string | null;
    bodyHash?: string | null;
    processingStatus: string;
    errorCode?: string | null;
  },
) {
  db.prepare(
    `INSERT INTO wechat_payment_events (
      payment_id,
      order_id,
      event_type,
      request_id,
      wechatpay_serial,
      body_hash,
      processing_status,
      error_code,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.paymentId ?? null,
    input.orderId ?? null,
    input.eventType,
    input.requestId ?? null,
    input.wechatpaySerial ?? null,
    input.bodyHash ?? null,
    input.processingStatus,
    input.errorCode ?? null,
    getBeijingTimestamp(),
  );
}

function getPaymentByOutTradeNo(db: DatabaseSync, outTradeNo: string) {
  if (!outTradeNo) {
    return null;
  }
  const row = db.prepare(wechatPaymentSelectSql("WHERE out_trade_no = ? LIMIT 1")).get(outTradeNo);
  return row ? normalizeWechatPayment(row) : null;
}

function listReconcilableWechatPayments(db: DatabaseSync) {
  return db
    .prepare(
      wechatPaymentSelectSql(
        `WHERE provider = 'wechat'
           AND status IN ('created', 'pending', 'abnormal')
           AND created_at >= datetime('now', '-2 days')
         ORDER BY created_at ASC
         LIMIT 50`,
      ),
    )
    .all()
    .map(normalizeWechatPayment);
}

function insertRefund(
  db: DatabaseSync,
  input: {
    refundNo: string;
    paymentId: number;
    orderId: number;
    amountCents: number;
    reason: string;
    outRefundNo: string;
    adminId: string;
  },
) {
  const result = db
    .prepare(
      `INSERT INTO wechat_refunds (
        refund_no,
        payment_id,
        order_id,
        amount_cents,
        reason,
        status,
        out_refund_no,
        created_by_admin_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?)`,
    )
    .run(
      input.refundNo,
      input.paymentId,
      input.orderId,
      input.amountCents,
      input.reason,
      input.outRefundNo,
      input.adminId,
      getBeijingTimestamp(),
    );

  return Number(result.lastInsertRowid);
}

function updateRefundFromProvider(
  db: DatabaseSync,
  refundId: number,
  input: {
    status: string;
    providerRefundId?: string | null;
    requestId?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    successAt?: string | null;
  },
) {
  db.prepare(
    `UPDATE wechat_refunds
     SET status = ?,
         provider_refund_id = COALESCE(?, provider_refund_id),
         request_id = COALESCE(?, request_id),
         failure_code = COALESCE(?, failure_code),
         failure_message = COALESCE(?, failure_message),
         success_at = COALESCE(?, success_at),
         updated_at = ?
     WHERE id = ?`,
  ).run(
    input.status,
    input.providerRefundId ?? null,
    input.requestId ?? null,
    input.failureCode ?? null,
    input.failureMessage ?? null,
    input.successAt ?? null,
    getBeijingTimestamp(),
    refundId,
  );
}

function applyRefundToPayment(db: DatabaseSync, paymentId: number, amountCents: number, status: string) {
  if (status !== "success" && status !== "processing") {
    return;
  }

  const payment = db
    .prepare("SELECT expected_amount_cents AS amountCents, refunded_amount_cents AS refundedAmountCents FROM order_payments WHERE id = ?")
    .get(paymentId) as { amountCents: number; refundedAmountCents: number } | undefined;
  if (!payment) {
    return;
  }

  const nextRefunded = Math.min(payment.amountCents, (payment.refundedAmountCents || 0) + amountCents);
  const nextStatus =
    status === "processing" ? "refunding" : nextRefunded >= payment.amountCents ? "refunded" : "partially_refunded";
  db.prepare(
    `UPDATE order_payments
     SET status = ?,
         refunded_amount_cents = ?,
         refund_status = ?,
         refund_amount_cents = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(nextStatus, nextRefunded, nextStatus, nextRefunded, getBeijingTimestamp(), paymentId);
}

function buildCreatePaymentResponse(config: WechatPayConfig, payment: WechatPaymentRecord) {
  return {
    payment,
    jsapiParams:
      payment.scenario === "jsapi" && payment.prepayId
        ? buildJsapiBridgeParams(config, payment.prepayId)
        : null,
  };
}

function buildPaymentDescription(order: OrderDetail) {
  return `Make3D order ${order.orderNo}`.slice(0, 127);
}

function createPaymentNo(prefix: string) {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
    String(now.getUTCMilliseconds()).padStart(3, "0"),
  ].join("");
  return `${prefix}${stamp}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
}

function toWechatTimeExpire(value: string) {
  return new Date(value).toISOString();
}

function normalizeRefundStatus(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "SUCCESS") {
    return "success";
  }
  if (normalized === "PROCESSING" || normalized === "ABNORMAL") {
    return "processing";
  }
  if (normalized === "CLOSED") {
    return "closed";
  }
  return "failed";
}

function wechatPaymentSelectSql(suffix: string) {
  return `SELECT
    id,
    payment_no AS paymentNo,
    order_id AS orderId,
    customer_id AS customerId,
    scenario,
    expected_amount_cents AS amountCents,
    COALESCE(status, 'manual') AS status,
    out_trade_no AS outTradeNo,
    provider_transaction_id AS providerTransactionId,
    provider_trade_state AS providerTradeState,
    prepay_id AS prepayId,
    code_url AS codeUrl,
    request_id AS requestId,
    expires_at AS expiresAt,
    paid_at AS paidAt,
    refunded_amount_cents AS refundedAmountCents
  FROM order_payments
  ${suffix}`;
}

function normalizeWechatPayment(row: unknown) {
  const record = row as Partial<WechatPaymentRecord> & {
    paymentNo?: string | null;
    outTradeNo?: string | null;
    scenario?: string | null;
    customerId?: number | null;
    refundedAmountCents?: number | null;
  };
  if (!record.paymentNo || !record.outTradeNo || !record.scenario || !record.customerId) {
    throw new Error("invalid_wechat_payment_record");
  }
  return {
    ...record,
    paymentNo: record.paymentNo,
    outTradeNo: record.outTradeNo,
    scenario: record.scenario as WechatPaymentScenario,
    customerId: record.customerId,
    refundedAmountCents: record.refundedAmountCents || 0,
  } as WechatPaymentRecord;
}

function readHeader(headers: Headers | Record<string, string | null | undefined>, name: string) {
  if (headers instanceof Headers) {
    return headers.get(name) || headers.get(name.toLowerCase()) || null;
  }
  return headers[name] || headers[name.toLowerCase()] || null;
}
