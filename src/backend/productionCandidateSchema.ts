import type { DatabaseSync } from "node:sqlite";

export function applyApprovalCandidateSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_audit_records (
      approval_id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      customer_id INTEGER,
      operator_id TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      action TEXT NOT NULL,
      approval_status_before TEXT,
      approval_status_after TEXT NOT NULL,
      reason TEXT,
      risk_flags_json TEXT NOT NULL,
      order_snapshot_json TEXT NOT NULL,
      file_snapshot_json TEXT NOT NULL,
      quote_snapshot_json TEXT NOT NULL,
      snapshot_version TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      client_request_id TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      CHECK (operator_role IN ('APPROVAL_OPERATOR', 'ADMIN')),
      CHECK (action IN ('approve', 'reject', 'request_change')),
      CHECK (
        approval_status_before IS NULL OR
        approval_status_before IN (
          'PENDING_REVIEW',
          'APPROVED',
          'REJECTED',
          'NEED_CUSTOMER_CONFIRM'
        )
      ),
      CHECK (approval_status_after IN (
        'PENDING_REVIEW',
        'APPROVED',
        'REJECTED',
        'NEED_CUSTOMER_CONFIRM'
      ))
    );

    CREATE INDEX IF NOT EXISTS idx_approval_audit_records_order_created
    ON approval_audit_records(order_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_approval_audit_records_customer_created
    ON approval_audit_records(customer_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_approval_audit_records_client_request
    ON approval_audit_records(client_request_id);

    CREATE TABLE IF NOT EXISTS production_candidates (
      candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      customer_id INTEGER,
      file_snapshot_json TEXT NOT NULL,
      quote_snapshot_json TEXT NOT NULL,
      risk_snapshot_json TEXT NOT NULL,
      material_snapshot_json TEXT NOT NULL,
      color_snapshot_json TEXT,
      quantity_snapshot_json TEXT NOT NULL,
      profile_snapshot_json TEXT NOT NULL,
      file_snapshot_sha256 TEXT NOT NULL,
      quote_snapshot_sha256 TEXT NOT NULL,
      candidate_identity_sha256 TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT,
      cancelled_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (approval_id) REFERENCES approval_audit_records(approval_id) ON DELETE RESTRICT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      CHECK (length(file_snapshot_sha256) = 64),
      CHECK (length(quote_snapshot_sha256) = 64),
      CHECK (length(candidate_identity_sha256) = 64),
      CHECK (status IN (
        'CREATED',
        'READY_FOR_PRODUCTION',
        'MANUAL_EXECUTION_STARTED',
        'COMPLETED',
        'CANCELLED'
      ))
    );

    CREATE INDEX IF NOT EXISTS idx_production_candidates_order_created
    ON production_candidates(order_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_production_candidates_customer_created
    ON production_candidates(customer_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_production_candidates_status_created
    ON production_candidates(status, created_at);

    CREATE INDEX IF NOT EXISTS idx_production_candidates_approval
    ON production_candidates(approval_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_production_candidates_active_identity
    ON production_candidates(order_id, file_snapshot_sha256, quote_snapshot_sha256)
    WHERE status IN (
      'CREATED',
      'READY_FOR_PRODUCTION',
      'MANUAL_EXECUTION_STARTED'
    );

    CREATE TABLE IF NOT EXISTS production_candidate_audit_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      status_before TEXT,
      status_after TEXT NOT NULL,
      reason TEXT,
      event_snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      client_request_id TEXT,
      FOREIGN KEY (candidate_id) REFERENCES production_candidates(candidate_id) ON DELETE RESTRICT,
      CHECK (operator_role IN ('PRODUCTION_OPERATOR', 'ADMIN')),
      CHECK (event_type IN (
        'create',
        'mark_ready',
        'cancel',
        'manual_start',
        'complete'
      )),
      CHECK (
        status_before IS NULL OR
        status_before IN (
          'CREATED',
          'READY_FOR_PRODUCTION',
          'MANUAL_EXECUTION_STARTED',
          'COMPLETED',
          'CANCELLED'
        )
      ),
      CHECK (status_after IN (
        'CREATED',
        'READY_FOR_PRODUCTION',
        'MANUAL_EXECUTION_STARTED',
        'COMPLETED',
        'CANCELLED'
      ))
    );

    CREATE INDEX IF NOT EXISTS idx_candidate_audit_events_candidate_created
    ON production_candidate_audit_events(candidate_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_candidate_audit_events_client_request
    ON production_candidate_audit_events(client_request_id);
  `);
}
