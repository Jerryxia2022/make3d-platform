import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createOrderWithFile,
  createOrderWithFiles,
  getOrderById,
  initDatabase,
  listOrders,
} from "../src/backend/database.ts";
import {
  MAX_UPLOAD_BYTES,
  isAllowedUploadFilename,
  saveUploadFile,
} from "../src/backend/uploads.ts";
import {
  consumeUploadRateLimit,
  resetUploadRateLimit,
} from "../src/backend/rateLimit.ts";

test("initializes orders and files tables with estimate, shipping, and model option columns", async () => {
  const db = initDatabase(":memory:");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('orders', 'files') ORDER BY name",
    )
    .all()
    .map((row) => row.name);

  assert.deepEqual(tables, ["files", "orders"]);

  const fileColumns = db.prepare("PRAGMA table_info(files)").all().map((row) => row.name);
  for (const column of [
    "bounding_box_x",
    "bounding_box_y",
    "bounding_box_z",
    "volume",
    "surface_area",
    "process_type",
    "material",
    "color",
  ]) {
    assert.equal(fileColumns.includes(column), true);
  }

  const orderColumns = db.prepare("PRAGMA table_info(orders)").all().map((row) => row.name);
  for (const column of [
    "estimated_price_min",
    "estimated_price_max",
    "estimated_lead_time_min_hours",
    "estimated_lead_time_max_hours",
    "shipping_method",
    "shipping_fee_estimate",
    "recipient_name",
    "recipient_phone",
    "address_region",
    "address_detail",
    "shipping_remark",
  ]) {
    assert.equal(orderColumns.includes(column), true);
  }

  db.close();
});

test("creates an order and associated uploaded file record", async () => {
  const db = initDatabase(":memory:");
  const order = createOrderWithFile(db, {
    customerName: "Jerry",
    phone: "13800000000",
    wechat: "make3d",
    email: "jerry@example.com",
    company: "Make3D",
    material: "PLA",
    color: "white",
    quantity: 2,
    remark: "test order",
    estimatedPrice: 30,
    file: {
      filename: "demo.stl",
      filepath: "/uploads/demo.stl",
      filesize: 128,
    },
  });

  assert.match(order.orderNo, /^M3D\d{14}\d{3}$/);
  assert.equal(listOrders(db).length, 1);
  assert.equal(
    db.prepare("SELECT filename FROM files WHERE order_id = ?").get(order.id)
      .filename,
    "demo.stl",
  );

  const modelFields = Object.fromEntries(
    Object.entries(
      db
        .prepare(
          `SELECT bounding_box_x, bounding_box_y, bounding_box_z, volume, surface_area, process_type
           FROM files WHERE order_id = ?`,
        )
        .get(order.id),
    ),
  );
  assert.deepEqual(modelFields, {
    bounding_box_x: null,
    bounding_box_y: null,
    bounding_box_z: null,
    volume: null,
    surface_area: null,
    process_type: null,
  });

  db.close();
});

test("creates one order with multiple uploaded files, estimates, shipping, and per-file options", async () => {
  const db = initDatabase(":memory:");
  const order = createOrderWithFiles(db, {
    customerName: "Jerry",
    phone: "13800000000",
    wechat: "make3d",
    email: "jerry@example.com",
    quantity: 2,
    remark: "multi file order",
    estimatedPrice: 110,
    estimatedPriceMin: 70,
    estimatedPriceMax: 110,
    estimatedLeadTimeMinHours: 8,
    estimatedLeadTimeMaxHours: 16,
    shippingMethod: "顺丰快递",
    shippingFeeEstimate: "18 元起",
    recipientName: "Jerry",
    recipientPhone: "13800000000",
    addressRegion: "陕西省西安市雁塔区",
    addressDetail: "科技路 1 号",
    shippingRemark: "周末送达",
    files: [
      {
        filename: "demo-a.stl",
        filepath: "/uploads/demo-a.stl",
        filesize: 128,
        material: "PLA",
        color: "黑",
      },
      {
        filename: "demo-b.step",
        filepath: "/uploads/demo-b.step",
        filesize: 256,
        material: "PETG",
        color: "白",
      },
    ],
  });

  const detail = getOrderById(db, order.id);
  const [listItem] = listOrders(db);

  assert.equal(detail.company, null);
  assert.equal(detail.quantity, 2);
  assert.equal(detail.material, "PLA");
  assert.equal(detail.color, "黑");
  assert.equal(detail.estimatedPriceMin, 70);
  assert.equal(detail.estimatedPriceMax, 110);
  assert.equal(detail.estimatedLeadTimeMinHours, 8);
  assert.equal(detail.estimatedLeadTimeMaxHours, 16);
  assert.equal(detail.shippingMethod, "顺丰快递");
  assert.equal(detail.shippingFeeEstimate, "18 元起");
  assert.equal(detail.recipientName, "Jerry");
  assert.equal(detail.recipientPhone, "13800000000");
  assert.equal(detail.addressRegion, "陕西省西安市雁塔区");
  assert.equal(detail.addressDetail, "科技路 1 号");
  assert.equal(detail.shippingRemark, "周末送达");
  assert.equal(listItem.estimatedPriceMin, 70);
  assert.equal(listItem.shippingMethod, "顺丰快递");
  assert.deepEqual(
    detail.files.map((file) => ({
      filename: file.filename,
      material: file.material,
      color: file.color,
    })),
    [
      { filename: "demo-a.stl", material: "PLA", color: "黑" },
      { filename: "demo-b.step", material: "PETG", color: "白" },
    ],
  );

  db.close();
});

test("preserves distinct customer contact fields in list and detail views", () => {
  const db = initDatabase(":memory:");
  const order = createOrderWithFile(db, {
    customerName: "customer-zhangsan",
    phone: "13911112222",
    wechat: "wechat-zhangsan",
    email: "zhangsan@example.com",
    company: "zhangsan-tech",
    material: "PETG",
    color: "black",
    quantity: 3,
    remark: "mapping test",
    estimatedPrice: 85,
    file: {
      filename: "mapping.stl",
      filepath: "/uploads/mapping.stl",
      filesize: 256,
    },
  });

  const [listItem] = listOrders(db);
  const detail = getOrderById(db, order.id);

  assert.equal(listItem.customerName, "customer-zhangsan");
  assert.equal(listItem.phone, "13911112222");
  assert.equal(listItem.wechat, "wechat-zhangsan");
  assert.equal(listItem.email, "zhangsan@example.com");
  assert.equal(listItem.company, "zhangsan-tech");
  assert.equal(detail.customerName, "customer-zhangsan");
  assert.equal(detail.phone, "13911112222");
  assert.equal(detail.wechat, "wechat-zhangsan");
  assert.equal(detail.email, "zhangsan@example.com");
  assert.equal(detail.company, "zhangsan-tech");

  db.close();
});

test("validates upload extensions and size, then saves accepted file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "make3d-upload-"));

  try {
    assert.equal(MAX_UPLOAD_BYTES, 50 * 1024 * 1024);
    assert.equal(isAllowedUploadFilename("part.stl"), true);
    assert.equal(isAllowedUploadFilename("part.step"), true);
    assert.equal(isAllowedUploadFilename("part.stp"), true);
    assert.equal(isAllowedUploadFilename("part.3mf"), true);
    assert.equal(isAllowedUploadFilename("part.obj"), false);

    const saved = await saveUploadFile(
      {
        name: "fixture.stl",
        size: 5,
        arrayBuffer: async () => new TextEncoder().encode("solid").buffer,
      },
      dir,
    );

    assert.equal(saved.filesize, 5);
    assert.match(saved.filename, /\.stl$/);
    assert.equal(await readFile(saved.filepath, "utf8"), "solid");
    assert.equal((await stat(saved.filepath)).size, 5);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("limits uploads from the same IP to 10 requests per 10 minutes", () => {
  resetUploadRateLimit();

  for (let index = 0; index < 10; index += 1) {
    assert.equal(consumeUploadRateLimit("203.0.113.10").allowed, true);
  }

  const blocked = consumeUploadRateLimit("203.0.113.10");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.status, 429);

  assert.equal(consumeUploadRateLimit("203.0.113.11").allowed, true);
  resetUploadRateLimit();
});
