import type { DatabaseSync } from "node:sqlite";

export const ORDER_WORKBENCH_WRITE_SCHEMA_VERSION = 1;

export const ORDER_MESSAGE_TYPES = [
  "TEXT",
  "FILE_RECEIVED",
  "FILE_CONFIRMED",
  "FILE_PROBLEM",
  "REUPLOAD_REQUIRED",
  "MATERIAL_CONFIRM_REQUIRED",
  "QUOTE_CONFIRMATION",
  "LEAD_TIME_CONFIRMATION",
  "GENERAL_REPLY",
] as const;

export const ORDER_MESSAGE_SENDERS = ["CUSTOMER", "OPERATOR", "SYSTEM"] as const;

export function applyOrderWorkbenchWriteSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL
        CHECK (sender_type IN ('CUSTOMER','OPERATOR','SYSTEM')),
      message_type TEXT NOT NULL
        CHECK (message_type IN (
          'TEXT','FILE_RECEIVED','FILE_CONFIRMED','FILE_PROBLEM','REUPLOAD_REQUIRED',
          'MATERIAL_CONFIRM_REQUIRED','QUOTE_CONFIRMATION','LEAD_TIME_CONFIRMATION','GENERAL_REPLY'
        )),
      body TEXT NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 4000),
      customer_visible INTEGER NOT NULL DEFAULT 0 CHECK (customer_visible IN (0, 1)),
      operator_id TEXT,
      client_request_id TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      order_version_snapshot TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS operator_order_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      confirmed_quote_amount_cents INTEGER NOT NULL
        CHECK (confirmed_quote_amount_cents >= 0),
      lead_time_min_hours INTEGER NOT NULL CHECK (lead_time_min_hours >= 0),
      lead_time_max_hours INTEGER NOT NULL CHECK (lead_time_max_hours >= lead_time_min_hours),
      estimated_ship_at TEXT,
      operator_note TEXT,
      operator_id TEXT NOT NULL,
      client_request_id TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      order_version_snapshot TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS operator_order_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      operator_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_summary TEXT,
      after_summary TEXT,
      client_request_id TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      result TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_order_messages_customer_visible
      ON order_messages(customer_id, order_id, customer_visible, created_at, id);

    CREATE INDEX IF NOT EXISTS idx_order_messages_order_created
      ON order_messages(order_id, created_at, id);

    CREATE INDEX IF NOT EXISTS idx_order_messages_customer_created
      ON order_messages(customer_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_order_messages_client_request
      ON order_messages(client_request_id);

    CREATE INDEX IF NOT EXISTS idx_order_confirmations_order_created
      ON operator_order_confirmations(order_id, created_at, id);

    CREATE INDEX IF NOT EXISTS idx_order_confirmations_client_request
      ON operator_order_confirmations(client_request_id);

    CREATE INDEX IF NOT EXISTS idx_order_audit_events_order_created
      ON operator_order_audit_events(order_id, created_at, id);

    CREATE INDEX IF NOT EXISTS idx_order_audit_events_client_request
      ON operator_order_audit_events(client_request_id);
  `);

  ensureColumn(db, "operator_order_confirmations", "expected_ship_date", "TEXT");
  ensureColumn(db, "operator_order_confirmations", "price_adjustment_reason", "TEXT");
  ensureColumn(db, "operator_order_confirmations", "production_note", "TEXT");
}

export function verifyOrderWorkbenchWriteSchema(db: DatabaseSync) {
  const required = {
    order_messages: [
      "id",
      "order_id",
      "customer_id",
      "sender_type",
      "message_type",
      "body",
      "customer_visible",
      "operator_id",
      "client_request_id",
      "request_fingerprint",
      "order_version_snapshot",
      "schema_version",
      "created_at",
    ],
    operator_order_confirmations: [
      "id",
      "order_id",
      "customer_id",
      "confirmed_quote_amount_cents",
      "lead_time_min_hours",
      "lead_time_max_hours",
      "estimated_ship_at",
      "expected_ship_date",
      "price_adjustment_reason",
      "production_note",
      "operator_note",
      "operator_id",
      "client_request_id",
      "request_fingerprint",
      "order_version_snapshot",
      "schema_version",
      "created_at",
    ],
    operator_order_audit_events: [
      "id",
      "order_id",
      "operator_id",
      "action",
      "before_summary",
      "after_summary",
      "client_request_id",
      "request_fingerprint",
      "result",
      "schema_version",
      "created_at",
    ],
  };
  const requiredIndexes = [
    "idx_order_messages_customer_visible",
    "idx_order_messages_order_created",
    "idx_order_messages_customer_created",
    "idx_order_messages_client_request",
    "idx_order_confirmations_order_created",
    "idx_order_confirmations_client_request",
    "idx_order_audit_events_order_created",
    "idx_order_audit_events_client_request",
  ];
  const reasons: string[] = [];

  for (const [table, columns] of Object.entries(required)) {
    const sql = getCreateSql(db, "table", table);
    if (!sql) {
      reasons.push(`missing table ${table}`);
      continue;
    }
    for (const token of ["CHECK", "FOREIGN KEY", "UNIQUE", "schema_version"]) {
      if (!sql.toUpperCase().includes(token.toUpperCase())) reasons.push(`${table} missing ${token}`);
    }
    const existingColumns = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name),
    );
    for (const column of columns) {
      if (!existingColumns.has(column)) reasons.push(`${table} missing column ${column}`);
    }
  }

  for (const index of requiredIndexes) {
    if (!getCreateSql(db, "index", index)) reasons.push(`missing index ${index}`);
  }

  return {
    ok: reasons.length === 0,
    version: ORDER_WORKBENCH_WRITE_SCHEMA_VERSION,
    reasons,
  };
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function getCreateSql(db: DatabaseSync, type: "table" | "index", name: string) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = ? AND name = ?")
    .get(type, name) as { sql: string | null } | undefined;
  return row?.sql || "";
}
