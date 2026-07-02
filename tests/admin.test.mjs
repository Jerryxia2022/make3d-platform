import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createCustomerAccount,
  createOrderWithFile,
  getFileById,
  getOrderById,
  getOrderByIdForCustomer,
  getOrderStatusLogsByOrderId,
  listOrderPaymentsByOrderId,
  confirmOrderFinalQuote,
  confirmOrderPayment,
  initDatabase,
  searchOrders,
  ORDER_STATUSES,
  updateOrderFinalQuote,
  updateOrderStatus,
} from "../src/backend/database.ts";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminLoginRedirectResponse,
  createAdminSessionToken,
  getAdminCookieOptions,
  verifyAdminSessionToken,
  verifyAdminCredentials,
} from "../src/backend/adminAuth.ts";

function createFixtureOrder(db) {
  return createOrderWithFile(db, {
    customerName: "Jerry",
    phone: "13800000000",
    wechat: "make3d",
    email: "jerry@example.com",
    company: "Make3D",
    material: "PLA",
    color: "white",
    quantity: 2,
    remark: "admin test order",
    estimatedPrice: 30,
    file: {
      filename: "fixture.stl",
      filepath: "/uploads/fixture.stl",
      filesize: 128,
    },
  });
}

test("verifies admin credentials from environment variables", () => {
  const previousUsername = process.env.ADMIN_USERNAME;
  const previousPassword = process.env.ADMIN_PASSWORD;

  try {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "secret";

    assert.equal(ADMIN_SESSION_COOKIE, "make3d_admin");
    assert.equal(verifyAdminCredentials("admin", "secret"), true);
    assert.equal(verifyAdminCredentials("admin", "wrong"), false);
  } finally {
    process.env.ADMIN_USERNAME = previousUsername;
    process.env.ADMIN_PASSWORD = previousPassword;
  }
});

test("creates signed admin session tokens with SESSION_SECRET", () => {
  const previousSecret = process.env.SESSION_SECRET;

  try {
    process.env.SESSION_SECRET = "test-session-secret-with-enough-length";

    const token = createAdminSessionToken();
    assert.notEqual(token, "authenticated");
    assert.equal(verifyAdminSessionToken(token), true);
    assert.equal(verifyAdminSessionToken(`${token}tampered`), false);
    assert.equal(verifyAdminSessionToken("authenticated"), false);
  } finally {
    process.env.SESSION_SECRET = previousSecret;
  }
});

test("uses COOKIE_SECURE for secure cookie settings with seven day max age", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCookieSecure = process.env.COOKIE_SECURE;

  try {
    process.env.NODE_ENV = "production";
    process.env.COOKIE_SECURE = "false";
    const httpOptions = getAdminCookieOptions();

    assert.equal(httpOptions.httpOnly, true);
    assert.equal(httpOptions.sameSite, "lax");
    assert.equal(httpOptions.secure, false);
    assert.equal(httpOptions.path, "/");
    assert.equal(httpOptions.maxAge, ADMIN_SESSION_MAX_AGE_SECONDS);

    process.env.COOKIE_SECURE = "true";
    assert.equal(getAdminCookieOptions().secure, true);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    process.env.COOKIE_SECURE = previousCookieSecure;
  }
});

test("admin login redirect uses relative Location header", () => {
  const response = createAdminLoginRedirectResponse("signed-token");

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/admin/orders");
  assert.equal(response.headers.get("Location")?.includes("localhost"), false);
  assert.match(response.headers.get("Set-Cookie") || "", /make3d_admin=signed-token/);
});

test("loads order detail with associated uploaded file", () => {
  const db = initDatabase(":memory:");
  const order = createFixtureOrder(db);
  const detail = getOrderById(db, order.id);

  assert.equal(detail.customerName, "Jerry");
  assert.equal(detail.remark, "admin test order");
  assert.equal(detail.files.length, 1);
  assert.equal(detail.files[0].filename, "fixture.stl");

  db.close();
});

test("orders table tracks payment state and updated timestamp", () => {
  const db = initDatabase(":memory:");
  const columns = db.prepare("PRAGMA table_info(orders)").all().map((row) => row.name);

  assert.ok(columns.includes("payment_status"));
  assert.ok(columns.includes("paid_at"));
  assert.ok(columns.includes("updated_at"));

  db.close();
});

test("updates order status only to allowed values", () => {
  const db = initDatabase(":memory:");
  const order = createFixtureOrder(db);

  assert.deepEqual(ORDER_STATUSES, [
    "待确认",
    "待付款",
    "已付款",
    "排产中",
    "生产中",
    "后处理",
    "已发货",
    "已完成",
    "已取消",
  ]);
  assert.throws(
    () => updateOrderStatus(db, order.id, { status: "待付款", operator: "admin" }),
    /没有最终报价不能进入待付款/,
  );
  assert.throws(
    () => updateOrderStatus(db, order.id, { status: "生产中", operator: "admin" }),
    /未付款不能进入生产流程/,
  );
  assert.throws(() => updateOrderStatus(db, order.id, { status: "未知状态", operator: "admin" }), /无效订单状态/);

  db.close();
});

test("admin confirms final quote before customer payment", () => {
  const db = initDatabase(":memory:");
  const order = createFixtureOrder(db);

  assert.equal(
    confirmOrderFinalQuote(db, order.id, {
      finalPrice: 88.5,
      finalLeadTimeHours: 72,
      priceAdjustmentReason: "增加支撑和后处理",
      productionNote: "按白色 PLA 生产",
      operator: "admin",
    }),
    true,
  );

  const detail = getOrderById(db, order.id);
  const logs = getOrderStatusLogsByOrderId(db, order.id);

  assert.equal(detail.status, "待付款");
  assert.equal(detail.finalPrice, 88.5);
  assert.equal(detail.finalLeadTimeHours, 72);
  assert.equal(detail.priceAdjustmentReason, "增加支撑和后处理");
  assert.equal(detail.productionNote, "按白色 PLA 生产");
  assert.equal(logs[0].fromStatus, "待确认");
  assert.equal(logs[0].toStatus, "待付款");

  db.close();
});

test("admin manually confirms payment and blocks unsafe payment transitions", () => {
  const db = initDatabase(":memory:");
  const order = createFixtureOrder(db);

  assert.throws(
    () => confirmOrderPayment(db, order.id, { paymentNote: "微信到账", operator: "admin" }),
    /只有待付款订单可以确认到账/,
  );

  confirmOrderFinalQuote(db, order.id, {
    finalPrice: 88.5,
    finalLeadTimeHours: 72,
    priceAdjustmentReason: "人工确认",
    productionNote: "准备生产",
    operator: "admin",
  });

  assert.equal(
    confirmOrderPayment(db, order.id, {
      paymentMethod: "微信转账",
      paidAmount: 88.5,
      payerName: "Jerry",
      platformTradeNo: "wx-001",
      paymentNote: "微信到账",
      operator: "admin",
    }),
    true,
  );

  const paid = getOrderById(db, order.id);
  assert.equal(paid.status, "已付款");
  assert.equal(paid.paymentStatus, "paid");
  assert.ok(paid.paidAt);
  assert.equal(paid.paymentMethod, "微信转账");
  assert.equal(paid.paymentConfirmedBy, "admin");
  assert.equal(paid.paymentNote, "微信到账");
  assert.ok(paid.paymentConfirmedAt);
  const paymentRecords = listOrderPaymentsByOrderId(db, order.id);
  assert.equal(paymentRecords.length, 1);
  assert.equal(paymentRecords[0].expectedAmountCents, 8850);
  assert.equal(paymentRecords[0].paidAmountCents, 8850);
  assert.equal(paymentRecords[0].payerName, "Jerry");
  assert.equal(paymentRecords[0].platformTradeNo, "wx-001");

  assert.equal(updateOrderStatus(db, order.id, { status: "生产中", operator: "admin" }), true);
  assert.equal(getOrderById(db, order.id).status, "生产中");
  assert.throws(
    () => updateOrderStatus(db, order.id, { status: "待付款", operator: "admin" }),
    /已付款订单不能退回未付款状态/,
  );
  assert.throws(
    () => confirmOrderPayment(db, order.id, { paymentNote: "重复确认", operator: "admin" }),
    /\u4e0d\u80fd\u91cd\u590d\u786e\u8ba4\u4ed8\u6b3e/,
  );

  const canceled = createFixtureOrder(db);
  updateOrderStatus(db, canceled.id, { status: "已取消", operator: "admin" });
  assert.throws(
    () => confirmOrderPayment(db, canceled.id, { paymentNote: "取消后付款", operator: "admin" }),
    /已取消订单不能继续流转/,
  );

  assert.equal(updateOrderStatus(db, order.id, { status: "已完成", operator: "admin" }), true);
  assert.throws(
    () => updateOrderStatus(db, order.id, { status: "待付款", operator: "admin" }),
    /已完成订单不能继续流转/,
  );

  db.close();
});

test("admin status dropdown can confirm payment through shared status logic", () => {
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, {
    phone: "13800000001",
    password: "password123",
    name: "Jerry",
    wechat: "make3d",
    email: "jerry@example.com",
  });
  const order = createOrderWithFile(db, {
    customerId: customer.id,
    customerName: "Jerry",
    phone: "13800000001",
    wechat: "make3d",
    email: "jerry@example.com",
    material: "PLA",
    color: "white",
    quantity: 1,
    estimatedPrice: 30,
    file: {
      filename: "fixture.stl",
      filepath: "/uploads/fixture.stl",
      filesize: 128,
    },
  });

  confirmOrderFinalQuote(db, order.id, {
    finalPrice: 88.5,
    finalLeadTimeHours: 72,
    priceAdjustmentReason: "人工确认",
    productionNote: "准备生产",
    operator: "admin",
  });

  assert.equal(
    updateOrderStatus(db, order.id, {
      status: "已付款",
      operator: "admin",
      paymentMethod: "支付宝转账",
      paymentNote: "状态下拉确认到账",
      note: "后台状态下拉确认付款",
    }),
    true,
  );

  const detail = getOrderById(db, order.id);
  const customerDetail = getOrderByIdForCustomer(db, order.id, customer.id);
  const logs = getOrderStatusLogsByOrderId(db, order.id);

  assert.equal(detail.status, "已付款");
  assert.equal(detail.paymentStatus, "paid");
  assert.ok(detail.paidAt);
  assert.ok(detail.paymentConfirmedAt);
  assert.equal(detail.paymentConfirmedBy, "admin");
  assert.equal(detail.paymentMethod, "支付宝转账");
  assert.equal(customerDetail.status, "已付款");
  assert.equal(customerDetail.paymentStatus, "paid");
  assert.ok(logs.some((log) => log.fromStatus === "待付款" && log.toStatus === "已付款"));
  assert.equal(listOrderPaymentsByOrderId(db, order.id).length, 1);

  db.close();
});

test("records order status workflow logs and admin fulfillment fields", () => {
  const db = initDatabase(":memory:");
  const order = createFixtureOrder(db);

  confirmOrderFinalQuote(db, order.id, {
    finalPrice: 66,
    finalLeadTimeHours: 48,
    priceAdjustmentReason: "人工确认",
    productionNote: "排产",
    operator: "admin",
  });
  confirmOrderPayment(db, order.id, { paymentNote: "支付宝到账", operator: "admin" });
  updateOrderStatus(db, order.id, {
    status: "排产中",
    operator: "admin",
    assignedPrinter: "P1S-03",
    estimatedStartAt: "2026-06-13T20:00",
    estimatedFinishAt: "2026-06-14T08:00",
    productionNote: "今晚排产",
    internalNote: "优先测试件",
    note: "进入排产",
  });
  updateOrderStatus(db, order.id, {
    status: "生产中",
    operator: "admin",
    actualStartAt: "2026-06-13T21:10",
    note: "开始打印",
  });
  updateOrderStatus(db, order.id, { status: "后处理", operator: "admin" });

  assert.throws(
    () => updateOrderStatus(db, order.id, { status: "已发货", operator: "admin" }),
    /确认发货需要填写快递公司和运单号/,
  );

  assert.equal(
    updateOrderStatus(db, order.id, {
      status: "已发货",
      operator: "admin",
      shippingCompany: "顺丰",
      trackingNumber: "SF123456789",
      shippingNote: "已打包发出",
      adminRemark: "已通知客户",
      note: "确认发货",
    }),
    true,
  );
  const detail = getOrderById(db, order.id);
  const logs = getOrderStatusLogsByOrderId(db, order.id);

  assert.equal(detail.status, "已发货");
  assert.equal(detail.assignedPrinter, "P1S-03");
  assert.equal(detail.estimatedStartAt, "2026-06-13T20:00");
  assert.equal(detail.estimatedFinishAt, "2026-06-14T08:00");
  assert.equal(detail.actualStartAt, "2026-06-13T21:10");
  assert.equal(detail.productionNote, "今晚排产");
  assert.equal(detail.internalNote, "优先测试件");
  assert.equal(detail.shippingCompany, "顺丰");
  assert.equal(detail.trackingNumber, "SF123456789");
  assert.ok(detail.shippedAt);
  assert.equal(detail.shippingNote, "已打包发出");
  assert.equal(detail.adminRemark, "已通知客户");
  assert.equal(logs.length, 6);
  assert.ok(logs.some((log) => log.fromStatus === "待确认" && log.toStatus === "待付款"));
  assert.ok(logs.some((log) => log.fromStatus === "待付款" && log.toStatus === "已付款"));
  assert.ok(logs.some((log) => log.fromStatus === "已付款" && log.toStatus === "排产中"));
  assert.ok(logs.some((log) => log.fromStatus === "排产中" && log.toStatus === "生产中"));
  assert.ok(logs.some((log) => log.fromStatus === "生产中" && log.toStatus === "后处理"));
  assert.ok(logs.some((log) => log.fromStatus === "后处理" && log.toStatus === "已发货"));
  assert.ok(logs.some((log) => log.toStatus === "排产中" && log.note === "进入排产"));
  assert.ok(logs.some((log) => log.toStatus === "已发货" && log.note === "确认发货"));
  assert.equal(logs[0].operator, "admin");

  db.close();
});

test("searches orders and saves admin final quote", () => {
  const db = initDatabase(":memory:");
  const order = createFixtureOrder(db);

  assert.equal(updateOrderFinalQuote(db, order.id, {
    finalPrice: 248.08,
    priceAdjustmentReason: "支撑和后处理人工确认",
  }), true);

  const detail = getOrderById(db, order.id);
  assert.equal(detail.finalPrice, 248.08);
  assert.equal(detail.priceAdjustmentReason, "支撑和后处理人工确认");
  assert.ok(detail.finalPriceUpdatedAt);
  assert.equal(searchOrders(db, { query: "Jerry", status: "待确认" }).length, 1);
  assert.equal(searchOrders(db, { query: "no-match", status: "待确认" }).length, 0);

  db.close();
});

test("loads uploaded file metadata by id for download", () => {
  const db = initDatabase(":memory:");
  const order = createFixtureOrder(db);
  const detail = getOrderById(db, order.id);
  const file = getFileById(db, detail.files[0].id);

  assert.equal(file.filename, "fixture.stl");
  assert.equal(file.filepath, "/uploads/fixture.stl");

  db.close();
});
