import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type OrderInput = {
  customerId?: number | null;
  customerName: string;
  phone: string;
  wechat: string;
  email?: string;
  company?: string;
  material?: string;
  color?: string;
  quantity: number;
  remark?: string;
  estimatedPrice: number;
  estimatedPriceMin?: number;
  estimatedPriceMax?: number;
  estimatedLeadTimeMinHours?: number;
  estimatedLeadTimeMaxHours?: number;
  packagingFee?: number;
  shippingFee?: number | null;
  shippingMethod?: string;
  shippingFeeEstimate?: string;
  recipientName?: string;
  recipientPhone?: string;
  addressRegion?: string;
  addressDetail?: string;
  shippingRemark?: string;
  printFeeTotal?: number;
  payablePrice?: number;
  estimatedLeadTimeHours?: number;
  files: OrderFileInput[];
};

export type OrderFileInput = {
  filename: string;
  filepath: string;
  filesize: number;
  material: string;
  color: string;
  boundingBoxX?: number | null;
  boundingBoxY?: number | null;
  boundingBoxZ?: number | null;
  estimatedPriceMin?: number;
  estimatedPriceMax?: number;
  estimatedLeadTimeMinHours?: number;
  estimatedLeadTimeMaxHours?: number;
  riskNotice?: string;
  riskLevel?: string;
  requiresManualConfirmation?: boolean;
  materialSalesRate?: number;
  materialCostRate?: number;
  quantity?: number;
  unitPrice?: number | null;
  subtotalPrice?: number | null;
};

export type SingleFileOrderInput = Omit<OrderInput, "files"> & {
  material: string;
  file: {
    filename: string;
    filepath: string;
    filesize: number;
  };
};

export type CreatedOrder = {
  id: number;
  orderNo: string;
};

export type CustomerAccountInput = {
  phone: string;
  password: string;
  name: string;
  wechat: string;
  email?: string;
  defaultAddress?: string;
};

export type CustomerRecord = {
  id: number;
  phone: string;
  passwordHash: string;
  name: string;
  wechat: string;
  email: string | null;
  defaultAddress: string | null;
  createdAt: string;
};

export const ORDER_STATUSES = ["待处理", "已报价", "生产中", "已完成", "已取消"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderFileRecord = {
  id: number;
  orderId: number;
  filename: string;
  filepath: string;
  filesize: number;
  material: string | null;
  color: string | null;
  boundingBoxX: number | null;
  boundingBoxY: number | null;
  boundingBoxZ: number | null;
  volume: number | null;
  surfaceArea: number | null;
  processType: string | null;
  estimatedPriceMin: number | null;
  estimatedPriceMax: number | null;
  estimatedLeadTimeMinHours: number | null;
  estimatedLeadTimeMaxHours: number | null;
  riskNotice: string | null;
  riskLevel: string | null;
  requiresManualConfirmation: boolean;
  materialSalesRate: number | null;
  materialCostRate: number | null;
  quantity: number;
  unitPrice: number | null;
  subtotalPrice: number | null;
  createdAt: string;
};

export type OrderRecord = {
  id: number;
  orderNo: string;
  customerId: number | null;
  customerName: string;
  phone: string;
  wechat: string;
  email: string | null;
  company: string | null;
  material: string;
  color: string | null;
  quantity: number;
  remark: string | null;
  estimatedPrice: number;
  estimatedPriceMin: number | null;
  estimatedPriceMax: number | null;
  estimatedLeadTimeMinHours: number | null;
  estimatedLeadTimeMaxHours: number | null;
  packagingFee: number | null;
  shippingFee: number | null;
  shippingMethod: string | null;
  shippingFeeEstimate: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  addressRegion: string | null;
  addressDetail: string | null;
  shippingRemark: string | null;
  printFeeTotal: number | null;
  payablePrice: number | null;
  estimatedLeadTimeHours: number | null;
  status: OrderStatus;
  createdAt: string;
};

export type OrderDetail = OrderRecord & {
  files: OrderFileRecord[];
  customerOrderCount: number;
};

export type SliceJobStatus = "queued" | "processing" | "success" | "failed";

export type SliceJobInput = {
  orderId: number;
  fileId: number;
  inputFilePath: string;
  gcodeFilePath: string;
  material: string;
  layerHeight: number;
  infillDensity: number;
  needSupport: boolean;
};

export type SliceJobSuccessInput = {
  filamentWeightG: number;
  printTimeSeconds: number;
  rawFilamentUsedMm?: number | null;
  rawFilamentUsedCm3?: number | null;
  rawFilamentUsedG?: number | null;
  filamentWeightSource?: string | null;
  materialDensity?: number | null;
  materialFee: number;
  timeFee: number;
  estimatedPrice: number;
};

export type SliceJobRecord = {
  id: number;
  orderId: number;
  fileId: number;
  status: SliceJobStatus;
  inputFilePath: string;
  gcodeFilePath: string | null;
  material: string | null;
  layerHeight: number | null;
  infillDensity: number | null;
  needSupport: boolean;
  filamentWeightG: number | null;
  printTimeSeconds: number | null;
  rawFilamentUsedMm: number | null;
  rawFilamentUsedCm3: number | null;
  rawFilamentUsedG: number | null;
  filamentWeightSource: string | null;
  materialDensity: number | null;
  materialFee: number | null;
  timeFee: number | null;
  estimatedPrice: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getDatabasePath() {
  return process.env.DATABASE_URL?.replace(/^file:/, "") || join(process.cwd(), "data", "make3d.db");
}

export function initDatabase(dbPath = getDatabasePath()) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      wechat TEXT NOT NULL,
      email TEXT,
      company TEXT,
      material TEXT NOT NULL,
      color TEXT,
      quantity INTEGER NOT NULL,
      remark TEXT,
      estimated_price REAL NOT NULL DEFAULT 0,
      estimated_price_min REAL,
      estimated_price_max REAL,
      estimated_lead_time_min_hours INTEGER,
      estimated_lead_time_max_hours INTEGER,
      packaging_fee REAL,
      shipping_fee REAL,
      shipping_method TEXT,
      shipping_fee_estimate TEXT,
      recipient_name TEXT,
      recipient_phone TEXT,
      address_region TEXT,
      address_detail TEXT,
      shipping_remark TEXT,
      print_fee_total REAL,
      payable_price REAL,
      estimated_lead_time_hours INTEGER,
      status TEXT NOT NULL DEFAULT '待处理',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      wechat TEXT NOT NULL,
      email TEXT,
      default_address TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier_type TEXT NOT NULL,
      identifier TEXT NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 0,
      block_stage INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER,
      permanently_blocked INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(identifier_type, identifier),
      CHECK (identifier_type IN ('phone', 'ip'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      material TEXT,
      color TEXT,
      bounding_box_x REAL,
      bounding_box_y REAL,
      bounding_box_z REAL,
      volume REAL,
      surface_area REAL,
      process_type TEXT,
      estimated_price_min REAL,
      estimated_price_max REAL,
      estimated_lead_time_min_hours INTEGER,
      estimated_lead_time_max_hours INTEGER,
      risk_notice TEXT,
      risk_level TEXT,
      requires_manual_confirmation INTEGER NOT NULL DEFAULT 0,
      material_sales_rate REAL,
      material_cost_rate REAL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL,
      subtotal_price REAL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slice_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      file_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      input_file_path TEXT NOT NULL,
      gcode_file_path TEXT,
      material TEXT,
      layer_height REAL,
      infill_density INTEGER,
      need_support INTEGER NOT NULL DEFAULT 0,
      filament_weight_g REAL,
      print_time_seconds INTEGER,
      raw_filament_used_mm REAL,
      raw_filament_used_cm3 REAL,
      raw_filament_used_g REAL,
      filament_weight_source TEXT,
      material_density REAL,
      material_fee REAL,
      time_fee REAL,
      estimated_price REAL,
      error_message TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      CHECK (status IN ('queued', 'processing', 'success', 'failed'))
    );
  `);
  ensureColumns(db, "orders", [
    ["customer_id", "INTEGER"],
    ["estimated_price_min", "REAL"],
    ["estimated_price_max", "REAL"],
    ["estimated_lead_time_min_hours", "INTEGER"],
    ["estimated_lead_time_max_hours", "INTEGER"],
    ["packaging_fee", "REAL"],
    ["shipping_fee", "REAL"],
    ["shipping_method", "TEXT"],
    ["shipping_fee_estimate", "TEXT"],
    ["recipient_name", "TEXT"],
    ["recipient_phone", "TEXT"],
    ["address_region", "TEXT"],
    ["address_detail", "TEXT"],
    ["shipping_remark", "TEXT"],
    ["print_fee_total", "REAL"],
    ["payable_price", "REAL"],
    ["estimated_lead_time_hours", "INTEGER"],
  ]);
  ensureColumns(db, "files", [
    ["bounding_box_x", "REAL"],
    ["bounding_box_y", "REAL"],
    ["bounding_box_z", "REAL"],
    ["volume", "REAL"],
    ["surface_area", "REAL"],
    ["process_type", "TEXT"],
    ["material", "TEXT"],
    ["color", "TEXT"],
    ["estimated_price_min", "REAL"],
    ["estimated_price_max", "REAL"],
    ["estimated_lead_time_min_hours", "INTEGER"],
    ["estimated_lead_time_max_hours", "INTEGER"],
    ["risk_notice", "TEXT"],
    ["risk_level", "TEXT"],
    ["requires_manual_confirmation", "INTEGER NOT NULL DEFAULT 0"],
    ["material_sales_rate", "REAL"],
    ["material_cost_rate", "REAL"],
    ["quantity", "INTEGER NOT NULL DEFAULT 1"],
    ["unit_price", "REAL"],
    ["subtotal_price", "REAL"],
  ]);
  ensureColumns(db, "slice_jobs", [
    ["order_id", "INTEGER"],
    ["file_id", "INTEGER"],
    ["status", "TEXT NOT NULL DEFAULT 'queued'"],
    ["input_file_path", "TEXT"],
    ["gcode_file_path", "TEXT"],
    ["material", "TEXT"],
    ["layer_height", "REAL"],
    ["infill_density", "INTEGER"],
    ["need_support", "INTEGER NOT NULL DEFAULT 0"],
    ["filament_weight_g", "REAL"],
    ["print_time_seconds", "INTEGER"],
    ["raw_filament_used_mm", "REAL"],
    ["raw_filament_used_cm3", "REAL"],
    ["raw_filament_used_g", "REAL"],
    ["filament_weight_source", "TEXT"],
    ["material_density", "REAL"],
    ["material_fee", "REAL"],
    ["time_fee", "REAL"],
    ["estimated_price", "REAL"],
    ["error_message", "TEXT"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);

  return db;
}

export function openDatabase() {
  return initDatabase();
}

export function createOrderWithFiles(db: DatabaseSync, input: OrderInput): CreatedOrder {
  if (input.files.length === 0) {
    throw new Error("请上传模型文件");
  }

  const firstFile = input.files[0];
  const orderNo = createOrderNo();

  try {
    db.exec("BEGIN");
    const order = db
      .prepare(
        `INSERT INTO orders (
          order_no,
          customer_id,
          customer_name,
          phone,
          wechat,
          email,
          company,
          material,
          color,
          quantity,
          remark,
          estimated_price,
          estimated_price_min,
          estimated_price_max,
          estimated_lead_time_min_hours,
          estimated_lead_time_max_hours,
          packaging_fee,
          shipping_fee,
          shipping_method,
          shipping_fee_estimate,
          recipient_name,
          recipient_phone,
          address_region,
          address_detail,
          shipping_remark,
          print_fee_total,
          payable_price,
          estimated_lead_time_hours,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        orderNo,
        input.customerId ?? null,
        input.customerName,
        input.phone,
        input.wechat,
        input.email || null,
        input.company || null,
        input.material || firstFile.material,
        input.color || firstFile.color || null,
        input.quantity,
        input.remark || null,
        input.estimatedPrice,
        input.estimatedPriceMin ?? null,
        input.estimatedPriceMax ?? null,
        input.estimatedLeadTimeMinHours ?? null,
        input.estimatedLeadTimeMaxHours ?? null,
        input.packagingFee ?? null,
        input.shippingFee ?? null,
        input.shippingMethod || null,
        input.shippingFeeEstimate || null,
        input.recipientName || null,
        input.recipientPhone || null,
        input.addressRegion || null,
        input.addressDetail || null,
        input.shippingRemark || null,
        input.printFeeTotal ?? null,
        input.payablePrice ?? null,
        input.estimatedLeadTimeHours ?? null,
        "待处理",
      );

    const orderId = Number(order.lastInsertRowid);
    const insertFile = db.prepare(
      `INSERT INTO files (
        order_id,
        filename,
        filepath,
        filesize,
        material,
        color,
        bounding_box_x,
        bounding_box_y,
        bounding_box_z,
        estimated_price_min,
        estimated_price_max,
        estimated_lead_time_min_hours,
        estimated_lead_time_max_hours,
        risk_notice,
        risk_level,
        requires_manual_confirmation,
        material_sales_rate,
        material_cost_rate,
        quantity,
        unit_price,
        subtotal_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const file of input.files) {
      insertFile.run(
        orderId,
        file.filename,
        file.filepath,
        file.filesize,
        file.material,
        file.color || null,
        file.boundingBoxX ?? null,
        file.boundingBoxY ?? null,
        file.boundingBoxZ ?? null,
        file.estimatedPriceMin ?? null,
        file.estimatedPriceMax ?? null,
        file.estimatedLeadTimeMinHours ?? null,
        file.estimatedLeadTimeMaxHours ?? null,
        file.riskNotice || null,
        file.riskLevel || null,
        file.requiresManualConfirmation ? 1 : 0,
        file.materialSalesRate ?? null,
        file.materialCostRate ?? null,
        file.quantity ?? 1,
        file.unitPrice ?? null,
        file.subtotalPrice ?? null,
      );
    }

    db.exec("COMMIT");
    return { id: orderId, orderNo };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createOrderWithFile(db: DatabaseSync, input: SingleFileOrderInput): CreatedOrder {
  return createOrderWithFiles(db, {
    ...input,
    estimatedPriceMin: input.estimatedPriceMin ?? input.estimatedPrice,
    estimatedPriceMax: input.estimatedPriceMax ?? input.estimatedPrice,
    files: [
      {
        ...input.file,
        material: input.material,
        color: input.color || "",
        quantity: input.quantity,
        unitPrice: input.estimatedPrice,
        subtotalPrice: input.estimatedPrice,
      },
    ],
  });
}

export function listOrders(db: DatabaseSync): OrderRecord[] {
  return db.prepare(orderSelectSql("ORDER BY created_at DESC")).all() as OrderRecord[];
}

export function getOrderById(db: DatabaseSync, id: number): OrderDetail {
  const order = db.prepare(orderSelectSql("WHERE id = ?")).get(id) as OrderRecord | undefined;

  if (!order) {
    throw new Error("订单不存在");
  }

  const files = db
    .prepare(
      `SELECT
        id,
        order_id AS orderId,
        filename,
        filepath,
        filesize,
        material,
        color,
        bounding_box_x AS boundingBoxX,
        bounding_box_y AS boundingBoxY,
        bounding_box_z AS boundingBoxZ,
        volume,
        surface_area AS surfaceArea,
        process_type AS processType,
        estimated_price_min AS estimatedPriceMin,
        estimated_price_max AS estimatedPriceMax,
        estimated_lead_time_min_hours AS estimatedLeadTimeMinHours,
        estimated_lead_time_max_hours AS estimatedLeadTimeMaxHours,
        risk_notice AS riskNotice,
        risk_level AS riskLevel,
        requires_manual_confirmation AS requiresManualConfirmation,
        material_sales_rate AS materialSalesRate,
        material_cost_rate AS materialCostRate,
        quantity,
        unit_price AS unitPrice,
        subtotal_price AS subtotalPrice,
        created_at AS createdAt
      FROM files
      WHERE order_id = ?
      ORDER BY created_at ASC`,
    )
    .all(id)
    .map(normalizeFileRecord) as OrderFileRecord[];
  const customerOrderCount = order.customerId
    ? Number(
        (db
          .prepare("SELECT COUNT(*) AS count FROM orders WHERE customer_id = ?")
          .get(order.customerId) as { count: number }).count,
      )
    : 0;

  return { ...order, files, customerOrderCount };
}

export function getFileById(db: DatabaseSync, id: number): OrderFileRecord {
  const file = db
    .prepare(
      `SELECT
        id,
        order_id AS orderId,
        filename,
        filepath,
        filesize,
        material,
        color,
        bounding_box_x AS boundingBoxX,
        bounding_box_y AS boundingBoxY,
        bounding_box_z AS boundingBoxZ,
        volume,
        surface_area AS surfaceArea,
        process_type AS processType,
        estimated_price_min AS estimatedPriceMin,
        estimated_price_max AS estimatedPriceMax,
        estimated_lead_time_min_hours AS estimatedLeadTimeMinHours,
        estimated_lead_time_max_hours AS estimatedLeadTimeMaxHours,
        risk_notice AS riskNotice,
        risk_level AS riskLevel,
        requires_manual_confirmation AS requiresManualConfirmation,
        material_sales_rate AS materialSalesRate,
        material_cost_rate AS materialCostRate,
        quantity,
        unit_price AS unitPrice,
        subtotal_price AS subtotalPrice,
        created_at AS createdAt
      FROM files
      WHERE id = ?`,
    )
    .get(id);

  if (!file) {
    throw new Error("文件不存在");
  }

  return normalizeFileRecord(file) as OrderFileRecord;
}

export function updateOrderStatus(db: DatabaseSync, id: number, status: string) {
  if (!isOrderStatus(status)) {
    throw new Error("无效订单状态");
  }

  const result = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  return result.changes > 0;
}

export function createCustomerAccount(db: DatabaseSync, input: CustomerAccountInput) {
  if (!/^1[3-9]\d{9}$/.test(input.phone)) {
    throw new Error("手机号格式不正确");
  }

  if (input.password.length < 8) {
    throw new Error("密码至少8位");
  }

  const result = db
    .prepare(
      `INSERT INTO customers (
        phone,
        password_hash,
        name,
        wechat,
        email,
        default_address
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.phone,
      hashPassword(input.password),
      input.name,
      input.wechat,
      input.email || null,
      input.defaultAddress || null,
    );

  return { id: Number(result.lastInsertRowid), phone: input.phone };
}

export function findCustomerByLogin(db: DatabaseSync, login: string) {
  const normalized = login.trim();
  const customer = db
    .prepare(customerSelectSql("WHERE phone = ? OR email = ? LIMIT 1"))
    .get(normalized, normalized);

  return customer ? normalizeCustomer(customer) : null;
}

export function getCustomerById(db: DatabaseSync, id: number) {
  const customer = db.prepare(customerSelectSql("WHERE id = ? LIMIT 1")).get(id);
  return customer ? normalizeCustomer(customer) : null;
}

export function getCustomerBySessionToken(db: DatabaseSync, token?: string) {
  const session = verifyCustomerSessionTokenForDatabase(token);
  return session ? getCustomerById(db, session.customerId) : null;
}

export function createPasswordResetToken(db: DatabaseSync, customerId: number, now = Date.now()) {
  const recentCount = Number(
    (db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM password_reset_tokens
         WHERE customer_id = ? AND created_at >= ?`,
      )
      .get(customerId, now - 10 * 60 * 1000) as { count: number }).count,
  );

  if (recentCount >= 3) {
    throw new Error("10分钟内最多请求3次重置邮件");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  db.prepare(
    `INSERT INTO password_reset_tokens (
      customer_id,
      token_hash,
      expires_at,
      created_at
    ) VALUES (?, ?, ?, ?)`,
  ).run(customerId, tokenHash, now + 30 * 60 * 1000, now);

  return { token, tokenHash };
}

export function verifyPasswordResetToken(db: DatabaseSync, token: string, now = Date.now()) {
  const record = db
    .prepare(
      `SELECT id, customer_id AS customerId
       FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at >= ?
       LIMIT 1`,
    )
    .get(hashResetToken(token), now) as { id: number; customerId: number } | undefined;

  return record || null;
}

export function consumePasswordResetToken(
  db: DatabaseSync,
  token: string,
  newPassword: string,
  now = Date.now(),
) {
  if (newPassword.length < 8) {
    throw new Error("密码至少8位");
  }

  const record = verifyPasswordResetToken(db, token, now);

  if (!record) {
    return false;
  }

  const passwordHash = hashPassword(newPassword);
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE customers SET password_hash = ? WHERE id = ?").run(passwordHash, record.customerId);
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE customer_id = ?").run(now, record.customerId);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt.${salt}.${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [, salt, hash] = passwordHash.split(".");

  if (!salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash);
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSliceJob(db: DatabaseSync, input: SliceJobInput) {
  const result = db
    .prepare(
      `INSERT INTO slice_jobs (
        order_id,
        file_id,
        status,
        input_file_path,
        gcode_file_path,
        material,
        layer_height,
        infill_density,
        need_support
      ) VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.orderId,
      input.fileId,
      input.inputFilePath,
      input.gcodeFilePath,
      input.material,
      input.layerHeight,
      input.infillDensity,
      input.needSupport ? 1 : 0,
    );

  return Number(result.lastInsertRowid);
}

export function updateSliceJobSuccess(
  db: DatabaseSync,
  id: number,
  input: SliceJobSuccessInput,
) {
  const result = db
    .prepare(
      `UPDATE slice_jobs
       SET status = 'success',
           filament_weight_g = ?,
           print_time_seconds = ?,
           raw_filament_used_mm = ?,
           raw_filament_used_cm3 = ?,
           raw_filament_used_g = ?,
           filament_weight_source = ?,
           material_density = ?,
           material_fee = ?,
           time_fee = ?,
           estimated_price = ?,
           error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      input.filamentWeightG,
      input.printTimeSeconds,
      input.rawFilamentUsedMm ?? null,
      input.rawFilamentUsedCm3 ?? null,
      input.rawFilamentUsedG ?? null,
      input.filamentWeightSource ?? null,
      input.materialDensity ?? null,
      input.materialFee,
      input.timeFee,
      input.estimatedPrice,
      id,
    );

  return result.changes > 0;
}

export function updateSliceJobFailure(db: DatabaseSync, id: number, errorMessage: string) {
  const result = db
    .prepare(
      `UPDATE slice_jobs
       SET status = 'failed',
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(errorMessage, id);

  return result.changes > 0;
}

export function getLatestSliceJobByOrderId(db: DatabaseSync, orderId: number) {
  const job = db
    .prepare(sliceJobSelectSql("WHERE order_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1"))
    .get(orderId);

  return job ? normalizeSliceJobRecord(job) : null;
}

export function getSliceJobsByOrderId(db: DatabaseSync, orderId: number) {
  return db
    .prepare(sliceJobSelectSql("WHERE order_id = ? ORDER BY updated_at DESC, id DESC"))
    .all(orderId)
    .map(normalizeSliceJobRecord) as SliceJobRecord[];
}

function orderSelectSql(suffix: string) {
  return `SELECT
    id,
    order_no AS orderNo,
    customer_id AS customerId,
    customer_name AS customerName,
    phone,
    wechat,
    email,
    company,
    material,
    color,
    quantity,
    remark,
    estimated_price AS estimatedPrice,
    estimated_price_min AS estimatedPriceMin,
    estimated_price_max AS estimatedPriceMax,
    estimated_lead_time_min_hours AS estimatedLeadTimeMinHours,
    estimated_lead_time_max_hours AS estimatedLeadTimeMaxHours,
    packaging_fee AS packagingFee,
    shipping_fee AS shippingFee,
    shipping_method AS shippingMethod,
    shipping_fee_estimate AS shippingFeeEstimate,
    recipient_name AS recipientName,
    recipient_phone AS recipientPhone,
    address_region AS addressRegion,
    address_detail AS addressDetail,
    shipping_remark AS shippingRemark,
    print_fee_total AS printFeeTotal,
    payable_price AS payablePrice,
    estimated_lead_time_hours AS estimatedLeadTimeHours,
    status,
    created_at AS createdAt
  FROM orders
  ${suffix}`;
}

function sliceJobSelectSql(suffix: string) {
  return `SELECT
    id,
    order_id AS orderId,
    file_id AS fileId,
    status,
    input_file_path AS inputFilePath,
    gcode_file_path AS gcodeFilePath,
    material,
    layer_height AS layerHeight,
    infill_density AS infillDensity,
    need_support AS needSupport,
    filament_weight_g AS filamentWeightG,
    print_time_seconds AS printTimeSeconds,
    raw_filament_used_mm AS rawFilamentUsedMm,
    raw_filament_used_cm3 AS rawFilamentUsedCm3,
    raw_filament_used_g AS rawFilamentUsedG,
    filament_weight_source AS filamentWeightSource,
    material_density AS materialDensity,
    material_fee AS materialFee,
    time_fee AS timeFee,
    estimated_price AS estimatedPrice,
    error_message AS errorMessage,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM slice_jobs
  ${suffix}`;
}

function customerSelectSql(suffix: string) {
  return `SELECT
    id,
    phone,
    password_hash AS passwordHash,
    name,
    wechat,
    email,
    default_address AS defaultAddress,
    created_at AS createdAt
  FROM customers
  ${suffix}`;
}

function normalizeCustomer(customer: unknown) {
  return customer as CustomerRecord;
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function verifyCustomerSessionTokenForDatabase(token?: string, now = Date.now()) {
  if (!token) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const [customerIdText, expiresAtText, nonce, signature] = parts;
  const customerId = Number(customerIdText);
  const expiresAt = Number(expiresAtText);

  if (!Number.isInteger(customerId) || customerId <= 0 || !Number.isFinite(expiresAt) || expiresAt < now || !nonce || !signature) {
    return null;
  }

  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    return null;
  }

  const payload = `${customerIdText}.${expiresAtText}.${nonce}`;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest("base64url");
  return safeStringEqual(signature, expectedSignature) ? { customerId } : null;
}

function safeStringEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function normalizeFileRecord(file: unknown) {
  const record = file as Record<string, unknown> & { requiresManualConfirmation: 0 | 1 };
  return {
    ...record,
    requiresManualConfirmation: Boolean(record.requiresManualConfirmation),
  } as OrderFileRecord;
}

function normalizeSliceJobRecord(job: unknown) {
  const record = job as Record<string, unknown> & { needSupport: 0 | 1 };
  return {
    ...record,
    needSupport: Boolean(record.needSupport),
  } as SliceJobRecord;
}

function createOrderNo() {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = String(Math.floor(Math.random() * 1000)).padStart(3, "0");

  return `M3D${timestamp}${suffix}`;
}

function isOrderStatus(status: string): status is OrderStatus {
  return ORDER_STATUSES.includes(status as OrderStatus);
}

function ensureColumns(
  db: DatabaseSync,
  tableName: string,
  requiredColumns: readonly (readonly [string, string])[],
) {
  const existingColumns = new Set(
    (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

  for (const [name, type] of requiredColumns) {
    if (!existingColumns.has(name)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${type}`);
    }
  }
}
