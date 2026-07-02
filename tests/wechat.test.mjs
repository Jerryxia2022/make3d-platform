import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bindWechatAccountByCode,
  confirmOrderFinalQuote,
  confirmOrderPayment,
  createCustomerAccount,
  createOrderWithFile,
  createWechatBindCode,
  getOrderById,
  getWechatAccountByCustomerId,
  initDatabase,
  listWechatNotificationsByOrderId,
  searchCustomerServiceRequests,
  updateOrderStatus,
} from "../src/backend/database.ts";
import { updateOrderStatusAndNotify } from "../src/backend/orderWorkflow.ts";
import {
  buildWechatOrderStatusContent,
  handleWechatMessage,
  notifyWechatOrderStatus,
  WECHAT_MENU_CLICK_KEYS,
  WECHAT_MENU_CLICK_REPLIES,
  verifyWechatServerRequest,
  verifyWechatSignature,
} from "../src/backend/wechat.ts";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("wechat callback GET verification uses sha1 signature and returns echostr", async () => {
  const token = "make3d-token";
  const timestamp = "1718000000";
  const nonce = "nonce-value";
  const echostr = "test_echo";
  const signature = signWechat(token, timestamp, nonce);
  const routeSource = await readSource("src/app/api/wechat/callback/route.ts");
  const result = verifyWechatServerRequest(
    `https://make3d.com.cn/api/wechat/callback?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${echostr}`,
    token,
  );

  assert.equal(verifyWechatSignature(token, timestamp, nonce, signature), true);
  assert.equal(verifyWechatSignature(token, timestamp, nonce, "bad"), false);
  assert.equal(result.status, 200);
  assert.equal(result.body, echostr);
  assert.equal(result.contentType, "text/plain; charset=utf-8");
  assert.equal(result.diagnostics.signatureVerified, true);
  assert.match(routeSource, /verifyWechatServerRequest/);
  assert.match(routeSource, /console\.info/);
  assert.match(routeSource, /result\.body/);
  assert.match(routeSource, /result\.status/);
  assert.match(routeSource, /verifyWechatSignature/);
});

test("wechat callback GET verification rejects token mismatch", () => {
  const timestamp = "1718000000";
  const nonce = "nonce-value";
  const signature = signWechat("correct-token", timestamp, nonce);
  const result = verifyWechatServerRequest(
    `https://make3d.com.cn/api/wechat/callback?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=test_echo`,
    "wrong-token",
  );

  assert.equal(result.status, 403);
  assert.equal(result.body, "invalid signature");
  assert.equal(result.diagnostics.signatureVerified, false);
});

test("wechat callback GET verification rejects missing echostr", () => {
  const token = "make3d-token";
  const timestamp = "1718000000";
  const nonce = "nonce-value";
  const signature = signWechat(token, timestamp, nonce);
  const result = verifyWechatServerRequest(
    `https://make3d.com.cn/api/wechat/callback?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`,
    token,
  );

  assert.equal(result.status, 400);
  assert.equal(result.body, "missing echostr");
  assert.equal(result.diagnostics.hasEchostr, false);
});

test("wechat subscribe event replies with onboarding guidance", async () => {
  const db = initDatabase(":memory:");

  const reply = await handleWechatMessage(
    db,
    createWechatXml({
      MsgType: "event",
      Event: "subscribe",
      FromUserName: "openid-subscribe",
    }),
  );

  assert.match(reply, /欢迎关注瑞淞Make3D快速制造/);
  assert.match(reply, /在线报价｜我的订单｜地址管理｜联系客服/);
  assert.match(reply, /STEP\/STP、多实体、超尺寸或需要拆分/);
  assert.equal(db.prepare("SELECT subscribed FROM wechat_accounts WHERE openid = ?").get("openid-subscribe").subscribed, 1);

  db.close();
});

test("generates 30 minute wechat bind codes for logged-in customers", () => {
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, createCustomerFixture());
  const now = 1_718_000_000_000;

  const bindCode = createWechatBindCode(db, customer.id, now);
  const account = getWechatAccountByCustomerId(db, customer.id);

  assert.match(bindCode.bindCode, /^M3D-\d{6}$/);
  assert.equal(bindCode.expiresAt, now + 30 * 60 * 1000);
  assert.equal(account?.bindCode, bindCode.bindCode);
  assert.equal(account?.bindCodeExpiresAt, bindCode.expiresAt);

  db.close();
});

test("text bind code binds openid to customer account", async () => {
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, createCustomerFixture());
  const { bindCode } = createWechatBindCode(db, customer.id);

  const reply = await handleWechatMessage(
    db,
    createWechatXml({
      MsgType: "text",
      Content: bindCode,
      FromUserName: "openid-bound",
    }),
  );
  const account = getWechatAccountByCustomerId(db, customer.id);

  assert.match(reply, /绑定成功/);
  assert.equal(account?.openid, "openid-bound");
  assert.equal(account?.subscribed, true);
  assert.equal(account?.bindCode, null);

  db.close();
});

test("wrong or expired bind codes receive invalid message", async () => {
  const db = initDatabase(":memory:");

  const reply = await handleWechatMessage(
    db,
    createWechatXml({
      MsgType: "text",
      Content: "M3D-000000",
      FromUserName: "openid-wrong-code",
    }),
  );

  assert.match(reply, /绑定码无效或已过期/);

  db.close();
});

test("wechat keyword quote replies with quote link", async () => {
  const previousAppUrl = process.env.APP_URL;
  const db = initDatabase(":memory:");

  try {
    process.env.APP_URL = "https://make3d.com.cn";
    const reply = await handleWechatMessage(
      db,
      createWechatXml({
        MsgType: "text",
        Content: "我要报价",
        FromUserName: "openid-quote",
      }),
    );

    assert.match(reply, /https:\/\/make3d\.com\.cn\/quote/);
  } finally {
    restoreEnv({ APP_URL: previousAppUrl });
    db.close();
  }
});

test("wechat basic keywords reply with safe operation guidance", async () => {
  const previousAppUrl = process.env.APP_URL;
  const db = initDatabase(":memory:");

  try {
    process.env.APP_URL = "https://make3d.com.cn";
    const quoteReply = await handleWechatMessage(
      db,
      createWechatXml({ MsgType: "text", Content: "报价", FromUserName: "openid-keyword-quote" }),
    );
    const orderReply = await handleWechatMessage(
      db,
      createWechatXml({ MsgType: "text", Content: "订单", FromUserName: "openid-keyword-order" }),
    );
    const paymentReply = await handleWechatMessage(
      db,
      createWechatXml({ MsgType: "text", Content: "付款", FromUserName: "openid-keyword-payment" }),
    );
    const faqReply = await handleWechatMessage(
      db,
      createWechatXml({ MsgType: "text", Content: "常见问题", FromUserName: "openid-keyword-faq" }),
    );
    const helloReply = await handleWechatMessage(
      db,
      createWechatXml({ MsgType: "text", Content: "你好", FromUserName: "openid-keyword-hello" }),
    );

    assert.match(quoteReply, /https:\/\/make3d\.com\.cn\/quote/);
    assert.match(orderReply, /https:\/\/make3d\.com\.cn\/account/);
    assert.match(paymentReply, /付款方式/);
    assert.match(faqReply, /https:\/\/make3d\.com\.cn\/quote/);
    assert.match(helloReply, /报价/);
    assert.match(helloReply, /订单/);
    assert.match(helloReply, /付款/);
    assert.match(helloReply, /人工/);
  } finally {
    restoreEnv({ APP_URL: previousAppUrl });
    db.close();
  }
});

test("wechat keyword customer service creates service request", async () => {
  const db = initDatabase(":memory:");

  const reply = await handleWechatMessage(
    db,
    createWechatXml({
      MsgType: "text",
      Content: "人工 客服 13800000000",
      FromUserName: "openid-service",
    }),
  );
  const requests = searchCustomerServiceRequests(db, {});

  assert.match(reply, /已收到人工客服请求/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].openid, "openid-service");
  assert.equal(requests[0].phone, "13800000000");
  assert.equal(requests[0].status, "pending");
  assert.equal(requests[0].source, "wechat_keyword");

  db.close();
});

test("wechat keyword customer service avoids duplicate recent requests", async () => {
  const db = initDatabase(":memory:");
  const xml = createWechatXml({
    MsgType: "text",
    Content: "人工 TEST-M3D-001 模型需要拆分",
    FromUserName: "openid-service-dedupe",
  });

  const firstReply = await handleWechatMessage(db, xml);
  const secondReply = await handleWechatMessage(db, xml);
  const requests = searchCustomerServiceRequests(db, {});

  assert.match(firstReply, /已收到人工客服请求/);
  assert.match(secondReply, /已收到人工客服请求/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].openid, "openid-service-dedupe");
  assert.equal(requests[0].message, "人工 TEST-M3D-001 模型需要拆分");

  db.close();
});

test("wechat menu click events reply with configured guidance", async () => {
  const db = initDatabase(":memory:");

  for (const key of WECHAT_MENU_CLICK_KEYS) {
    const reply = await handleWechatMessage(
      db,
      createWechatXml({
        MsgType: "event",
        Event: "CLICK",
        EventKey: key,
        FromUserName: `openid-${key}`,
      }),
    );

    assert.match(reply, new RegExp(escapeRegExp(WECHAT_MENU_CLICK_REPLIES[key].split("\n")[0])));
  }

  db.close();
});

test("wechat customer service menu creates one recent request only", async () => {
  const db = initDatabase(":memory:");
  const xml = createWechatXml({
    MsgType: "event",
    Event: "CLICK",
    EventKey: "MAKE3D_CUSTOMER_SERVICE",
    FromUserName: "openid-menu-service",
  });

  const firstReply = await handleWechatMessage(db, xml);
  const secondReply = await handleWechatMessage(db, xml);
  const requests = searchCustomerServiceRequests(db, {});

  assert.match(firstReply, /已进入人工客服流程/);
  assert.match(secondReply, /已进入人工客服流程/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].openid, "openid-menu-service");
  assert.equal(requests[0].source, "wechat");
  assert.equal(requests[0].category, "customer_service");
  assert.equal(requests[0].message, "菜单：联系客服");

  db.close();
});

test("customer service message with order number links the order", async () => {
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, createCustomerFixture());
  const order = createPayableOrder(db, customer.id);

  const reply = await handleWechatMessage(
    db,
    createWechatXml({
      MsgType: "text",
      Content: `人工 请看订单 ${order.orderNo}`,
      FromUserName: "openid-order-link",
    }),
  );
  const requests = searchCustomerServiceRequests(db, {});

  assert.match(reply, /已收到人工客服请求/);
  assert.equal(requests[0].orderId, order.id);
  assert.equal(requests[0].orderNo, order.orderNo);
  assert.equal(requests[0].customerId, customer.id);
  assert.equal(requests[0].phone, "13800000000");

  db.close();
});

test("customer service message with phone links the customer and latest unfinished order", async () => {
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, createCustomerFixture());
  const order = createPayableOrder(db, customer.id);

  await handleWechatMessage(
    db,
    createWechatXml({
      MsgType: "text",
      Content: "人工 客服 13800000000",
      FromUserName: "openid-phone-link",
    }),
  );
  const requests = searchCustomerServiceRequests(db, {});

  assert.equal(requests[0].customerId, customer.id);
  assert.equal(requests[0].orderId, order.id);
  assert.equal(requests[0].phone, "13800000000");

  db.close();
});

test("bound openid customer service links the customer and latest unfinished order", async () => {
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, createCustomerFixture());
  const { bindCode } = createWechatBindCode(db, customer.id);
  bindWechatAccountByCode(db, { bindCode, openid: "openid-bound-service" });
  const order = createPayableOrder(db, customer.id);

  await handleWechatMessage(
    db,
    createWechatXml({
      MsgType: "text",
      Content: "人工",
      FromUserName: "openid-bound-service",
    }),
  );
  const requests = searchCustomerServiceRequests(db, {});

  assert.equal(requests[0].customerId, customer.id);
  assert.equal(requests[0].orderId, order.id);
  assert.equal(requests[0].phone, "13800000000");

  db.close();
});

test("does not send wechat notification for unbound customer", async () => {
  const previous = snapshotWechatEnv();
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, createCustomerFixture());
  const order = createPayableOrder(db, customer.id);
  const sent = [];

  try {
    process.env.WECHAT_MP_ENABLED = "true";
    const result = await notifyWechatOrderStatus(db, getOrderById(db, order.id), {
      sendText: async (openid, content) => sent.push({ openid, content }),
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "customer_not_bound");
    assert.equal(sent.length, 0);
    assert.equal(listWechatNotificationsByOrderId(db, order.id).length, 0);
  } finally {
    restoreEnv(previous);
    db.close();
  }
});

test("sends wechat notification for bound customer status updates", async () => {
  const previous = snapshotWechatEnv();
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, createCustomerFixture());
  const { bindCode } = createWechatBindCode(db, customer.id);
  bindWechatAccountByCode(db, { bindCode, openid: "openid-bound" });
  const order = createPayableOrder(db, customer.id);
  const sent = [];

  try {
    process.env.WECHAT_MP_ENABLED = "true";
    const detail = getOrderById(db, order.id);
    const result = await notifyWechatOrderStatus(db, detail, {
      sendText: async (openid, content) => sent.push({ openid, content }),
    });
    const notifications = listWechatNotificationsByOrderId(db, order.id);

    assert.equal(result.sent, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].openid, "openid-bound");
    assert.match(sent[0].content, /订单编号/);
    assert.match(buildWechatOrderStatusContent(detail), /订单详情：https:\/\/make3d\.com\.cn\/account\/orders\//);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].sendStatus, "sent");

    confirmOrderPayment(db, order.id, { paymentMethod: "线下转账", operator: "admin" });
    updateOrderStatus(db, order.id, { status: "排产中", operator: "admin" });
    const scheduledResult = await notifyWechatOrderStatus(db, getOrderById(db, order.id), {
      sendText: async (openid, content) => sent.push({ openid, content }),
    });
    assert.equal(scheduledResult.skipped, true);
    assert.equal(scheduledResult.reason, "status_not_supported");
    assert.equal(sent.length, 1);
  } finally {
    restoreEnv(previous);
    db.close();
  }
});

test("missing wechat send configuration does not block order status changes", async () => {
  const previous = snapshotWechatEnv();
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, createCustomerFixture());
  const { bindCode } = createWechatBindCode(db, customer.id);
  bindWechatAccountByCode(db, { bindCode, openid: "openid-config-missing" });
  const order = createPayableOrder(db, customer.id);

  try {
    process.env.WECHAT_MP_ENABLED = "true";
    delete process.env.WECHAT_MP_APP_ID;
    delete process.env.WECHAT_MP_APP_SECRET;

    assert.equal(confirmOrderPayment(db, order.id, { paymentMethod: "线下转账", operator: "admin" }), true);
    assert.equal(updateOrderStatus(db, order.id, { status: "生产中", operator: "admin" }), true);
    const result = await notifyWechatOrderStatus(db, getOrderById(db, order.id));
    const notifications = listWechatNotificationsByOrderId(db, order.id);

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "wechat_config_missing");
    assert.equal(getOrderById(db, order.id).status, "生产中");
    assert.equal(notifications[0].sendStatus, "skipped");
  } finally {
    restoreEnv(previous);
    db.close();
  }
});

test("shared paid status workflow records failed wechat notification without blocking", async () => {
  const previous = snapshotWechatEnv();
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, createCustomerFixture());
  const { bindCode } = createWechatBindCode(db, customer.id);
  bindWechatAccountByCode(db, { bindCode, openid: "openid-config-missing-paid" });
  const order = createPayableOrder(db, customer.id);

  try {
    process.env.WECHAT_MP_ENABLED = "true";
    delete process.env.WECHAT_MP_APP_ID;
    delete process.env.WECHAT_MP_APP_SECRET;

    const result = await updateOrderStatusAndNotify(db, order.id, {
      status: "已付款",
      operator: "admin",
      paymentMethod: "线下转账",
      paymentNote: "状态下拉确认",
    });
    const detail = getOrderById(db, order.id);
    const notifications = listWechatNotificationsByOrderId(db, order.id);

    assert.equal(result.updated, true);
    assert.equal(detail.status, "已付款");
    assert.equal(detail.paymentStatus, "paid");
    assert.ok(detail.paidAt);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].sendStatus, "skipped");
    assert.match(notifications[0].content, /当前状态：已付款/);
  } finally {
    restoreEnv(previous);
    db.close();
  }
});

function createCustomerFixture() {
  return {
    phone: "13800000000",
    password: "password123",
    name: "Jerry",
    wechat: "make3d",
    email: "jerry@example.com",
  };
}

function createPayableOrder(db, customerId) {
  const order = createOrderWithFile(db, {
    customerId,
    customerName: "Jerry",
    phone: "13800000000",
    wechat: "make3d",
    email: "jerry@example.com",
    material: "PLA",
    color: "white",
    quantity: 1,
    estimatedPrice: 30,
    file: {
      filename: "wechat.stl",
      filepath: "/uploads/wechat.stl",
      filesize: 128,
    },
  });

  confirmOrderFinalQuote(db, order.id, {
    finalPrice: 88,
    finalLeadTimeHours: 48,
    operator: "admin",
  });

  return order;
}

function createWechatXml(fields) {
  const values = {
    ToUserName: "make3d-mp",
    FromUserName: "openid-test",
    CreateTime: "1718000000",
    MsgType: "text",
    Content: "",
    Event: "",
    EventKey: "",
    ...fields,
  };

  return [
    "<xml>",
    ...Object.entries(values)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => `<${key}><![CDATA[${value}]]></${key}>`),
    "</xml>",
  ].join("");
}

function signWechat(token, timestamp, nonce) {
  return createHash("sha1").update([token, timestamp, nonce].sort().join("")).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snapshotWechatEnv() {
  return {
    APP_URL: process.env.APP_URL,
    WECHAT_MP_ENABLED: process.env.WECHAT_MP_ENABLED,
    WECHAT_MP_APP_ID: process.env.WECHAT_MP_APP_ID,
    WECHAT_MP_APP_SECRET: process.env.WECHAT_MP_APP_SECRET,
    WECHAT_MP_TOKEN: process.env.WECHAT_MP_TOKEN,
    WECHAT_MP_AES_KEY: process.env.WECHAT_MP_AES_KEY,
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
