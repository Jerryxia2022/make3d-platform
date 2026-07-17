import type { DatabaseSync } from "node:sqlite";
import {
  buildCandidateIdentityHash,
  buildFileSnapshotHash,
  buildQuoteSnapshotHash,
  canonicalizeJson,
} from "./productionCandidateCanonicalJson.ts";
import type {
  ApprovalAction,
  ApprovalAuditRecord,
  ApprovalAuditRecordInput,
  ApprovalOperatorRole,
  ApprovalStatus,
  CandidateStateInput,
  JsonValue,
  ProductionCandidate,
  ProductionCandidateAuditEvent,
  ProductionCandidateEventType,
  ProductionCandidateInput,
  ProductionCandidateStatus,
  ProductionOperatorRole,
} from "./productionCandidateTypes.ts";
import {
  APPROVAL_ACTIONS,
  APPROVAL_OPERATOR_ROLES,
  APPROVAL_STATUSES,
  PRODUCTION_CANDIDATE_EVENT_TYPES,
  PRODUCTION_OPERATOR_ROLES,
} from "./productionCandidateTypes.ts";

const ACTIVE_CANDIDATE_STATUSES = new Set<ProductionCandidateStatus>([
  "CREATED",
  "READY_FOR_PRODUCTION",
  "MANUAL_EXECUTION_STARTED",
]);

const SENSITIVE_KEY_PATTERNS = [
  "workertoken",
  "authorization",
  "openid",
  "phone",
  "mobile",
  "tel",
  "email",
  "paymentno",
  "outtradeno",
  "transactionid",
  "refundid",
  "privatekey",
  "certificate",
  "apiv3key",
  "password",
  "secret",
];

const SENSITIVE_VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /-----BEGIN CERTIFICATE-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bAPIv3\s*key\b/i,
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  /\b(?:openid|transaction_id|out_trade_no|payment_no|refund_id)\b/i,
];

export function assertNoSensitiveApprovalCandidateData(snapshotOrRecord: unknown) {
  visitSensitiveData(snapshotOrRecord, []);
}

export function createApprovalAuditRecord(db: DatabaseSync, input: ApprovalAuditRecordInput) {
  const operatorRole = assertOneOf(
    input.operator_role,
    APPROVAL_OPERATOR_ROLES,
    "operator_role",
  ) as ApprovalOperatorRole;
  const action = assertOneOf(input.action, APPROVAL_ACTIONS, "action") as ApprovalAction;
  const statusBefore = input.approval_status_before == null
    ? null
    : (assertOneOf(input.approval_status_before, APPROVAL_STATUSES, "approval_status_before") as ApprovalStatus);
  const statusAfter = assertOneOf(
    input.approval_status_after,
    APPROVAL_STATUSES,
    "approval_status_after",
  ) as ApprovalStatus;

  const payloads = {
    risk_flags_json: canonicalChecked(input.risk_flags, "risk_flags"),
    order_snapshot_json: canonicalChecked(input.order_snapshot, "order_snapshot"),
    file_snapshot_json: canonicalChecked(input.file_snapshot, "file_snapshot"),
    quote_snapshot_json: canonicalChecked(input.quote_snapshot, "quote_snapshot"),
  };

  const result = db
    .prepare(
      `INSERT INTO approval_audit_records (
        order_id,
        customer_id,
        operator_id,
        operator_role,
        action,
        approval_status_before,
        approval_status_after,
        reason,
        risk_flags_json,
        order_snapshot_json,
        file_snapshot_json,
        quote_snapshot_json,
        snapshot_version,
        client_request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      normalizePositiveInteger(input.order_id, "order_id"),
      input.customer_id ?? null,
      normalizeRequiredText(input.operator_id, "operator_id"),
      operatorRole,
      action,
      statusBefore,
      statusAfter,
      normalizeOptionalText(input.reason),
      payloads.risk_flags_json,
      payloads.order_snapshot_json,
      payloads.file_snapshot_json,
      payloads.quote_snapshot_json,
      normalizeRequiredText(input.snapshot_version, "snapshot_version"),
      normalizeOptionalText(input.client_request_id),
    );

  const row = getApprovalAuditRecordById(db, Number(result.lastInsertRowid));
  return { approval: row, derivedApprovalStatus: row.approval_status_after };
}

export function createProductionCandidateFromApprovedOrder(db: DatabaseSync, input: ProductionCandidateInput) {
  const operatorRole = assertOneOf(
    input.operator_role,
    PRODUCTION_OPERATOR_ROLES,
    "operator_role",
  ) as ProductionOperatorRole;
  const orderId = normalizePositiveInteger(input.order_id, "order_id");
  const approvalId = normalizePositiveInteger(input.approval_id, "approval_id");

  const snapshots = buildCandidateSnapshots(input);
  const fileSnapshotSha256 = buildFileSnapshotHash(input.file_snapshot);
  const quoteSnapshotSha256 = buildQuoteSnapshotHash(input.quote_snapshot);
  const candidateIdentitySha256 = buildCandidateIdentityHash({
    order_id: orderId,
    file_snapshot_sha256: fileSnapshotSha256,
    quote_snapshot_sha256: quoteSnapshotSha256,
  });

  beginImmediate(db);
  try {
    const approval = getApprovalAuditRecordById(db, approvalId);
    const latestApproval = getLatestApprovalAuditRecordForOrder(db, orderId);
    if (approval.order_id !== orderId) throw new Error("approval order_id does not match candidate order_id");
    if (!latestApproval || latestApproval.approval_id !== approval.approval_id) {
      throw new Error("approval is not the latest approval for order");
    }
    if (approval.action !== "approve" || approval.approval_status_after !== "APPROVED") {
      throw new Error("latest approval is not approved");
    }

    const existing = findActiveCandidateByIdentity(db, orderId, fileSnapshotSha256, quoteSnapshotSha256);
    if (existing) {
      db.exec("COMMIT");
      return { candidate: existing, created: false };
    }

    const result = db
      .prepare(
        `INSERT INTO production_candidates (
          approval_id,
          order_id,
          customer_id,
          file_snapshot_json,
          quote_snapshot_json,
          risk_snapshot_json,
          material_snapshot_json,
          color_snapshot_json,
          quantity_snapshot_json,
          profile_snapshot_json,
          file_snapshot_sha256,
          quote_snapshot_sha256,
          candidate_identity_sha256,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        approvalId,
        orderId,
        input.customer_id ?? approval.customer_id ?? null,
        snapshots.file_snapshot_json,
        snapshots.quote_snapshot_json,
        snapshots.risk_snapshot_json,
        snapshots.material_snapshot_json,
        snapshots.color_snapshot_json,
        snapshots.quantity_snapshot_json,
        snapshots.profile_snapshot_json,
        fileSnapshotSha256,
        quoteSnapshotSha256,
        candidateIdentitySha256,
        normalizeRequiredText(input.operator_id, "operator_id"),
      );
    const candidate = getProductionCandidateById(db, Number(result.lastInsertRowid));
    insertCandidateAuditEvent(db, {
      candidateId: candidate.candidate_id,
      eventType: "create",
      operatorId: input.operator_id,
      operatorRole,
      statusBefore: null,
      statusAfter: "CREATED",
      reason: null,
      eventSnapshot: { candidate_identity_sha256: candidate.candidate_identity_sha256 },
      clientRequestId: input.client_request_id ?? null,
    });
    db.exec("COMMIT");
    return { candidate, created: true };
  } catch (error) {
    rollback(db);
    if (isActiveCandidateUniqueConflict(error)) {
      const existing = findActiveCandidateByIdentity(db, orderId, fileSnapshotSha256, quoteSnapshotSha256);
      if (existing) return { candidate: existing, created: false };
    }
    throw error;
  }
}

export function markProductionCandidateReady(db: DatabaseSync, input: CandidateStateInput) {
  return transitionProductionCandidate(db, input, {
    eventType: "mark_ready",
    from: ["CREATED"],
    to: "READY_FOR_PRODUCTION",
  });
}

export function cancelProductionCandidate(db: DatabaseSync, input: CandidateStateInput) {
  return transitionProductionCandidate(db, input, {
    eventType: "cancel",
    from: ["CREATED", "READY_FOR_PRODUCTION", "MANUAL_EXECUTION_STARTED"],
    to: "CANCELLED",
  });
}

export function startManualExecution(db: DatabaseSync, input: CandidateStateInput) {
  return transitionProductionCandidate(db, input, {
    eventType: "manual_start",
    from: ["READY_FOR_PRODUCTION"],
    to: "MANUAL_EXECUTION_STARTED",
  });
}

export function completeProductionCandidate(db: DatabaseSync, input: CandidateStateInput) {
  return transitionProductionCandidate(db, input, {
    eventType: "complete",
    from: ["MANUAL_EXECUTION_STARTED"],
    to: "COMPLETED",
  });
}

export function getApprovalAuditRecordById(db: DatabaseSync, approvalId: number) {
  const row = db
    .prepare("SELECT * FROM approval_audit_records WHERE approval_id = ?")
    .get(approvalId) as ApprovalAuditRecord | undefined;
  if (!row) throw new Error("approval audit record not found");
  return row;
}

export function getProductionCandidateById(db: DatabaseSync, candidateId: number) {
  const row = db
    .prepare("SELECT * FROM production_candidates WHERE candidate_id = ?")
    .get(candidateId) as ProductionCandidate | undefined;
  if (!row) throw new Error("production candidate not found");
  return row;
}

export function listProductionCandidateAuditEvents(db: DatabaseSync, candidateId: number) {
  return db
    .prepare(
      `SELECT *
       FROM production_candidate_audit_events
       WHERE candidate_id = ?
       ORDER BY event_id ASC`,
    )
    .all(candidateId) as ProductionCandidateAuditEvent[];
}

function transitionProductionCandidate(
  db: DatabaseSync,
  input: CandidateStateInput,
  rule: {
    eventType: ProductionCandidateEventType;
    from: ProductionCandidateStatus[];
    to: ProductionCandidateStatus;
  },
) {
  const operatorRole = assertOneOf(
    input.operator_role,
    PRODUCTION_OPERATOR_ROLES,
    "operator_role",
  ) as ProductionOperatorRole;
  const candidateId = normalizePositiveInteger(input.candidate_id, "candidate_id");
  const operatorId = normalizeRequiredText(input.operator_id, "operator_id");
  const eventSnapshot = input.event_snapshot ?? {};
  assertNoSensitiveApprovalCandidateData(eventSnapshot);

  beginImmediate(db);
  try {
    const before = getProductionCandidateById(db, candidateId);
    if (!rule.from.includes(before.status)) {
      throw new Error(`illegal production candidate transition: ${before.status} -> ${rule.to}`);
    }

    const assignments = [
      "status = ?",
      "updated_at = CURRENT_TIMESTAMP",
      rule.to === "CANCELLED" ? "cancelled_at = CURRENT_TIMESTAMP" : null,
      rule.to === "COMPLETED" ? "completed_at = CURRENT_TIMESTAMP" : null,
    ].filter(Boolean);
    db.prepare(`UPDATE production_candidates SET ${assignments.join(", ")} WHERE candidate_id = ?`).run(
      rule.to,
      candidateId,
    );
    insertCandidateAuditEvent(db, {
      candidateId,
      eventType: rule.eventType,
      operatorId,
      operatorRole,
      statusBefore: before.status,
      statusAfter: rule.to,
      reason: input.reason ?? null,
      eventSnapshot,
      clientRequestId: input.client_request_id ?? null,
    });
    const after = getProductionCandidateById(db, candidateId);
    db.exec("COMMIT");
    return after;
  } catch (error) {
    rollback(db);
    throw error;
  }
}

function insertCandidateAuditEvent(
  db: DatabaseSync,
  input: {
    candidateId: number;
    eventType: ProductionCandidateEventType;
    operatorId: string;
    operatorRole: ProductionOperatorRole;
    statusBefore: ProductionCandidateStatus | null;
    statusAfter: ProductionCandidateStatus;
    reason: string | null;
    eventSnapshot: JsonValue;
    clientRequestId: string | null;
  },
) {
  assertOneOf(input.eventType, PRODUCTION_CANDIDATE_EVENT_TYPES, "event_type");
  assertNoSensitiveApprovalCandidateData(input.eventSnapshot);
  db.prepare(
    `INSERT INTO production_candidate_audit_events (
      candidate_id,
      event_type,
      operator_id,
      operator_role,
      status_before,
      status_after,
      reason,
      event_snapshot_json,
      client_request_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.candidateId,
    input.eventType,
    input.operatorId,
    input.operatorRole,
    input.statusBefore,
    input.statusAfter,
    normalizeOptionalText(input.reason),
    canonicalizeJson(input.eventSnapshot),
    normalizeOptionalText(input.clientRequestId),
  );
}

function getLatestApprovalAuditRecordForOrder(db: DatabaseSync, orderId: number) {
  return db
    .prepare(
      `SELECT *
       FROM approval_audit_records
       WHERE order_id = ?
       ORDER BY approval_id DESC
       LIMIT 1`,
    )
    .get(orderId) as ApprovalAuditRecord | undefined;
}

function findActiveCandidateByIdentity(
  db: DatabaseSync,
  orderId: number,
  fileSnapshotSha256: string,
  quoteSnapshotSha256: string,
) {
  const placeholders = [...ACTIVE_CANDIDATE_STATUSES].map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT *
       FROM production_candidates
       WHERE order_id = ?
         AND file_snapshot_sha256 = ?
         AND quote_snapshot_sha256 = ?
         AND status IN (${placeholders})
       ORDER BY candidate_id ASC
       LIMIT 1`,
    )
    .get(orderId, fileSnapshotSha256, quoteSnapshotSha256, ...ACTIVE_CANDIDATE_STATUSES) as
    | ProductionCandidate
    | undefined;
}

function buildCandidateSnapshots(input: ProductionCandidateInput) {
  return {
    file_snapshot_json: canonicalChecked(input.file_snapshot, "file_snapshot"),
    quote_snapshot_json: canonicalChecked(input.quote_snapshot, "quote_snapshot"),
    risk_snapshot_json: canonicalChecked(input.risk_snapshot, "risk_snapshot"),
    material_snapshot_json: canonicalChecked(input.material_snapshot, "material_snapshot"),
    color_snapshot_json: input.color_snapshot == null ? null : canonicalChecked(input.color_snapshot, "color_snapshot"),
    quantity_snapshot_json: canonicalChecked(input.quantity_snapshot, "quantity_snapshot"),
    profile_snapshot_json: canonicalChecked(input.profile_snapshot, "profile_snapshot"),
  };
}

function canonicalChecked(value: JsonValue, label: string) {
  assertNoSensitiveApprovalCandidateData(value);
  try {
    return canonicalizeJson(value);
  } catch (error) {
    throw new Error(`${label} is not canonical JSON compatible: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function visitSensitiveData(value: unknown, path: string[]) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitSensitiveData(item, [...path, String(index)]));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = normalizeKey(key);
      if (isSensitiveKey(normalizedKey)) {
        throw new Error(`sensitive field is not allowed in approval/candidate data: ${[...path, key].join(".")}`);
      }
      visitSensitiveData(child, [...path, key]);
    }
    return;
  }
  if (typeof value === "string" && isSensitiveValue(value)) {
    throw new Error(`sensitive value is not allowed in approval/candidate data at ${path.join(".") || "root"}`);
  }
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(normalizedKey: string) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalizedKey.includes(pattern));
}

function isSensitiveValue(value: string) {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function assertOneOf<T extends readonly string[]>(value: string | null | undefined, allowed: T, field: string) {
  const normalized = normalizeRequiredText(value, field);
  if (!allowed.includes(normalized)) throw new Error(`${field} is not allowed`);
  return normalized;
}

function normalizeRequiredText(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  return value.trim();
}

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("optional text field must be a string");
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePositiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${field} must be a positive integer`);
  return Number(value);
}

function beginImmediate(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
}

function rollback(db: DatabaseSync) {
  try {
    db.exec("ROLLBACK");
  } catch {
    // SQLite can close a transaction automatically after some hard errors.
  }
}

function isActiveCandidateUniqueConflict(error: unknown) {
  return error instanceof Error && /idx_production_candidates_active_identity|UNIQUE constraint failed/i.test(error.message);
}
