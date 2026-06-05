import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createOrderWithFile,
  getFileById,
  getOrderById,
  getOrderStatusLogsByOrderId,
  initDatabase,
  ORDER_STATUSES,
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

test("updates order status only to allowed values", () => {
  const db = initDatabase(":memory:");
  const order = createFixtureOrder(db);

  assert.deepEqual(ORDER_STATUSES, [
    "待确认",
    "待付款",
    "已付款",
    "排产中",
    "打印中",
    "后处理",
    "已发货",
    "已完成",
    "已取消",
  ]);
  assert.equal(updateOrderStatus(db, order.id, { status: "打印中", operator: "admin" }), true);
  assert.equal(getOrderById(db, order.id).status, "打印中");
  assert.throws(() => updateOrderStatus(db, order.id, { status: "未知状态", operator: "admin" }), /无效订单状态/);

  db.close();
});

test("records order status workflow logs and admin fulfillment fields", () => {
  const db = initDatabase(":memory:");
  const order = createFixtureOrder(db);

  assert.equal(
    updateOrderStatus(db, order.id, {
      status: "已发货",
      operator: "admin",
      shippingCompany: "顺丰快递",
      trackingNumber: "SF123456789",
      adminRemark: "已通知客户",
    }),
    true,
  );
  const detail = getOrderById(db, order.id);
  const logs = getOrderStatusLogsByOrderId(db, order.id);

  assert.equal(detail.status, "已发货");
  assert.equal(detail.shippingCompany, "顺丰快递");
  assert.equal(detail.trackingNumber, "SF123456789");
  assert.equal(detail.adminRemark, "已通知客户");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].fromStatus, "待确认");
  assert.equal(logs[0].toStatus, "已发货");
  assert.equal(logs[0].operator, "admin");

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
