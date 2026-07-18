import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { createOrderWithFile, initDatabase } from "../src/backend/database.ts";
import { applyOrderWorkbenchWriteSchema } from "../src/backend/orderWorkbenchWriteSchema.ts";
import {
  buildOrderWorkbenchRequestFingerprint,
  confirmAndReplyToTestOrder,
  getOrderWorkbenchOrderVersion,
  listVisibleOrderMessagesForCustomer,
} from "../src/backend/orderWorkbenchOnlineSync.ts";
import { POST as confirmPOST } from "../src/app/api/operator/workbench/orders/[id]/confirm-and-reply/route.ts";

const TOKEN = "phase06-local-workbench-token";
const WORKER_TOKEN = "phase06-worker-token";

test("online confirmation API rejects missing, wrong, worker and query tokens", async () => {
  await withFixture(async ({ orderId, url, payload }) => {
    assert.equal((await confirmPOST(jsonRequest(url, payload, null), params(orderId))).status, 401);
    assert.equal((await confirmPOST(jsonRequest(url, payload, "wrong-token"), params(orderId))).status, 401);
    assert.equal((await confirmPOST(jsonRequest(url, payload, WORKER_TOKEN), params(orderId))).status, 401);
    assert.equal((await confirmPOST(jsonRequest(`${url}?token=${TOKEN}`, payload, null), params(orderId))).status, 401);
  });
});

test("online confirmation writes only TEST order confirmation, message and audit rows", async () => {
  await withFixture(async ({ dbPath, orderId, url, payload }) => {
    const response = await confirmPOST(jsonRequest(url, { ...payload, customer_id: 999, is_test_account: false, operator_id: "evil" }), params(orderId));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.result.created, true);
    assert.equal(body.result.confirmation.confirmed_quote_amount_cents, 1234);
    assert.equal(body.result.message.message_type, "QUOTE_CONFIRMATION");
    assert.equal(body.result.confirmation.operator_id, "operator");
    assert.equal(body.result.request_fingerprint, buildOrderWorkbenchRequestFingerprint(orderId, payload));

    const db = new DatabaseSync(dbPath);
    const order = db.prepare("SELECT status, payment_status, final_price, payable_price FROM orders WHERE id = ?").get(orderId);
    assert.equal(order.status.includes("待") || typeof order.status === "string", true);
    assert.equal(order.payment_status, "unpaid");
    assert.equal(order.final_price, null);
    assert.equal(order.payable_price, null);
    assert.equal(countRows(db, "order_messages"), 1);
    assert.equal(countRows(db, "operator_order_confirmations"), 1);
    assert.equal(countRows(db, "operator_order_audit_events"), 1);
    assert.equal(countRows(db, "slicing_jobs"), 0);
    assert.equal(countRows(db, "order_payments"), 0);
    assert.equal(countRows(db, "wechat_refunds"), 0);
    assert.equal(countRows(db, "payment_settings"), 1);

    const audit = db.prepare("SELECT before_summary, after_summary FROM operator_order_audit_events").get();
    assert.doesNotMatch(JSON.stringify(audit), /phase06|Bearer|openid|13900000007|email-fixture|payment_no|transaction_id/i);
    const confirmation = db.prepare("SELECT request_fingerprint, schema_version FROM operator_order_confirmations").get();
    assert.equal(confirmation.request_fingerprint, buildOrderWorkbenchRequestFingerprint(orderId, payload));
    assert.equal(confirmation.schema_version, 1);
    db.close();
  }, { customerId: 7, isTest: 1 });
});

test("online confirmation is idempotent by client_request_id", async () => {
  await withFixture(async ({ db, orderId, payload }) => {
    const first = confirmAndReplyToTestOrder(db, orderId, payload, { operatorId: "local-workbench-test" });
    const second = confirmAndReplyToTestOrder(db, orderId, payload, { operatorId: "local-workbench-test" });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(countRows(db, "order_messages"), 1);
    assert.equal(countRows(db, "operator_order_confirmations"), 1);
    assert.equal(countRows(db, "operator_order_audit_events"), 1);
  });
});

test("online confirmation concurrent identical requests create only one row group", async () => {
  await withFixture(async ({ db, orderId, url, payload }) => {
    const responses = await Promise.all([
      confirmPOST(jsonRequest(url, payload), params(orderId)),
      confirmPOST(jsonRequest(url, payload), params(orderId)),
    ]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(bodies.map((body) => Boolean(body.result.created)).sort(), [false, true]);
    assert.equal(countRows(db, "order_messages"), 1);
    assert.equal(countRows(db, "operator_order_confirmations"), 1);
    assert.equal(countRows(db, "operator_order_audit_events"), 1);
  });
});

test("online confirmation binds client_request_id to canonical request fingerprint", async () => {
  await withFixture(async ({ db, orderId, payload }) => {
    const first = confirmAndReplyToTestOrder(db, orderId, payload, { operatorId: "local-workbench-test" });
    const same = confirmAndReplyToTestOrder(db, orderId, payload, { operatorId: "local-workbench-test" });
    assert.equal(first.created, true);
    assert.equal(same.created, false);

    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, { ...payload, confirmed_quote_amount_cents: 9999 }),
      /client_request_id was reused/,
    );
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, { ...payload, lead_time_max_hours: 48 }),
      /client_request_id was reused/,
    );
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, { ...payload, message_body: "Changed message" }),
      /client_request_id was reused/,
    );
    assert.equal(countRows(db, "order_messages"), 1);
    assert.equal(countRows(db, "operator_order_confirmations"), 1);
    assert.equal(countRows(db, "operator_order_audit_events"), 1);
  });
});

test("failed transaction does not occupy the idempotency key", async () => {
  await withFixture(async ({ db, orderId, payload }) => {
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, payload, { failBeforeCommitForTest: true }),
      /Injected transaction failure before commit/,
    );
    assert.equal(countRows(db, "order_messages"), 0);
    const success = confirmAndReplyToTestOrder(db, orderId, payload);
    assert.equal(success.created, true);
    assert.equal(countRows(db, "order_messages"), 1);
    assert.equal(countRows(db, "operator_order_confirmations"), 1);
    assert.equal(countRows(db, "operator_order_audit_events"), 1);
  });
});

test("online confirmation detects order version conflicts", async () => {
  await withFixture(async ({ db, orderId, payload }) => {
    db.prepare("UPDATE orders SET quantity = quantity + 1 WHERE id = ?").run(orderId);
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, payload, { operatorId: "local-workbench-test" }),
      /Order has changed/,
    );
    assert.equal(countRows(db, "order_messages"), 0);
  });
});

test("order version covers service requests, messages, files, order fields, and confirmations", async () => {
  await withFixture(async ({ db, orderId, payload }) => {
    const baseline = payload.expected_order_version;

    db.prepare(`
      INSERT INTO customer_service_requests (customer_id, phone, order_id, message, status, source, category)
      VALUES (7, '13900000007', ?, 'customer asks', 'pending', 'web', 'order')
    `).run(orderId);
    assert.notEqual(getOrderWorkbenchOrderVersion(db, orderId), baseline);
  });

  await withFixture(async ({ db, orderId, payload }) => {
    db.prepare(`
      INSERT INTO order_messages (
        order_id, customer_id, sender_type, message_type, body, customer_visible,
        operator_id, client_request_id, request_fingerprint, order_version_snapshot, schema_version
      ) VALUES (?, 7, 'CUSTOMER', 'TEXT', 'customer text', 1, NULL, 'customer-msg-01', ?, ?, 1)
    `).run(orderId, "f".repeat(64), payload.expected_order_version);
    assert.throws(() => confirmAndReplyToTestOrder(db, orderId, payload), /Order has changed/);
  });

  await withFixture(async ({ db, orderId, payload }) => {
    db.prepare("UPDATE files SET quantity = quantity + 1 WHERE order_id = ?").run(orderId);
    assert.throws(() => confirmAndReplyToTestOrder(db, orderId, payload), /Order has changed/);
  });

  await withFixture(async ({ db, orderId, payload }) => {
    db.prepare("UPDATE orders SET material = 'PETG', color = 'white', quantity = quantity + 1 WHERE id = ?").run(orderId);
    assert.throws(() => confirmAndReplyToTestOrder(db, orderId, payload), /Order has changed/);
  });

  await withFixture(async ({ db, orderId, payload }) => {
    confirmAndReplyToTestOrder(db, orderId, { ...payload, client_request_id: "phase06:a4b:first-ok" });
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, { ...payload, client_request_id: "phase06:a4b:stale-after-confirm" }),
      /Order has changed/,
    );
  });

  await withFixture(async ({ db, orderId, payload }) => {
    db.prepare(`
      INSERT INTO operator_order_audit_events (
        order_id, operator_id, action, before_summary, after_summary, client_request_id,
        request_fingerprint, result, schema_version
      ) VALUES (?, 'operator', 'unrelated_audit', '{}', '{}', 'audit-only-01', ?, 'ok', 1)
    `).run(orderId, "e".repeat(64));
    const result = confirmAndReplyToTestOrder(db, orderId, payload);
    assert.equal(result.created, true);
  });
});

test("online confirmation fails closed for real customers and NULL authoritative flag", async () => {
  await withFixture(async ({ db, orderId, payload }) => {
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, payload, { operatorId: "local-workbench-test" }),
      /Only authoritative TEST/,
    );
  }, { customerId: 8, isTest: 0 });

  const db = createMinimalNullableFlagDb();
  applyOrderWorkbenchWriteSchema(db);
  const payload = {
    client_request_id: "phase06:null-flag",
    expected_order_version: getOrderWorkbenchOrderVersion(db, 1),
    confirmed_quote_amount_cents: 100,
    lead_time_min_hours: 1,
    lead_time_max_hours: 2,
    estimated_ship_at: "",
    message_type: "GENERAL_REPLY",
    message_body: "test",
  };
  assert.throws(() => confirmAndReplyToTestOrder(db, 1, payload), /Only authoritative TEST/);
  db.close();
});

test("online confirmation rejects invalid input and rolls back atomically", async () => {
  await withFixture(async ({ db, orderId, payload }) => {
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, { ...payload, confirmed_quote_amount_cents: "12.5" }),
      /non-negative integer/,
    );
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, { ...payload, lead_time_min_hours: 30, lead_time_max_hours: 20 }),
      /lead_time_max_hours/,
    );
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, { ...payload, message_body: "" }),
      /message_body/,
    );
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, payload, { failAfterConfirmationForTest: true }),
      /Injected transaction failure/,
    );
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, payload, { failAfterMessageForTest: true }),
      /Injected transaction failure after message/,
    );
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, payload, { failAtAuditForTest: true }),
      /Injected transaction failure before commit/,
    );
    assert.throws(
      () => confirmAndReplyToTestOrder(db, orderId, payload, { failBeforeCommitForTest: true }),
      /Injected transaction failure before commit/,
    );
    assert.equal(countRows(db, "operator_order_confirmations"), 0);
    assert.equal(countRows(db, "order_messages"), 0);
    assert.equal(countRows(db, "operator_order_audit_events"), 0);
  });
});

test("customer-visible order messages are owner scoped and internal messages are hidden", async () => {
  await withFixture(async ({ db, orderId, payload }) => {
    confirmAndReplyToTestOrder(db, orderId, payload, { operatorId: "local-workbench-test" });
    db.prepare(
      `INSERT INTO order_messages (
        order_id, customer_id, sender_type, message_type, body, customer_visible,
        operator_id, client_request_id, request_fingerprint, order_version_snapshot, schema_version
      ) VALUES (?, 7, 'OPERATOR', 'GENERAL_REPLY', '<script>alert(1)</script>', 0, 'operator', 'internal-hidden-01', ?, ?, 1)`,
    ).run(orderId, "d".repeat(64), payload.expected_order_version);
    db.prepare(
      `INSERT INTO order_messages (
        order_id, customer_id, sender_type, message_type, body, customer_visible,
        operator_id, client_request_id, request_fingerprint, order_version_snapshot, schema_version
      ) VALUES (?, 7, 'SYSTEM', 'GENERAL_REPLY', '<img src=x onerror=alert(1)>', 0, NULL, 'system-hidden-01', ?, ?, 1)`,
    ).run(orderId, "c".repeat(64), payload.expected_order_version);

    const ownerMessages = listVisibleOrderMessagesForCustomer(db, orderId, 7);
    const otherMessages = listVisibleOrderMessagesForCustomer(db, orderId, 99);
    assert.equal(ownerMessages.length, 1);
    assert.equal(ownerMessages[0].body, "Please confirm the TEST quote.");
    assert.equal(otherMessages.length, 0);
    assert.doesNotMatch(JSON.stringify(ownerMessages), /<script>alert/);
  });
});

test("online confirmation fails closed when write schema is not ready", async () => {
  await withFixture(async ({ dbPath, orderId, url, payload }) => {
    const db = new DatabaseSync(dbPath);
    db.exec("DROP TABLE order_messages");
    db.close();
    const response = await confirmPOST(jsonRequest(url, payload), params(orderId));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "WORKBENCH_WRITE_SCHEMA_NOT_READY");
  });

  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE customers (id INTEGER PRIMARY KEY, is_test_account INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, order_no TEXT, updated_at TEXT, status TEXT, payment_status TEXT, material TEXT, color TEXT, quantity INTEGER);
    CREATE TABLE files (id INTEGER PRIMARY KEY, order_id INTEGER, filesize INTEGER, created_at TEXT, material TEXT, color TEXT, quantity INTEGER);
    CREATE TABLE order_messages (id INTEGER PRIMARY KEY, order_id INTEGER);
    CREATE TABLE operator_order_confirmations (id INTEGER PRIMARY KEY, order_id INTEGER);
    CREATE TABLE operator_order_audit_events (id INTEGER PRIMARY KEY, order_id INTEGER);
    INSERT INTO customers (id, is_test_account) VALUES (1, 1);
    INSERT INTO orders (id, customer_id, order_no, updated_at, status, payment_status, material, color, quantity)
      VALUES (1, 1, 'M3DTEST-SCHEMA', '2026-07-18', 'pending', 'unpaid', 'PLA', 'black', 1);
    INSERT INTO files (id, order_id, filesize, created_at, material, color, quantity)
      VALUES (1, 1, 10, '2026-07-18', 'PLA', 'black', 1);
  `);
  const payload = {
    client_request_id: "phase06:schema-broken",
    expected_order_version: "a".repeat(64),
    confirmed_quote_amount_cents: 100,
    lead_time_min_hours: 1,
    lead_time_max_hours: 2,
    estimated_ship_at: "",
    message_type: "GENERAL_REPLY",
    message_body: "test",
  };
  assert.throws(() => confirmAndReplyToTestOrder(db, 1, payload), /schema is not ready/);
  db.close();
});

test("schema helper is explicit and base initDatabase does not create write tables", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-no-auto-schema-"));
  const dbPath = join(root, "make3d.db");
  try {
    const db = initDatabase(dbPath);
    assert.equal(tableExists(db, "order_messages"), false);
    assert.equal(tableExists(db, "operator_order_confirmations"), false);
    assert.equal(tableExists(db, "operator_order_audit_events"), false);
    db.close();
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function withFixture(run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-confirm-"));
  const dbPath = join(root, "make3d.db");
  const uploadDir = join(root, "uploads");
  const fileContent = "solid model";
  const filePath = join(uploadDir, "model.stl");
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    MAKE3D_LOCAL_WORKBENCH_TOKEN: process.env.MAKE3D_LOCAL_WORKBENCH_TOKEN,
    MAKE3D_WORKER_TOKEN: process.env.MAKE3D_WORKER_TOKEN,
    MAKE3D_LOCAL_WORKBENCH_OPERATOR_ID: process.env.MAKE3D_LOCAL_WORKBENCH_OPERATOR_ID,
  };

  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.UPLOAD_DIR = uploadDir;
  process.env.MAKE3D_LOCAL_WORKBENCH_TOKEN = TOKEN;
  process.env.MAKE3D_WORKER_TOKEN = WORKER_TOKEN;
  process.env.MAKE3D_LOCAL_WORKBENCH_OPERATOR_ID = "local-workbench-test";

  let db;
  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, fileContent);
    db = initDatabase(dbPath);
    applyOrderWorkbenchWriteSchema(db);
    db.prepare(`
      INSERT INTO customers (id, phone, password_hash, name, wechat, email, is_test_account)
      VALUES (?, '13900000007', 'hash', 'Workbench Test Customer', 'wx-fixture', 'email-fixture', ?)
    `).run(options.customerId ?? 7, options.isTest ?? 1);
    createOrderWithFile(db, {
      customerId: options.customerId ?? 7,
      customerName: "Workbench Test",
      phone: "phone-fixture",
      wechat: "wechat-secret",
      email: "email-fixture",
      material: "PLA",
      color: "black",
      quantity: 2,
      estimatedPrice: 12.5,
      file: {
        filename: "model.stl",
        filepath: filePath,
        filesize: fileContent.length,
      },
    });
    const orderId = Number(db.prepare("SELECT id FROM orders LIMIT 1").get().id);
    const payload = {
      client_request_id: "phase06:a4a:test-request",
      expected_order_version: getOrderWorkbenchOrderVersion(db, orderId),
      confirmed_quote_amount_cents: 1234,
      lead_time_min_hours: 12,
      lead_time_max_hours: 24,
      estimated_ship_at: "2026-07-20T10:00:00.000Z",
      message_type: "QUOTE_CONFIRMATION",
      message_body: "Please confirm the TEST quote.",
    };
    await run({
      db,
      dbPath,
      orderId,
      payload,
      url: `https://make3d.test/api/operator/workbench/orders/${orderId}/confirm-and-reply`,
    });
  } finally {
    if (db) db.close();
    restoreEnv(previousEnv);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function createMinimalNullableFlagDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE customers (id INTEGER PRIMARY KEY, is_test_account INTEGER);
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER,
      order_no TEXT,
      updated_at TEXT,
      status TEXT,
      payment_status TEXT,
      material TEXT,
      color TEXT,
      quantity INTEGER,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
    CREATE TABLE files (
      id INTEGER PRIMARY KEY,
      order_id INTEGER,
      filename TEXT,
      filesize INTEGER,
      created_at TEXT,
      material TEXT,
      color TEXT,
      quantity INTEGER,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
    CREATE TABLE customer_service_requests (id INTEGER PRIMARY KEY, order_id INTEGER);
    INSERT INTO customers (id, is_test_account) VALUES (1, NULL);
    INSERT INTO orders (id, customer_id, order_no, updated_at, status, payment_status, material, color, quantity)
      VALUES (1, 1, 'M3D202607180001', '2026-07-18T00:00:00.000Z', 'pending', 'unpaid', 'PLA', 'black', 1);
    INSERT INTO files (id, order_id, filename, filesize, created_at, material, color, quantity)
      VALUES (1, 1, 'model.stl', 10, '2026-07-18T00:00:00.000Z', 'PLA', 'black', 1);
  `);
  return db;
}

function jsonRequest(url, payload, token = TOKEN) {
  return new Request(url, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function params(orderId) {
  return { params: Promise.resolve({ id: String(orderId) }) };
}

function countRows(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}
