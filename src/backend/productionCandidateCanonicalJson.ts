import { createHash } from "node:crypto";
import type { JsonValue } from "./productionCandidateTypes.ts";

export function canonicalizeJson(value: JsonValue): string {
  return serializeCanonical(value);
}

export function sha256Hex(bufferOrString: Buffer | string) {
  return createHash("sha256").update(bufferOrString).digest("hex");
}

export function hashCanonicalJson(value: JsonValue) {
  return sha256Hex(canonicalizeJson(value));
}

export function buildFileSnapshotHash(fileSnapshot: JsonValue) {
  return hashCanonicalJson(fileSnapshot);
}

export function buildQuoteSnapshotHash(quoteSnapshot: JsonValue) {
  return hashCanonicalJson(quoteSnapshot);
}

export function buildCandidateIdentityHash(input: {
  order_id: number;
  file_snapshot_sha256: string;
  quote_snapshot_sha256: string;
}) {
  assertSha256Hex(input.file_snapshot_sha256, "file_snapshot_sha256");
  assertSha256Hex(input.quote_snapshot_sha256, "quote_snapshot_sha256");
  return hashCanonicalJson({
    candidate_identity_version: "production_candidate_identity_v1",
    file_snapshot_sha256: input.file_snapshot_sha256,
    order_id: input.order_id,
    quote_snapshot_sha256: input.quote_snapshot_sha256,
  });
}

function serializeCanonical(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON does not allow non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => serializeCanonical(item)).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serializeCanonical(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`unsupported canonical JSON value type: ${typeof value}`);
}

function assertSha256Hex(value: string, field: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field} must be 64 lowercase hex characters`);
}
