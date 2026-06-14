import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QUOTE_DRAFT_TTL_MS,
  addQuoteDraftFile,
  createOrderWithFile,
  createCustomerAccount,
  createOrderWithFiles,
  createSliceJob,
  deleteQuoteDraftFile,
  getActiveQuoteDraft,
  getOrderById,
  getOrderByIdForCustomer,
  getBeijingTimestamp,
  getLatestSliceJobByOrderId,
  getPaymentSettings,
  getSliceJobsByOrderId,
  initDatabase,
  listOrders,
  listOrdersByCustomerId,
  markActiveQuoteDraftSubmitted,
  updateQuoteDraftFile,
  updateSliceJobFailure,
  updateSliceJobSuccess,
} from "../src/backend/database.ts";
import {
  MAX_UPLOAD_BYTES,
  isAllowedUploadFilename,
  saveUploadFile,
  validateSavedUploadReference,
} from "../src/backend/uploads.ts";
import {
  consumeUploadRateLimit,
  resetUploadRateLimit,
} from "../src/backend/rateLimit.ts";

test("initializes orders, files, slice_jobs, and payment settings tables", async () => {
  const db = initDatabase(":memory:");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('orders', 'files', 'slice_jobs', 'payment_settings', 'quote_drafts', 'quote_draft_files') ORDER BY name",
    )
    .all()
    .map((row) => row.name);

  assert.deepEqual(tables, [
    "files",
    "orders",
    "payment_settings",
    "quote_draft_files",
    "quote_drafts",
    "slice_jobs",
  ]);

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
    "estimated_price_min",
    "estimated_price_max",
    "estimated_lead_time_min_hours",
    "estimated_lead_time_max_hours",
    "risk_notice",
    "risk_level",
    "requires_manual_confirmation",
    "material_sales_rate",
    "material_cost_rate",
    "quantity",
    "unit_price",
    "subtotal_price",
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
    "packaging_fee",
    "shipping_fee",
    "recipient_name",
    "recipient_phone",
    "address_region",
    "address_detail",
    "shipping_remark",
    "print_fee_total",
    "payable_price",
    "estimated_lead_time_hours",
    "final_price",
    "final_lead_time_hours",
    "price_adjustment_reason",
    "production_note",
    "assigned_printer",
    "estimated_start_at",
    "estimated_finish_at",
    "actual_start_at",
    "actual_finish_at",
    "internal_note",
    "payment_method",
    "payment_confirmed_at",
    "payment_confirmed_by",
    "payment_note",
    "shipping_company",
    "tracking_number",
    "shipped_at",
    "shipping_note",
  ]) {
    assert.equal(orderColumns.includes(column), true);
  }

  const statusLogColumns = db.prepare("PRAGMA table_info(order_status_logs)").all().map((row) => row.name);
  assert.equal(statusLogColumns.includes("note"), true);

  const paymentColumns = db.prepare("PRAGMA table_info(payment_settings)").all().map((row) => row.name);
  for (const column of [
    "wechat_qr_path",
    "alipay_qr_path",
    "xianyu_url",
    "taobao_url",
    "other_note",
  ]) {
    assert.equal(paymentColumns.includes(column), true);
  }

  const sliceJobColumns = db.prepare("PRAGMA table_info(slice_jobs)").all().map((row) => row.name);
  for (const column of [
    "id",
    "order_id",
    "file_id",
    "status",
    "input_file_path",
    "gcode_file_path",
    "material",
    "layer_height",
    "infill_density",
    "need_support",
    "filament_weight_g",
    "print_time_seconds",
    "raw_filament_used_mm",
    "raw_filament_used_cm3",
    "raw_filament_used_g",
    "filament_weight_source",
    "material_density",
    "material_fee",
    "time_fee",
    "estimated_price",
    "error_message",
    "created_at",
    "updated_at",
  ]) {
    assert.equal(sliceJobColumns.includes(column), true);
  }

  const quoteDraftColumns = db.prepare("PRAGMA table_info(quote_drafts)").all().map((row) => row.name);
  for (const column of ["customer_id", "status", "expires_at", "created_at", "updated_at"]) {
    assert.equal(quoteDraftColumns.includes(column), true);
  }

  const quoteDraftFileColumns = db.prepare("PRAGMA table_info(quote_draft_files)").all().map((row) => row.name);
  for (const column of [
    "draft_id",
    "original_filename",
    "filename",
    "filepath",
    "filesize",
    "material",
    "color",
    "quantity",
    "bounding_box_x",
    "bounding_box_y",
    "bounding_box_z",
    "slice_status",
    "filament_weight_g",
    "print_time_seconds",
    "material_fee",
    "time_fee",
    "base_print_price",
  ]) {
    assert.equal(quoteDraftFileColumns.includes(column), true);
  }

  db.close();
});

test("returns payment settings as a plain object for client components", () => {
  const db = initDatabase(":memory:");

  const settings = getPaymentSettings(db);

  assert.equal(Object.getPrototypeOf(settings), Object.prototype);
  assert.deepEqual(settings, {
    wechatQrPath: null,
    alipayQrPath: null,
    xianyuUrl: null,
    taobaoUrl: null,
    otherNote: null,
  });

  db.close();
});

test("saves and loads the latest successful PrusaSlicer quote result", () => {
  const db = initDatabase(":memory:");
  const order = createOrderWithFile(db, {
    customerName: "Jerry",
    phone: "13800000000",
    wechat: "make3d",
    material: "PLA",
    color: "black",
    quantity: 1,
    estimatedPrice: 30,
    file: {
      filename: "slice.stl",
      filepath: "/uploads/slice.stl",
      filesize: 128,
    },
  });
  const detail = getOrderById(db, order.id);
  const file = detail.files[0];
  const jobId = createSliceJob(db, {
    orderId: order.id,
    fileId: file.id,
    inputFilePath: file.filepath,
    gcodeFilePath: "/app/gcode/slice.gcode",
    material: "PLA",
    layerHeight: 0.2,
    infillDensity: 50,
    needSupport: false,
  });

  updateSliceJobSuccess(db, jobId, {
    filamentWeightG: 42.6,
    printTimeSeconds: 5025,
    rawFilamentUsedMm: null,
    rawFilamentUsedCm3: null,
    rawFilamentUsedG: 42.6,
    filamentWeightSource: "g",
    materialDensity: 1.24,
    materialFee: 10.65,
    timeFee: 5,
    estimatedPrice: 18.65,
  });

  const latest = getLatestSliceJobByOrderId(db, order.id);

  assert.equal(latest?.status, "success");
  assert.equal(latest?.filamentWeightG, 42.6);
  assert.equal(latest?.printTimeSeconds, 5025);
  assert.equal(latest?.rawFilamentUsedMm, null);
  assert.equal(latest?.rawFilamentUsedCm3, null);
  assert.equal(latest?.rawFilamentUsedG, 42.6);
  assert.equal(latest?.filamentWeightSource, "g");
  assert.equal(latest?.materialDensity, 1.24);
  assert.equal(latest?.materialFee, 10.65);
  assert.equal(latest?.timeFee, 5);
  assert.equal(latest?.estimatedPrice, 18.65);
  assert.equal(latest?.material, "PLA");
  assert.equal(latest?.layerHeight, 0.2);
  assert.equal(latest?.infillDensity, 50);
  assert.equal(getSliceJobsByOrderId(db, order.id).length, 1);

  db.close();
});

test("saves failed PrusaSlicer quote parsing with clear error message", () => {
  const db = initDatabase(":memory:");
  const order = createOrderWithFile(db, {
    customerName: "Jerry",
    phone: "13800000000",
    wechat: "make3d",
    material: "PLA",
    color: "black",
    quantity: 1,
    estimatedPrice: 30,
    file: {
      filename: "slice.stl",
      filepath: "/uploads/slice.stl",
      filesize: 128,
    },
  });
  const file = getOrderById(db, order.id).files[0];
  const jobId = createSliceJob(db, {
    orderId: order.id,
    fileId: file.id,
    inputFilePath: file.filepath,
    gcodeFilePath: "/app/gcode/slice.gcode",
    material: "PLA",
    layerHeight: 0.2,
    infillDensity: 50,
    needSupport: false,
  });

  updateSliceJobFailure(
    db,
    jobId,
    "切片完成，但未解析到重量/时间，请检查 G-code 输出格式。",
  );

  const latest = getLatestSliceJobByOrderId(db, order.id);

  assert.equal(latest?.status, "failed");
  assert.equal(
    latest?.errorMessage,
    "切片完成，但未解析到重量/时间，请检查 G-code 输出格式。",
  );

  db.close();
});

test("keeps quote drafts for 24 hours and restores saved slice results", () => {
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, {
    phone: "13800000001",
    password: "password123",
    name: "Draft User",
    wechat: "draft-user",
    email: "draft@example.com",
  });
  const now = Date.UTC(2026, 5, 14, 8, 0, 0);

  const file = addQuoteDraftFile(
    db,
    {
      customerId: customer.id,
      originalFilename: "fixture.stl",
      filename: "saved-fixture.stl",
      filepath: "/uploads/saved-fixture.stl",
      filesize: 2048,
      material: "PETG",
      color: "white",
      quantity: 2,
      boundingBoxX: 120.35,
      boundingBoxY: 80.2,
      boundingBoxZ: 35.1,
      sliceStatus: "success",
      filamentWeightG: 42.5,
      printTimeSeconds: 7200,
      rawFilamentUsedMm: null,
      rawFilamentUsedCm3: 34.2,
      rawFilamentUsedG: 42.5,
      filamentWeightSource: "g",
      materialDensity: 1.27,
      materialFee: 10.63,
      timeFee: 12,
      basePrintPrice: 22.63,
    },
    now,
  );

  let draft = getActiveQuoteDraft(db, customer.id, now + 1000);

  assert.equal(draft?.status, "active");
  assert.equal(draft?.files.length, 1);
  assert.equal(draft?.files[0].id, file.id);
  assert.equal(draft?.files[0].sliceStatus, "success");
  assert.equal(draft?.files[0].filamentWeightG, 42.5);
  assert.equal(draft?.files[0].printTimeSeconds, 7200);
  assert.equal(draft?.files[0].boundingBoxX, 120.35);

  updateQuoteDraftFile(
    db,
    customer.id,
    file.id,
    {
      material: "ABS",
      color: "black",
      quantity: 4,
      boundingBoxX: 121,
      boundingBoxY: 81,
      boundingBoxZ: 36,
    },
    now + 2000,
  );
  draft = getActiveQuoteDraft(db, customer.id, now + 3000);

  assert.equal(draft?.files[0].material, "ABS");
  assert.equal(draft?.files[0].color, "black");
  assert.equal(draft?.files[0].quantity, 4);
  assert.equal(draft?.files[0].filamentWeightG, 42.5);
  assert.equal(draft?.files[0].boundingBoxX, 121);
  assert.equal(draft?.expiresAt, now + 2000 + QUOTE_DRAFT_TTL_MS);

  assert.equal(getActiveQuoteDraft(db, customer.id, now + 2000 + QUOTE_DRAFT_TTL_MS + 1), null);

  db.close();
});

test("removes quote draft files and clears active draft after order submit", () => {
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, {
    phone: "13800000002",
    password: "password123",
    name: "Submit User",
    wechat: "submit-user",
    email: "submit@example.com",
  });
  const now = Date.UTC(2026, 5, 14, 9, 0, 0);
  const first = addQuoteDraftFile(
    db,
    {
      customerId: customer.id,
      originalFilename: "first.stl",
      filename: "first-saved.stl",
      filepath: "/uploads/first-saved.stl",
      filesize: 1024,
      material: "PETG",
      color: "white",
      quantity: 1,
      sliceStatus: "success",
      filamentWeightG: 12,
      printTimeSeconds: 1800,
      materialFee: 3,
      timeFee: 4,
      basePrintPrice: 7,
    },
    now,
  );

  assert.equal(deleteQuoteDraftFile(db, customer.id, first.id, now + 1000), true);
  assert.equal(getActiveQuoteDraft(db, customer.id, now + 2000)?.files.length, 0);

  addQuoteDraftFile(
    db,
    {
      customerId: customer.id,
      originalFilename: "second.stl",
      filename: "second-saved.stl",
      filepath: "/uploads/second-saved.stl",
      filesize: 2048,
      material: "PETG",
      color: "white",
      quantity: 1,
      sliceStatus: "success",
      filamentWeightG: 18,
      printTimeSeconds: 2400,
      materialFee: 4,
      timeFee: 5,
      basePrintPrice: 9,
    },
    now + 3000,
  );

  assert.equal(getActiveQuoteDraft(db, customer.id, now + 4000)?.files.length, 1);
  markActiveQuoteDraftSubmitted(db, customer.id, now + 5000);
  assert.equal(getActiveQuoteDraft(db, customer.id, now + 6000), null);

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
    packagingFee: 3,
    shippingFee: 18,
    printFeeTotal: 278,
    payablePrice: 296,
    estimatedLeadTimeHours: 42,
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
        boundingBoxX: 9,
        boundingBoxY: 30,
        boundingBoxZ: 30,
        estimatedPriceMin: 26,
        estimatedPriceMax: 63,
        estimatedLeadTimeMinHours: 4,
        estimatedLeadTimeMaxHours: 8,
        riskNotice: "模型尺寸较小，可能无法稳定打印，需要人工确认。",
        riskLevel: "warning",
        requiresManualConfirmation: false,
        materialSalesRate: 0.25,
        materialCostRate: 0.05,
        quantity: 3,
        unitPrice: 26,
        subtotalPrice: 78,
      },
      {
        filename: "demo-b.step",
        filepath: "/uploads/demo-b.step",
        filesize: 256,
        material: "PETG",
        color: "白",
        boundingBoxX: 260,
        boundingBoxY: 120,
        boundingBoxZ: 80,
        estimatedPriceMin: 21,
        estimatedPriceMax: 95,
        estimatedLeadTimeMinHours: 8,
        estimatedLeadTimeMaxHours: 24,
        riskNotice: "模型超出单台设备成型尺寸，通常需要分件打印，最终报价需人工确认。",
        riskLevel: "danger",
        requiresManualConfirmation: true,
        materialSalesRate: 0.2,
        materialCostRate: 0.03,
        quantity: 2,
        unitPrice: 100,
        subtotalPrice: 200,
      },
    ],
  });

  const detail = getOrderById(db, order.id);
  const [listItem] = listOrders(db);

  assert.match(order.orderNo, /^M3D\d{17}$/);
  assert.match(detail.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  assert.match(detail.files[0].createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  assert.equal(detail.company, null);
  assert.equal(detail.quantity, 2);
  assert.equal(detail.material, "PLA");
  assert.equal(detail.color, "黑");
  assert.equal(detail.estimatedPriceMin, 70);
  assert.equal(detail.estimatedPriceMax, 110);
  assert.equal(detail.estimatedLeadTimeMinHours, 8);
  assert.equal(detail.estimatedLeadTimeMaxHours, 16);
  assert.equal(detail.packagingFee, 3);
  assert.equal(detail.shippingFee, 18);
  assert.equal(detail.printFeeTotal, 278);
  assert.equal(detail.payablePrice, 296);
  assert.equal(detail.estimatedLeadTimeHours, 42);
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
      boundingBoxX: file.boundingBoxX,
      riskLevel: file.riskLevel,
      requiresManualConfirmation: file.requiresManualConfirmation,
      quantity: file.quantity,
      unitPrice: file.unitPrice,
      subtotalPrice: file.subtotalPrice,
    })),
    [
      {
        filename: "demo-a.stl",
        material: "PLA",
        color: "黑",
        boundingBoxX: 9,
        riskLevel: "warning",
        requiresManualConfirmation: false,
        quantity: 3,
        unitPrice: 26,
        subtotalPrice: 78,
      },
      {
        filename: "demo-b.step",
        material: "PETG",
        color: "白",
        boundingBoxX: 260,
        riskLevel: "danger",
        requiresManualConfirmation: true,
        quantity: 2,
        unitPrice: 100,
        subtotalPrice: 200,
      },
    ],
  );

  db.close();
});

test("formats current timestamps as explicit Beijing time", () => {
  const timestamp = getBeijingTimestamp(new Date("2026-06-13T12:30:45.000Z"));

  assert.equal(timestamp, "2026-06-13T20:30:45+08:00");
});

test("lists and loads only orders owned by the current customer", () => {
  const db = initDatabase(":memory:");
  const firstCustomer = createCustomerAccount(db, {
    phone: "13800000000",
    password: "password123",
    name: "Jerry",
    wechat: "make3d",
    email: "jerry@example.com",
  });
  const secondCustomer = createCustomerAccount(db, {
    phone: "13900000000",
    password: "password123",
    name: "Other",
    wechat: "other",
    email: "other@example.com",
  });
  const firstOrder = createOrderWithFiles(db, {
    customerId: firstCustomer.id,
    customerName: "Jerry",
    phone: "13800000000",
    wechat: "make3d",
    email: "jerry@example.com",
    quantity: 2,
    estimatedPrice: 88,
    payablePrice: 88,
    estimatedLeadTimeHours: 36,
    shippingMethod: "普通快递",
    recipientName: "Jerry",
    recipientPhone: "13800000000",
    addressRegion: "-",
    addressDetail: "Xi'an",
    files: [
      {
        filename: "owned.stl",
        filepath: "/uploads/owned.stl",
        filesize: 128,
        material: "PLA",
        color: "黑",
        quantity: 2,
        unitPrice: 39,
        subtotalPrice: 78,
      },
    ],
  });
  createOrderWithFiles(db, {
    customerId: secondCustomer.id,
    customerName: "Other",
    phone: "13900000000",
    wechat: "other",
    email: "other@example.com",
    quantity: 1,
    estimatedPrice: 66,
    payablePrice: 66,
    estimatedLeadTimeHours: 24,
    shippingMethod: "顺丰快递",
    recipientName: "Other",
    recipientPhone: "13900000000",
    addressRegion: "-",
    addressDetail: "Xi'an",
    files: [
      {
        filename: "other.stl",
        filepath: "/uploads/other.stl",
        filesize: 256,
        material: "PETG",
        color: "白",
        quantity: 1,
        unitPrice: 48,
        subtotalPrice: 48,
      },
    ],
  });

  const orders = listOrdersByCustomerId(db, firstCustomer.id);
  const detail = getOrderByIdForCustomer(db, firstOrder.id, firstCustomer.id);

  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, firstOrder.id);
  assert.equal(detail.files.length, 1);
  assert.equal(detail.files[0].filename, "owned.stl");
  assert.throws(() => getOrderByIdForCustomer(db, firstOrder.id, secondCustomer.id), /订单不存在/);

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
    assert.equal(isAllowedUploadFilename("part.3mf"), false);
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

test("validates saved upload references stay inside upload directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "make3d-upload-ref-"));

  try {
    const saved = await saveUploadFile(
      {
        name: "quoted.stl",
        size: 7,
        arrayBuffer: async () => new TextEncoder().encode("solid q").buffer,
      },
      dir,
    );

    await assert.doesNotReject(() => validateSavedUploadReference(saved, dir));
    await assert.rejects(
      () =>
        validateSavedUploadReference(
          {
            ...saved,
            filepath: join(dir, "..", saved.filename),
          },
          dir,
        ),
      /文件信息无效/,
    );
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
