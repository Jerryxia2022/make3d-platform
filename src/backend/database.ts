import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type OrderInput = {
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
  createdAt: string;
};

export type OrderRecord = {
  id: number;
  orderNo: string;
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
  status: OrderStatus;
  createdAt: string;
};

export type OrderDetail = OrderRecord & {
  files: OrderFileRecord[];
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
      status TEXT NOT NULL DEFAULT '待处理',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待处理')`,
      )
      .run(
        orderNo,
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
        material_cost_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        created_at AS createdAt
      FROM files
      WHERE order_id = ?
      ORDER BY created_at ASC`,
    )
    .all(id)
    .map(normalizeFileRecord) as OrderFileRecord[];

  return { ...order, files };
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

function orderSelectSql(suffix: string) {
  return `SELECT
    id,
    order_no AS orderNo,
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
    status,
    created_at AS createdAt
  FROM orders
  ${suffix}`;
}

function normalizeFileRecord(file: unknown) {
  const record = file as Record<string, unknown> & { requiresManualConfirmation: 0 | 1 };
  return {
    ...record,
    requiresManualConfirmation: Boolean(record.requiresManualConfirmation),
  } as OrderFileRecord;
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
