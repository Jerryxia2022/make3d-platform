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
  files: Array<{
    filename: string;
    filepath: string;
    filesize: number;
    material: string;
    color: string;
  }>;
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
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);
  ensureFilesModelColumns(db);

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
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待处理')`,
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
      );

    const orderId = Number(order.lastInsertRowid);
    const insertFile = db.prepare(
      `INSERT INTO files (order_id, filename, filepath, filesize, material, color)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    for (const file of input.files) {
      insertFile.run(
        orderId,
        file.filename,
        file.filepath,
        file.filesize,
        file.material,
        file.color || null,
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
  return db
    .prepare(
      `SELECT
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
        status,
        created_at AS createdAt
      FROM orders
      ORDER BY created_at DESC`,
    )
    .all() as OrderRecord[];
}

export function getOrderById(db: DatabaseSync, id: number): OrderDetail {
  const order = db
    .prepare(
      `SELECT
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
        status,
        created_at AS createdAt
      FROM orders
      WHERE id = ?`,
    )
    .get(id) as OrderRecord | undefined;

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
        created_at AS createdAt
      FROM files
      WHERE order_id = ?
      ORDER BY created_at ASC`,
    )
    .all(id) as OrderFileRecord[];

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
        created_at AS createdAt
      FROM files
      WHERE id = ?`,
    )
    .get(id) as OrderFileRecord | undefined;

  if (!file) {
    throw new Error("文件不存在");
  }

  return file;
}

export function updateOrderStatus(db: DatabaseSync, id: number, status: string) {
  if (!isOrderStatus(status)) {
    throw new Error("无效订单状态");
  }

  const result = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  return result.changes > 0;
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

function ensureFilesModelColumns(db: DatabaseSync) {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(files)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  const requiredColumns = [
    ["bounding_box_x", "REAL"],
    ["bounding_box_y", "REAL"],
    ["bounding_box_z", "REAL"],
    ["volume", "REAL"],
    ["surface_area", "REAL"],
    ["process_type", "TEXT"],
    ["material", "TEXT"],
    ["color", "TEXT"],
  ] as const;

  for (const [name, type] of requiredColumns) {
    if (!existingColumns.has(name)) {
      db.exec(`ALTER TABLE files ADD COLUMN ${name} ${type}`);
    }
  }
}
