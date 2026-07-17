export const APPROVAL_ACTIONS = ["approve", "reject", "request_change"] as const;
export const APPROVAL_STATUSES = [
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "NEED_CUSTOMER_CONFIRM",
] as const;
export const APPROVAL_OPERATOR_ROLES = ["APPROVAL_OPERATOR", "ADMIN"] as const;

export const PRODUCTION_CANDIDATE_STATUSES = [
  "CREATED",
  "READY_FOR_PRODUCTION",
  "MANUAL_EXECUTION_STARTED",
  "COMPLETED",
  "CANCELLED",
] as const;
export const PRODUCTION_OPERATOR_ROLES = ["PRODUCTION_OPERATOR", "ADMIN"] as const;
export const PRODUCTION_CANDIDATE_EVENT_TYPES = [
  "create",
  "mark_ready",
  "cancel",
  "manual_start",
  "complete",
] as const;

export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type ApprovalOperatorRole = (typeof APPROVAL_OPERATOR_ROLES)[number];
export type ProductionCandidateStatus = (typeof PRODUCTION_CANDIDATE_STATUSES)[number];
export type ProductionOperatorRole = (typeof PRODUCTION_OPERATOR_ROLES)[number];
export type ProductionCandidateEventType = (typeof PRODUCTION_CANDIDATE_EVENT_TYPES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ApprovalAuditRecordInput = {
  order_id: number;
  customer_id?: number | null;
  operator_id: string;
  operator_role: string;
  action: string;
  approval_status_before?: string | null;
  approval_status_after: string;
  reason?: string | null;
  risk_flags: JsonValue;
  order_snapshot: JsonValue;
  file_snapshot: JsonValue;
  quote_snapshot: JsonValue;
  snapshot_version: string;
  client_request_id?: string | null;
};

export type ApprovalAuditRecord = {
  approval_id: number;
  order_id: number;
  customer_id: number | null;
  operator_id: string;
  operator_role: ApprovalOperatorRole;
  action: ApprovalAction;
  approval_status_before: ApprovalStatus | null;
  approval_status_after: ApprovalStatus;
  reason: string | null;
  risk_flags_json: string;
  order_snapshot_json: string;
  file_snapshot_json: string;
  quote_snapshot_json: string;
  snapshot_version: string;
  created_at: string;
  client_request_id: string | null;
};

export type ProductionCandidateInput = {
  approval_id: number;
  order_id: number;
  customer_id?: number | null;
  operator_id: string;
  operator_role: string;
  file_snapshot: JsonValue;
  quote_snapshot: JsonValue;
  risk_snapshot: JsonValue;
  material_snapshot: JsonValue;
  color_snapshot?: JsonValue | null;
  quantity_snapshot: JsonValue;
  profile_snapshot: JsonValue;
  client_request_id?: string | null;
};

export type ProductionCandidate = {
  candidate_id: number;
  approval_id: number;
  order_id: number;
  customer_id: number | null;
  file_snapshot_json: string;
  quote_snapshot_json: string;
  risk_snapshot_json: string;
  material_snapshot_json: string;
  color_snapshot_json: string | null;
  quantity_snapshot_json: string;
  profile_snapshot_json: string;
  file_snapshot_sha256: string;
  quote_snapshot_sha256: string;
  candidate_identity_sha256: string;
  status: ProductionCandidateStatus;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
};

export type ProductionCandidateAuditEvent = {
  event_id: number;
  candidate_id: number;
  event_type: ProductionCandidateEventType;
  operator_id: string;
  operator_role: ProductionOperatorRole;
  status_before: ProductionCandidateStatus | null;
  status_after: ProductionCandidateStatus;
  reason: string | null;
  event_snapshot_json: string;
  created_at: string;
  client_request_id: string | null;
};

export type CandidateStateInput = {
  candidate_id: number;
  operator_id: string;
  operator_role: string;
  reason?: string | null;
  event_snapshot?: JsonValue;
  client_request_id?: string | null;
};
