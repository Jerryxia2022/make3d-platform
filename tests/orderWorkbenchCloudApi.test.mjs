import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createOrderWithFile, initDatabase } from "../src/backend/database.ts";
import * as listRoute from "../src/app/api/operator/workbench/orders/route.ts";
import { GET as listGET } from "../src/app/api/operator/workbench/orders/route.ts";
import { GET as detailGET } from "../src/app/api/operator/workbench/orders/[id]/route.ts";

const TOKEN = "phase06-local-workbench-token";

test("operator workbench API rejects missing and wrong tokens", async () => {
  await withFixture(async ({ listUrl }) => {
    assert.equal((await listGET(new Request(listUrl))).status, 401);
    assert.equal((await listGET(authRequest(listUrl, "wrong-token"))).status, 401);
    assert.equal((await listGET(authRequest(listUrl, "phase06-worker-token"))).status, 401);
  });
});

test("operator workbench API exposes GET only", () => {
  assert.equal("POST" in listRoute, false);
  assert.equal("PUT" in listRoute, false);
  assert.equal("PATCH" in listRoute, false);
  assert.equal("DELETE" in listRoute, false);
});

test("operator workbench API returns allowlisted order and detail payloads", async () => {
  await withFixture(async ({ listUrl, orderId, detailUrl }) => {
    const list = await listGET(authRequest(listUrl));
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.orders.length, 1);
    assert.equal(listBody.orders[0].id, orderId);
    assert.equal(listBody.orders[0].file_count, 1);
    assert.equal(listBody.orders[0].file_sync_summary.status, "verified");
    assert.equal(listBody.orders[0].is_test_account, true);
    assert.deepEqual(listBody.orders[0].test_classification.reasons, ["customer_is_test_account"]);

    const detail = await detailGET(authRequest(detailUrl), params(orderId));
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.order.order_no, listBody.orders[0].order_no);
    assert.equal(detailBody.order.is_test_account, true);
    assert.deepEqual(detailBody.order.test_classification.reasons, ["customer_is_test_account"]);
    assert.equal(detailBody.files.length, 1);
    assert.equal(detailBody.files[0].relative_path, "M3DTEST/1-model.stl");
    assert.equal(detailBody.files[0].expected_sha256, sha256("solid model"));
    assert.equal(detailBody.customer_service_requests.length, 1);

    const serialized = JSON.stringify(detailBody);
    assert.doesNotMatch(serialized, /phone-fixture|worker-token|Authorization|payment_no|out_trade_no|transaction_id|openid/i);
    assert.doesNotMatch(serialized, /\/srv\/make3d-worker\/files/);
    assert.doesNotMatch(serialized, /uploads/);
  });
});

test("operator workbench API does not accept query string tokens", async () => {
  await withFixture(async ({ listUrl }) => {
    const response = await listGET(new Request(`${listUrl}?token=${TOKEN}`));
    assert.equal(response.status, 401);
  });
});

async function withFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-api-"));
  const dbPath = join(root, "make3d.db");
  const uploadDir = join(root, "uploads");
  const fileContent = "solid model";
  const filePath = join(uploadDir, "model.stl");
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    MAKE3D_LOCAL_WORKBENCH_TOKEN: process.env.MAKE3D_LOCAL_WORKBENCH_TOKEN,
    MAKE3D_WORKER_TOKEN: process.env.MAKE3D_WORKER_TOKEN,
  };

  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.UPLOAD_DIR = uploadDir;
  process.env.MAKE3D_LOCAL_WORKBENCH_TOKEN = TOKEN;
  process.env.MAKE3D_WORKER_TOKEN = "phase06-worker-token";

  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, fileContent);
    const db = initDatabase(dbPath);
    db.prepare(`
      INSERT INTO customers (id, phone, password_hash, name, wechat, email, is_test_account)
      VALUES (7, '13900000007', 'hash', 'Workbench Test Customer', 'wx-fixture', 'email-fixture', 1)
    `).run();
    createOrderWithFile(db, {
      customerId: 7,
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
    const orderId = Number((db.prepare("SELECT id FROM orders LIMIT 1").get()).id);
    const fileId = Number((db.prepare("SELECT id FROM files LIMIT 1").get()).id);
    const jobId = Number((db.prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = ?").get(fileId)).id);
    db.prepare(
      `UPDATE local_file_sync_jobs
       SET sync_status = 'verified',
           sha256 = ?,
           local_path = ?,
           local_sha256 = ?,
           local_synced_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      sha256(fileContent),
      "/srv/make3d-worker/files/M3DTEST/1-model.stl",
      sha256(fileContent),
      jobId,
    );
    db.prepare(
      `INSERT INTO customer_service_requests (
        customer_id, phone, order_id, message, status, source, category, customer_visible_reply
      ) VALUES (NULL, ?, ?, ?, 'pending', 'web', 'order', ?)`,
    ).run("phone-fixture", orderId, "客户留言", "客服可见回复");
    db.close();

    await run({
      orderId,
      listUrl: "https://make3d.test/api/operator/workbench/orders",
      detailUrl: `https://make3d.test/api/operator/workbench/orders/${orderId}`,
    });
  } finally {
    restoreEnv(previousEnv);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function authRequest(url, token = TOKEN) {
  return new Request(url, { headers: { Authorization: `Bearer ${token}` } });
}

function params(orderId) {
  return { params: Promise.resolve({ id: String(orderId) }) };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}
