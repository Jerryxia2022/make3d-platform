import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createOrderWithFile,
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

test("initializes orders and files tables", async () => {
  const db = initDatabase(":memory:");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('orders', 'files') ORDER BY name",
    )
    .all()
    .map((row) => row.name);

  assert.deepEqual(tables, ["files", "orders"]);

  const fileColumns = db.prepare("PRAGMA table_info(files)").all().map((row) => row.name);
  assert.deepEqual(
    [
      "bounding_box_x",
      "bounding_box_y",
      "bounding_box_z",
      "volume",
      "surface_area",
      "process_type",
    ].every((column) => fileColumns.includes(column)),
    true,
  );
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
    color: "白色",
    quantity: 2,
    remark: "测试订单",
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
