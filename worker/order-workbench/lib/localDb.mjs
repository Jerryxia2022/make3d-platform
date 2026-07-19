import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DEFAULT_WORKBENCH_DB_PATH = "/srv/make3d-worker/order-workbench/workbench.db";

export const REVIEW_STATES = new Set([
  "UNREVIEWED",
  "REVIEWING",
  "FILE_PROBLEM",
  "READY_TO_SLICE",
  "SLICING",
  "SLICE_REVIEWED",
  "SLICE_CONFIRMED",
  "SLICE_NEEDS_FIX",
  "QUOTE_DRAFTED",
  "READY_FOR_ONLINE_SYNC",
  "CLOSED",
]);

export const REPLY_TEMPLATES = new Set([
  "FILE_RECEIVED",
  "FILE_CONFIRMED",
  "MODEL_PROBLEM_REUPLOAD",
  "CONFIRM_MATERIAL_COLOR_QUANTITY",
  "QUOTE_MANUAL_CONFIRM",
  "LEAD_TIME_UPDATED",
  "CONFIRM_SUPPORT_OR_APPEARANCE",
  "PLAIN_TEXT",
]);

export async function openWorkbenchDatabase(dbPath = DEFAULT_WORKBENCH_DB_PATH) {
  const resolvedPath = resolve(String(dbPath || DEFAULT_WORKBENCH_DB_PATH));
  await mkdir(dirname(resolvedPath), { recursive: true, mode: 0o750 });
  const db = new DatabaseSync(resolvedPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  migrateWorkbenchDatabase(db);
  return db;
}

export function migrateWorkbenchDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_order_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      order_no TEXT NOT NULL,
      cloud_order_updated_at TEXT,
      state TEXT NOT NULL DEFAULT 'UNREVIEWED'
        CHECK (state IN (
          'UNREVIEWED','REVIEWING','FILE_PROBLEM','READY_TO_SLICE','SLICING',
          'SLICE_REVIEWED','SLICE_CONFIRMED','SLICE_NEEDS_FIX','QUOTE_DRAFTED',
          'READY_FOR_ONLINE_SYNC','CLOSED'
        )),
      selected_file_id INTEGER,
      selected_sync_job_id INTEGER,
      slice_result_id INTEGER,
      suggested_price_cents INTEGER,
      confirmed_price_cents INTEGER,
      lead_time_min_hours INTEGER,
      lead_time_max_hours INTEGER,
      estimated_ship_at TEXT,
      reply_template TEXT,
      reply_draft TEXT,
      operator_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS local_slice_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      order_no TEXT NOT NULL,
      file_id INTEGER NOT NULL,
      sync_job_id INTEGER NOT NULL,
      input_relative_path TEXT NOT NULL,
      input_sha256 TEXT NOT NULL,
      input_size_bytes INTEGER NOT NULL,
      profile_key TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      profile_sha256 TEXT NOT NULL,
      slicer_version TEXT,
      parser_version TEXT NOT NULL,
      status TEXT NOT NULL
        CHECK (status IN ('pending','slicing','parsed','partial','failed')),
      parse_status TEXT,
      metrics_status TEXT,
      parser_quote_ready INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      duration_seconds INTEGER,
      print_time_seconds INTEGER,
      material_weight_grams REAL,
      dimensions_x REAL,
      dimensions_y REAL,
      dimensions_z REAL,
      gcode_relative_path TEXT,
      gcode_size_bytes INTEGER,
      gcode_sha256 TEXT,
      stdout_relative_path TEXT,
      stderr_relative_path TEXT,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      metrics_json TEXT NOT NULL DEFAULT '{}',
      failure_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS local_order_workbench_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      before_summary TEXT,
      after_summary TEXT,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_local_order_reviews_state_updated
      ON local_order_reviews(state, updated_at);

    CREATE INDEX IF NOT EXISTS idx_local_slice_results_order_created
      ON local_slice_results(order_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_local_order_workbench_audit_order_created
      ON local_order_workbench_audit_events(order_id, created_at);
  `);

  for (const [column, definition] of [
    ["online_reference_price_cents", "INTEGER"],
    ["online_reference_updated_at", "TEXT"],
    ["expected_ship_date", "TEXT"],
    ["price_adjustment_reason", "TEXT"],
    ["production_note", "TEXT"],
    ["reply_stale", "INTEGER NOT NULL DEFAULT 0"],
    ["sync_status", "TEXT NOT NULL DEFAULT 'LOCAL_CHANGES'"],
    ["last_sync_at", "TEXT"],
    ["last_sync_request_id_prefix", "TEXT"],
    ["last_sync_error", "TEXT"],
    ["online_order_version", "TEXT"],
    ["local_version", "INTEGER NOT NULL DEFAULT 1"],
    ["dirty_fields_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["last_synced_confirmation_id", "INTEGER"],
    ["last_synced_message_id", "INTEGER"],
  ]) {
    ensureLocalColumn(db, "local_order_reviews", column, definition);
  }
}

export function getOrCreateLocalReview(db, order, patch = {}) {
  const orderId = requirePositiveInteger(order?.id, "order_id");
  const orderNo = requireText(order?.order_no, "order_no", 64);
  const existing = getLocalReviewByOrderId(db, orderId);
  const onlineReferencePriceCents = getOnlineReferencePriceCents(order);
  if (!existing) {
    db.prepare(`
      INSERT INTO local_order_reviews (
        order_id, order_no, cloud_order_updated_at, state, selected_file_id,
        selected_sync_job_id, suggested_price_cents, confirmed_price_cents,
        online_reference_price_cents, online_reference_updated_at, online_order_version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      orderId,
      orderNo,
      normalizeNullableText(order.updated_at || order.created_at, 128),
      patch.state || "UNREVIEWED",
      patch.selected_file_id ?? null,
      patch.selected_sync_job_id ?? null,
      onlineReferencePriceCents,
      onlineReferencePriceCents,
      onlineReferencePriceCents,
      normalizeNullableText(order.updated_at || order.created_at, 128),
      normalizeNullableText(order.order_version, 128),
    );
    insertAuditEvent(db, {
      order_id: orderId,
      action: "review.create",
      before_summary: null,
      after_summary: JSON.stringify({ state: patch.state || "UNREVIEWED" }),
      result: "ok",
    });
  }
  refreshOnlineReference(db, orderId, order);
  const review = updateLocalReview(db, order, patch, { createIfMissing: false });
  return review || getLocalReviewByOrderId(db, orderId);
}

export function getLocalReviewByOrderId(db, orderId) {
  return db.prepare("SELECT * FROM local_order_reviews WHERE order_id = ?").get(requirePositiveInteger(orderId, "order_id")) || null;
}

export function updateLocalReview(db, order, patch = {}, options = {}) {
  const orderId = requirePositiveInteger(order?.id, "order_id");
  const existing = getLocalReviewByOrderId(db, orderId);
  if (!existing && options.createIfMissing !== false) return getOrCreateLocalReview(db, order, patch);
  if (!existing) return null;

  const next = normalizeReviewPatch(patch);
  if (!Object.keys(next).length) return existing;
  const before = summarizeReview(existing);
  const changedFields = Object.keys(next).filter((key) => existing[key] !== next[key]);
  if (!changedFields.length) return existing;
  const dirtyFields = [...new Set([
    ...parseStringArray(existing.dirty_fields_json),
    ...changedFields.filter((key) => !["state", "operator_note"].includes(key)),
  ])];
  const replyBecameStale = Boolean(existing.reply_draft)
    && changedFields.some((key) => ["confirmed_price_cents", "expected_ship_date", "price_adjustment_reason"].includes(key));
  const assignments = Object.keys(next).map((key) => `${key} = @${key}`).join(", ");
  db.prepare(`
    UPDATE local_order_reviews
    SET ${assignments},
        order_no = @order_no,
        cloud_order_updated_at = @cloud_order_updated_at,
        sync_status = 'LOCAL_CHANGES',
        dirty_fields_json = @dirty_fields_json,
        reply_stale = CASE WHEN @reply_became_stale = 1 THEN 1 ELSE reply_stale END,
        local_version = local_version + 1,
        updated_at = datetime('now')
    WHERE order_id = @order_id
  `).run({
    ...next,
    order_id: orderId,
    order_no: requireText(order.order_no, "order_no", 64),
    cloud_order_updated_at: normalizeNullableText(order.updated_at || order.created_at, 128),
    dirty_fields_json: JSON.stringify(dirtyFields),
    reply_became_stale: replyBecameStale ? 1 : 0,
  });
  const updated = getLocalReviewByOrderId(db, orderId);
  insertAuditEvent(db, {
    order_id: orderId,
    action: "review.update",
    before_summary: JSON.stringify(before),
    after_summary: JSON.stringify(summarizeReview(updated)),
    result: "ok",
  });
  return updated;
}

export function markLocalReviewSyncSuccess(db, order, result, clientRequestId) {
  const orderId = requirePositiveInteger(order?.id, "order_id");
  const confirmation = result?.confirmation || null;
  const message = result?.message || null;
  const requestPrefix = createHash("sha256").update(String(clientRequestId || "")).digest("hex").slice(0, 12);
  db.prepare(`
    UPDATE local_order_reviews
    SET sync_status = 'SYNCED',
        last_sync_at = datetime('now'),
        last_sync_request_id_prefix = ?,
        last_sync_error = NULL,
        online_order_version = ?,
        online_reference_price_cents = COALESCE(?, online_reference_price_cents),
        online_reference_updated_at = datetime('now'),
        expected_ship_date = COALESCE(?, expected_ship_date),
        dirty_fields_json = '[]',
        reply_stale = 0,
        last_synced_confirmation_id = ?,
        last_synced_message_id = ?,
        updated_at = datetime('now')
    WHERE order_id = ?
  `).run(
    requestPrefix,
    normalizeNullableText(result?.current_order_version, 128),
    normalizeNullableInteger(confirmation?.confirmed_quote_amount_cents, "confirmed_quote_amount_cents"),
    normalizeNullableText(confirmation?.expected_ship_date, 10),
    normalizeNullableInteger(confirmation?.id, "confirmation_id"),
    normalizeNullableInteger(message?.id, "message_id"),
    orderId,
  );
  insertAuditEvent(db, {
    order_id: orderId,
    action: "online_sync.success",
    before_summary: null,
    after_summary: JSON.stringify({ request_id_prefix: requestPrefix, created: Boolean(result?.created) }),
    result: "ok",
  });
  return getLocalReviewByOrderId(db, orderId);
}

export function markLocalReviewSyncFailure(db, orderId, error, conflict = false) {
  const safeError = sanitizeAuditText(error instanceof Error ? error.message : String(error || "sync failed"));
  db.prepare(`
    UPDATE local_order_reviews
    SET sync_status = ?, last_sync_error = ?, updated_at = datetime('now')
    WHERE order_id = ?
  `).run(conflict ? "CONFLICT" : "SYNC_FAILED", safeError, requirePositiveInteger(orderId, "order_id"));
  insertAuditEvent(db, {
    order_id: orderId,
    action: conflict ? "online_sync.conflict" : "online_sync.failed",
    before_summary: null,
    after_summary: null,
    result: safeError || "failed",
  });
  return getLocalReviewByOrderId(db, orderId);
}

export function createLocalSliceResult(db, input) {
  const row = normalizeSliceResultInput(input);
  db.prepare(`
    INSERT INTO local_slice_results (
      order_id, order_no, file_id, sync_job_id, input_relative_path, input_sha256,
      input_size_bytes, profile_key, profile_name, profile_sha256, parser_version,
      status, started_at, created_at, updated_at
    ) VALUES (
      @order_id, @order_no, @file_id, @sync_job_id, @input_relative_path, @input_sha256,
      @input_size_bytes, @profile_key, @profile_name, @profile_sha256, @parser_version,
      @status, @started_at, datetime('now'), datetime('now')
    )
  `).run(row);
  const id = Number(db.prepare("SELECT last_insert_rowid() AS id").get().id);
  insertAuditEvent(db, {
    order_id: row.order_id,
    action: "slice.create",
    before_summary: null,
    after_summary: JSON.stringify({ id, status: row.status, file_id: row.file_id, sync_job_id: row.sync_job_id }),
    result: "ok",
  });
  return getLocalSliceResultById(db, id);
}

export function updateLocalSliceResult(db, id, patch) {
  const existing = getLocalSliceResultById(db, id);
  if (!existing) throw new Error("local slice result not found");
  const next = normalizeSliceResultPatch(patch);
  if (!Object.keys(next).length) return existing;
  const assignments = Object.keys(next).map((key) => `${key} = @${key}`).join(", ");
  db.prepare(`UPDATE local_slice_results SET ${assignments}, updated_at = datetime('now') WHERE id = @id`).run({ ...next, id });
  const updated = getLocalSliceResultById(db, id);
  insertAuditEvent(db, {
    order_id: updated.order_id,
    action: "slice.update",
    before_summary: JSON.stringify(summarizeSlice(existing)),
    after_summary: JSON.stringify(summarizeSlice(updated)),
    result: updated.status,
  });
  return updated;
}

export function getLocalSliceResultById(db, id) {
  return db.prepare("SELECT * FROM local_slice_results WHERE id = ?").get(requirePositiveInteger(id, "slice_result_id")) || null;
}

export function getLatestSliceResultForReview(db, review) {
  const id = Number(review?.slice_result_id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return getLocalSliceResultById(db, id);
}

export function listLocalOrderOverviews(db, orderIds = []) {
  const ids = [...new Set(orderIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT
      reviews.*,
      slices.status AS slice_status,
      slices.parse_status,
      slices.parser_quote_ready,
      slices.print_time_seconds,
      slices.material_weight_grams,
      slices.failure_summary,
      slices.gcode_size_bytes,
      slices.updated_at AS slice_updated_at
    FROM local_order_reviews AS reviews
    LEFT JOIN local_slice_results AS slices ON slices.id = reviews.slice_result_id
    WHERE reviews.order_id IN (${placeholders})
  `).all(...ids);
  return new Map(rows.map((row) => [Number(row.order_id), row]));
}

export function listAuditEventsForOrder(db, orderId, limit = 20) {
  return db.prepare(`
    SELECT id, order_id, action, before_summary, after_summary, result, created_at
    FROM local_order_workbench_audit_events
    WHERE order_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(requirePositiveInteger(orderId, "order_id"), Math.min(Math.max(Number(limit) || 20, 1), 100));
}

export function insertAuditEvent(db, event) {
  db.prepare(`
    INSERT INTO local_order_workbench_audit_events (
      order_id, action, before_summary, after_summary, result, created_at
    ) VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    requirePositiveInteger(event.order_id, "order_id"),
    requireText(event.action, "action", 80),
    sanitizeAuditText(event.before_summary),
    sanitizeAuditText(event.after_summary),
    requireText(event.result, "result", 80),
  );
}

function normalizeReviewPatch(patch) {
  const next = {};
  if ("state" in patch) {
    const state = requireText(patch.state, "state", 40);
    if (!REVIEW_STATES.has(state)) throw new Error("invalid review state");
    next.state = state;
  }
  for (const key of ["selected_file_id", "selected_sync_job_id", "slice_result_id", "suggested_price_cents", "confirmed_price_cents", "lead_time_min_hours", "lead_time_max_hours"]) {
    if (key in patch) next[key] = normalizeNullableInteger(patch[key], key);
  }
  if (next.lead_time_min_hours != null && next.lead_time_min_hours < 0) throw new Error("lead_time_min_hours must be >= 0");
  if (next.lead_time_max_hours != null && next.lead_time_max_hours < 0) throw new Error("lead_time_max_hours must be >= 0");
  if (next.lead_time_min_hours != null && next.lead_time_max_hours != null && next.lead_time_max_hours < next.lead_time_min_hours) {
    throw new Error("lead_time_max_hours must be >= min");
  }
  if (next.lead_time_max_hours != null && next.lead_time_max_hours > 24 * 90) throw new Error("lead_time_max_hours is too large");
  if (next.suggested_price_cents != null && next.suggested_price_cents < 0) throw new Error("suggested_price_cents must be >= 0");
  if (next.confirmed_price_cents != null && next.confirmed_price_cents < 0) throw new Error("confirmed_price_cents must be >= 0");
  if ("estimated_ship_at" in patch) next.estimated_ship_at = normalizeNullableText(patch.estimated_ship_at, 80);
  if ("expected_ship_date" in patch) next.expected_ship_date = normalizeOptionalDate(patch.expected_ship_date);
  if ("price_adjustment_reason" in patch) next.price_adjustment_reason = normalizeNullableText(patch.price_adjustment_reason, 1000);
  if ("production_note" in patch) next.production_note = normalizeNullableText(patch.production_note, 2000);
  if ("reply_template" in patch) {
    const value = normalizeNullableText(patch.reply_template, 80);
    if (value && !REPLY_TEMPLATES.has(value)) throw new Error("invalid reply template");
    next.reply_template = value;
  }
  if ("reply_draft" in patch) {
    next.reply_draft = normalizeNullableText(patch.reply_draft, 4000);
    next.reply_stale = 0;
  }
  if ("operator_note" in patch) next.operator_note = normalizeNullableText(patch.operator_note, 2000);
  return next;
}

function normalizeSliceResultInput(input) {
  return {
    order_id: requirePositiveInteger(input.order_id, "order_id"),
    order_no: requireText(input.order_no, "order_no", 64),
    file_id: requirePositiveInteger(input.file_id, "file_id"),
    sync_job_id: requirePositiveInteger(input.sync_job_id, "sync_job_id"),
    input_relative_path: requireText(input.input_relative_path, "input_relative_path", 512),
    input_sha256: requireSha(input.input_sha256, "input_sha256"),
    input_size_bytes: requirePositiveInteger(input.input_size_bytes, "input_size_bytes"),
    profile_key: requireText(input.profile_key, "profile_key", 80),
    profile_name: requireText(input.profile_name, "profile_name", 120),
    profile_sha256: requireSha(input.profile_sha256, "profile_sha256"),
    parser_version: requireText(input.parser_version, "parser_version", 80),
    status: input.status || "slicing",
    started_at: normalizeNullableText(input.started_at || new Date().toISOString(), 80),
  };
}

function normalizeSliceResultPatch(patch) {
  const next = {};
  for (const key of ["slicer_version", "parse_status", "metrics_status", "started_at", "completed_at", "gcode_relative_path", "stdout_relative_path", "stderr_relative_path", "failure_summary"]) {
    if (key in patch) next[key] = normalizeNullableText(patch[key], key === "failure_summary" ? 1000 : 512);
  }
  if ("status" in patch) {
    const status = requireText(patch.status, "status", 40);
    if (!["pending", "slicing", "parsed", "partial", "failed"].includes(status)) throw new Error("invalid slice status");
    next.status = status;
  }
  for (const key of ["duration_seconds", "print_time_seconds", "gcode_size_bytes"]) {
    if (key in patch) next[key] = normalizeNullableInteger(patch[key], key);
  }
  for (const key of ["material_weight_grams", "dimensions_x", "dimensions_y", "dimensions_z"]) {
    if (key in patch) next[key] = normalizeNullableNumber(patch[key], key);
  }
  if ("parser_quote_ready" in patch) next.parser_quote_ready = patch.parser_quote_ready ? 1 : 0;
  if ("gcode_sha256" in patch) next.gcode_sha256 = patch.gcode_sha256 ? requireSha(patch.gcode_sha256, "gcode_sha256") : null;
  if ("warnings_json" in patch) next.warnings_json = normalizeJsonText(patch.warnings_json, "warnings_json", 20_000);
  if ("metrics_json" in patch) next.metrics_json = normalizeJsonText(patch.metrics_json, "metrics_json", 80_000);
  return next;
}

function summarizeReview(row) {
  return row ? {
    state: row.state,
    selected_file_id: row.selected_file_id,
    selected_sync_job_id: row.selected_sync_job_id,
    slice_result_id: row.slice_result_id,
    suggested_price_cents: row.suggested_price_cents,
    confirmed_price_cents: row.confirmed_price_cents,
    lead_time_min_hours: row.lead_time_min_hours,
    lead_time_max_hours: row.lead_time_max_hours,
    expected_ship_date: row.expected_ship_date,
    price_adjustment_reason: row.price_adjustment_reason,
    production_note: row.production_note,
    reply_template: row.reply_template,
  } : null;
}

function summarizeSlice(row) {
  return row ? {
    id: row.id,
    status: row.status,
    parse_status: row.parse_status,
    metrics_status: row.metrics_status,
    parser_quote_ready: Boolean(row.parser_quote_ready),
    gcode_size_bytes: row.gcode_size_bytes,
    gcode_sha256_prefix: String(row.gcode_sha256 || "").slice(0, 12),
  } : null;
}

function normalizeNullableInteger(value, name) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${name} must be an integer`);
  return number;
}

function normalizeNullableNumber(value, name) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a number`);
  return number;
}

function normalizeNullableText(value, maxLength) {
  if (value == null || value === "") return null;
  const text = String(value).replace(/\0/g, "").trim();
  if (!text) return null;
  if (text.length > maxLength) throw new Error("text is too long");
  return text;
}

function normalizeOptionalDate(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error("expected_ship_date must use YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("expected_ship_date is invalid");
  }
  return text;
}

function parseStringArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function getOnlineReferencePriceCents(order) {
  for (const value of [order?.final_price, order?.payable_price, order?.estimated_price]) {
    if (value == null || value === "") continue;
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) return Math.round(amount * 100);
  }
  return null;
}

function refreshOnlineReference(db, orderId, order) {
  const reference = getOnlineReferencePriceCents(order);
  const current = getLocalReviewByOrderId(db, orderId);
  if (!current) return;
  const confirmed = current.confirmed_price_cents == null ? reference : current.confirmed_price_cents;
  db.prepare(`
    UPDATE local_order_reviews
    SET online_reference_price_cents = ?,
        online_reference_updated_at = ?,
        suggested_price_cents = ?,
        confirmed_price_cents = ?,
        online_order_version = COALESCE(?, online_order_version),
        cloud_order_updated_at = ?,
        order_no = ?
    WHERE order_id = ?
  `).run(
    reference,
    normalizeNullableText(order.updated_at || order.created_at, 128),
    reference,
    confirmed,
    normalizeNullableText(order.order_version, 128),
    normalizeNullableText(order.updated_at || order.created_at, 128),
    requireText(order.order_no, "order_no", 64),
    orderId,
  );
}

function ensureLocalColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function requireText(value, name, maxLength) {
  const text = normalizeNullableText(value, maxLength);
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function requirePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`);
  return number;
}

function requireSha(value, name) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(`${name} must be sha256`);
  return text;
}

function normalizeJsonText(value, name, maxLength) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (text.length > maxLength) throw new Error(`${name} is too large`);
  JSON.parse(text);
  return text;
}

function sanitizeAuditText(value) {
  if (value == null) return null;
  return String(value)
    .replace(/Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(token|secret|api[_-]?v?3?[_-]?key|private[_-]?key)\s*[:=]\s*["']?[^"',\s]+["']?/gi, "$1=[REDACTED]")
    .replace(/\b1[3-9]\d{9}\b/g, "[REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED]")
    .slice(0, 4000);
}
