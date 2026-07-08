import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildJsapiBridgeParams,
  buildWechatPayAuthorization,
  createWechatPaySignature,
  decryptWechatPayResource,
  encryptWechatPayResourceForTest,
  extractWechatPayPublicKeyId,
  isValidApiV3Key,
  verifyWechatPayHeaders,
  verifyWechatPaySignature,
  WechatPayApiClient,
} from "../src/backend/wechatPay.ts";
import {
  bindWechatAccountByCode,
  confirmOrderFinalQuote,
  createWechatBindCode,
  createCustomerAccount,
  createOrderWithFile,
  initDatabase,
  listWechatNotificationsByOrderId,
  markCustomerTestAccount,
} from "../src/backend/database.ts";
import {
  getWechatPayPublicAvailability,
  queryWechatRefund,
  refundWechatPayment,
} from "../src/backend/wechatPayService.ts";

test("wechat pay APIv3 signs authorization and verifies platform style headers", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = JSON.stringify({ hello: "make3d" });
  const auth = buildWechatPayAuthorization(
    {
      mchId: "1114987934",
      merchantCertSerial: "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
      privateKeyPem,
    },
    "POST",
    "/v3/pay/transactions/native",
    body,
    "1718000000",
    "nonce-for-test",
  );

  assert.match(auth.authorization, /^WECHATPAY2-SHA256-RSA2048 /);
  assert.match(auth.authorization, /mchid="1114987934"/);
  assert.match(auth.authorization, /^WECHATPAY2-SHA256-RSA2048 mchid="1114987934",nonce_str="nonce-for-test",signature="[^"]+",timestamp="1718000000",serial_no="ABCDEF1234567890ABCDEF1234567890ABCDEF12"$/);
  assert.equal(
    verifyWechatPaySignature(
      publicKeyPem,
      "POST\n/v3/pay/transactions/native\n1718000000\nnonce-for-test\n" + body + "\n",
      auth.signature,
    ),
    true,
  );

  const timestamp = "1718000001";
  const nonce = "response-nonce";
  const platformSignature = createWechatPaySignature(privateKeyPem, `${timestamp}\n${nonce}\n${body}\n`);
  assert.equal(
    verifyWechatPayHeaders(
      { publicKeyPem, publicKeyId: "PUB_KEY_ID_1234567890" },
      {
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": nonce,
        "Wechatpay-Signature": platformSignature,
        "Wechatpay-Serial": "PUB_KEY_ID_1234567890",
      },
      body,
    ),
    true,
  );
  assert.equal(
    verifyWechatPayHeaders(
      { publicKeyPem, publicKeyId: "PUB_KEY_ID_1234567890" },
      {
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": nonce,
        "Wechatpay-Signature": platformSignature,
        "Wechatpay-Serial": "PUB_KEY_ID_999",
      },
      body,
    ),
    false,
  );
});

test("wechat pay decrypts APIv3 notification resources and validates public key id/API key format", () => {
  const apiV3Key = "Aa1234567890Bb1234567890Cc123456";
  const plaintext = JSON.stringify({
    mchid: "1114987934",
    appid: "wx8b173c450927acac",
    out_trade_no: "M3DP202607070001",
    trade_state: "SUCCESS",
    amount: { total: 100, currency: "CNY" },
  });
  const resource = encryptWechatPayResourceForTest(apiV3Key, plaintext);

  assert.equal(isValidApiV3Key(apiV3Key), true);
  assert.equal(isValidApiV3Key("short"), false);
  assert.equal(extractWechatPayPublicKeyId("id: PUB_KEY_ID_1234567890123456789"), "PUB_KEY_ID_1234567890123456789");
  assert.deepEqual(decryptWechatPayResource(apiV3Key, resource), JSON.parse(plaintext));
});

test("wechat pay JSAPI params are RSA signed with prepay_id package", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const params = buildJsapiBridgeParams(
    { appId: "wx8b173c450927acac", privateKeyPem },
    "wx201410272009395522657a690389285100",
    1_718_000_000_000,
  );

  assert.equal(params.appId, "wx8b173c450927acac");
  assert.equal(params.package, "prepay_id=wx201410272009395522657a690389285100");
  assert.equal(params.signType, "RSA");
  assert.equal(
    verifyWechatPaySignature(
      publicKeyPem,
      `${params.appId}\n${params.timeStamp}\n${params.nonceStr}\n${params.package}\n`,
      params.paySign,
    ),
    true,
  );
});

test("wechat pay client requests identity response encoding for signature verification", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  let observedHeaders;
  const client = new WechatPayApiClient(
    {
      enabled: true,
      testOnly: true,
      jsapiAuthReady: true,
      mchId: "1114987934",
      appId: "wx8b173c450927acac",
      merchantCertSerial: "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
      publicKeyId: "PUB_KEY_ID_1234567890",
      notifyUrl: "https://www.make3d.com.cn/api/payments/wechat/notify",
      privateKeyPem,
      merchantCertPem: "",
      publicKeyPem,
      apiV3Key: "Aa1234567890Bb1234567890Cc123456",
      testCustomerIds: [5],
    },
    {
      fetchImpl: async (_url, init) => {
        observedHeaders = init.headers;
        return new Response("", { status: 200 });
      },
    },
  );

  await client.closeByOutTradeNo("M3DPTEST");

  assert.equal(observedHeaders["Accept-Encoding"], "identity");
});

test("wechat pay TEST_ONLY availability requires explicit test account whitelist", () => {
  const previous = {
    WECHAT_PAY_ENABLED: process.env.WECHAT_PAY_ENABLED,
    WECHAT_PAY_TEST_ONLY: process.env.WECHAT_PAY_TEST_ONLY,
    WECHAT_PAY_TEST_CUSTOMER_IDS: process.env.WECHAT_PAY_TEST_CUSTOMER_IDS,
  };
  const db = initDatabase(":memory:");

  try {
    process.env.WECHAT_PAY_ENABLED = "true";
    process.env.WECHAT_PAY_TEST_ONLY = "true";
    const customer = createCustomerAccount(db, {
      phone: "13800000000",
      password: "password123",
      name: "TEST customer",
      wechat: "test-customer",
      email: "test@example.com",
    });
    createPayableOrder(db, customer.id);

    process.env.WECHAT_PAY_TEST_CUSTOMER_IDS = "";
    assert.equal(getWechatPayPublicAvailability({ ...customer, isTestAccount: true }).allowedByTestMode, false);

    markCustomerTestAccount(db, customer.id, true);
    process.env.WECHAT_PAY_TEST_CUSTOMER_IDS = String(customer.id);
    assert.equal(getWechatPayPublicAvailability({ ...customer, isTestAccount: true }).allowedByTestMode, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    db.close();
  }
});

test("wechat refund success creates a service account notification", async () => {
  const previous = snapshotPayAndMpEnv();
  const db = initDatabase(":memory:");

  try {
    process.env.APP_URL = "https://www.make3d.com.cn";
    process.env.WECHAT_MP_ENABLED = "true";
    process.env.WECHAT_PAY_TEST_ONLY = "true";
    const { customer, order, paymentNo } = createRefundableWechatPayment(db, { amountCents: 1 });
    process.env.WECHAT_PAY_TEST_CUSTOMER_IDS = String(customer.id);
    const sent = [];

    const refund = await refundWechatPayment(
      db,
      {
        paymentNo,
        amountCents: 1,
        reason: "TEST full refund",
        adminId: "admin",
      },
      createRefundApiClient("SUCCESS"),
      {
        sendText: async (openid, content) => {
          sent.push({ openid, content });
          return { msgid: "refund-message-1" };
        },
      },
    );
    const notifications = listWechatNotificationsByOrderId(db, order.id);

    assert.equal(refund.status, "success");
    assert.equal(sent.length, 1);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, "wechat_refund_success");
    assert.equal(notifications[0].sendStatus, "sent");
    assert.equal(notifications[0].idempotencyKey, `${customer.id}:${order.id}:${refund.refundNo}:wechat_refund_success`);
    assert.match(sent[0].content, new RegExp(order.orderNo));
    assert.match(sent[0].content, /0\.01 元/);
    assert.match(sent[0].content, /退款成功/);
    assert.match(sent[0].content, new RegExp(`/account/orders/${order.id}`));
  } finally {
    restoreEnv(previous);
    db.close();
  }
});

test("wechat refund success notification is idempotent on repeated refund queries", async () => {
  const previous = snapshotPayAndMpEnv();
  const db = initDatabase(":memory:");

  try {
    process.env.APP_URL = "https://www.make3d.com.cn";
    process.env.WECHAT_MP_ENABLED = "true";
    process.env.WECHAT_PAY_TEST_ONLY = "true";
    const { customer, order, paymentNo } = createRefundableWechatPayment(db, { amountCents: 2 });
    process.env.WECHAT_PAY_TEST_CUSTOMER_IDS = String(customer.id);
    const sent = [];

    const refund = await refundWechatPayment(
      db,
      {
        paymentNo,
        amountCents: 1,
        reason: "TEST partial refund",
        adminId: "admin",
      },
      createRefundApiClient("PROCESSING"),
      {
        sendText: async (openid, content) => sent.push({ openid, content }),
      },
    );

    assert.equal(refund.status, "processing");
    assert.equal(sent.length, 0);
    assert.equal(listWechatNotificationsByOrderId(db, order.id).length, 0);

    await queryWechatRefund(
      db,
      refund.refundNo,
      createRefundApiClient("SUCCESS"),
      {
        sendText: async (openid, content) => {
          sent.push({ openid, content });
          return { msgid: "refund-query-message" };
        },
      },
    );
    await queryWechatRefund(
      db,
      refund.refundNo,
      createRefundApiClient("SUCCESS"),
      {
        sendText: async (openid, content) => sent.push({ openid, content }),
      },
    );
    const notifications = listWechatNotificationsByOrderId(db, order.id);
    const payment = db.prepare("SELECT status, refunded_amount_cents AS refundedAmountCents FROM order_payments WHERE payment_no = ?").get(paymentNo);

    assert.equal(sent.length, 1);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, "wechat_refund_success");
    assert.equal(notifications[0].idempotencyKey, `${customer.id}:${order.id}:${refund.refundNo}:wechat_refund_success`);
    assert.equal(payment.status, "partially_refunded");
    assert.equal(payment.refundedAmountCents, 1);
  } finally {
    restoreEnv(previous);
    db.close();
  }
});

test("wechat refund notification failure does not roll back refund state", async () => {
  const previous = snapshotPayAndMpEnv();
  const db = initDatabase(":memory:");

  try {
    process.env.APP_URL = "https://www.make3d.com.cn";
    process.env.WECHAT_MP_ENABLED = "true";
    process.env.WECHAT_PAY_TEST_ONLY = "true";
    const { customer, order, paymentNo } = createRefundableWechatPayment(db, { amountCents: 1 });
    process.env.WECHAT_PAY_TEST_CUSTOMER_IDS = String(customer.id);

    const refund = await refundWechatPayment(
      db,
      {
        paymentNo,
        amountCents: 1,
        reason: "TEST full refund with failed notification",
        adminId: "admin",
      },
      createRefundApiClient("SUCCESS"),
      {
        sendText: async () => {
          throw new Error("errcode=45015 response out of time limit");
        },
      },
    );
    const payment = db.prepare("SELECT status, refunded_amount_cents AS refundedAmountCents FROM order_payments WHERE payment_no = ?").get(paymentNo);
    const notifications = listWechatNotificationsByOrderId(db, order.id);

    assert.equal(refund.status, "success");
    assert.equal(payment.status, "refunded");
    assert.equal(payment.refundedAmountCents, 1);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].sendStatus, "failed");
    assert.match(notifications[0].errorMessage, /45015/);
  } finally {
    restoreEnv(previous);
    db.close();
  }
});

test("wechat refund success notification supports full and partial refunds", async () => {
  const previous = snapshotPayAndMpEnv();
  const db = initDatabase(":memory:");

  try {
    process.env.APP_URL = "https://www.make3d.com.cn";
    process.env.WECHAT_MP_ENABLED = "true";
    process.env.WECHAT_PAY_TEST_ONLY = "true";
    const full = createRefundableWechatPayment(db, { amountCents: 1, openid: "openid-full-refund" });
    const partial = createRefundableWechatPayment(db, { amountCents: 2, phone: "13900000001", openid: "openid-partial-refund" });
    process.env.WECHAT_PAY_TEST_CUSTOMER_IDS = `${full.customer.id},${partial.customer.id}`;
    const sent = [];

    await refundWechatPayment(
      db,
      { paymentNo: full.paymentNo, amountCents: 1, reason: "TEST full refund", adminId: "admin" },
      createRefundApiClient("SUCCESS"),
      { sendText: async (openid, content) => sent.push({ openid, content }) },
    );
    await refundWechatPayment(
      db,
      { paymentNo: partial.paymentNo, amountCents: 1, reason: "TEST partial refund", adminId: "admin" },
      createRefundApiClient("SUCCESS"),
      { sendText: async (openid, content) => sent.push({ openid, content }) },
    );

    assert.equal(sent.length, 2);
    assert.equal(listWechatNotificationsByOrderId(db, full.order.id)[0].type, "wechat_refund_success");
    assert.equal(listWechatNotificationsByOrderId(db, partial.order.id)[0].type, "wechat_refund_success");
    assert.equal(db.prepare("SELECT status FROM order_payments WHERE payment_no = ?").get(full.paymentNo).status, "refunded");
    assert.equal(db.prepare("SELECT status FROM order_payments WHERE payment_no = ?").get(partial.paymentNo).status, "partially_refunded");
  } finally {
    restoreEnv(previous);
    db.close();
  }
});

test("wechat TEST_ONLY mode suppresses refund notifications and payment entry for non test customers", async () => {
  const previous = snapshotPayAndMpEnv();
  const db = initDatabase(":memory:");

  try {
    process.env.APP_URL = "https://www.make3d.com.cn";
    process.env.WECHAT_MP_ENABLED = "true";
    process.env.WECHAT_PAY_TEST_ONLY = "true";
    process.env.WECHAT_PAY_TEST_CUSTOMER_IDS = "9999";
    const { customer, order, paymentNo } = createRefundableWechatPayment(db, {
      amountCents: 1,
      markAsTest: false,
    });
    const sent = [];

    assert.equal(getWechatPayPublicAvailability({ ...customer, isTestAccount: false }).allowedByTestMode, false);

    const refund = await refundWechatPayment(
      db,
      {
        paymentNo,
        amountCents: 1,
        reason: "TEST non test customer refund",
        adminId: "admin",
      },
      createRefundApiClient("SUCCESS"),
      {
        sendText: async (openid, content) => sent.push({ openid, content }),
      },
    );

    assert.equal(refund.status, "success");
    assert.equal(sent.length, 0);
    assert.equal(listWechatNotificationsByOrderId(db, order.id).length, 0);
  } finally {
    restoreEnv(previous);
    db.close();
  }
});

function createPayableOrder(db, customerId) {
  const order = createOrderWithFile(db, {
    customerId,
    customerName: "TEST customer",
    phone: "13800000000",
    wechat: "test-customer",
    material: "PLA",
    color: "white",
    quantity: 1,
    estimatedPrice: 30,
    file: {
      filename: "wechat-pay.stl",
      filepath: "/uploads/wechat-pay.stl",
      filesize: 128,
    },
  });

  confirmOrderFinalQuote(db, order.id, { finalPrice: 88, operator: "admin" });
  return order;
}

let paymentCounter = 0;

function createRefundableWechatPayment(
  db,
  {
    amountCents,
    phone = "13800000000",
    openid = `openid-refund-${paymentCounter + 1}`,
    markAsTest = true,
  },
) {
  const customer = createCustomerAccount(db, {
    phone,
    password: "password123",
    name: "TEST refund customer",
    wechat: "test-refund",
    email: `${phone}@example.com`,
  });
  if (markAsTest) {
    markCustomerTestAccount(db, customer.id, true);
    customer.isTestAccount = true;
  }
  const { bindCode } = createWechatBindCode(db, customer.id);
  bindWechatAccountByCode(db, { bindCode, openid });
  const order = createPayableOrder(db, customer.id);
  const paymentNo = `M3DPTESTREFUND${String(++paymentCounter).padStart(4, "0")}`;
  const now = "2026-07-08T10:00:00+08:00";

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
      provider_trade_state,
      expires_at,
      updated_at,
      created_at
    ) VALUES (?, ?, ?, 'wechat_native', 'wechat', 'online', 'native', ?, ?, ?, 'paid', ?, 'SUCCESS', ?, ?, ?)`,
  ).run(
    paymentNo,
    order.id,
    customer.id,
    amountCents,
    amountCents,
    now,
    paymentNo,
    now,
    now,
    now,
  );

  return { customer, order, paymentNo };
}

function createRefundApiClient(status) {
  return {
    createRefund: async (input) => ({
      requestId: `refund-request-${input.outRefundNo}`,
      data: {
        refund_id: `refund-id-${input.outRefundNo}`,
        out_refund_no: input.outRefundNo,
        status,
        success_time: status === "SUCCESS" ? "2026-07-08T10:01:00+08:00" : undefined,
      },
    }),
    queryRefund: async (outRefundNo) => ({
      requestId: `refund-query-${outRefundNo}`,
      data: {
        refund_id: `refund-id-${outRefundNo}`,
        out_refund_no: outRefundNo,
        status,
        success_time: status === "SUCCESS" ? "2026-07-08T10:02:00+08:00" : undefined,
      },
    }),
  };
}

function snapshotPayAndMpEnv() {
  return {
    APP_URL: process.env.APP_URL,
    WECHAT_MP_ENABLED: process.env.WECHAT_MP_ENABLED,
    WECHAT_MP_APP_ID: process.env.WECHAT_MP_APP_ID,
    WECHAT_MP_APP_SECRET: process.env.WECHAT_MP_APP_SECRET,
    WECHAT_PAY_TEST_ONLY: process.env.WECHAT_PAY_TEST_ONLY,
    WECHAT_PAY_TEST_CUSTOMER_IDS: process.env.WECHAT_PAY_TEST_CUSTOMER_IDS,
  };
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
