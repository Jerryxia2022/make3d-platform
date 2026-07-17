import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCandidateIdentityHash,
  buildFileSnapshotHash,
  buildQuoteSnapshotHash,
  canonicalizeJson,
  hashCanonicalJson,
} from "../src/backend/productionCandidateCanonicalJson.ts";

test("canonical JSON key ordering is stable", () => {
  const first = hashCanonicalJson({ b: 2, a: 1, nested: { z: "last", c: "first" } });
  const second = hashCanonicalJson({ nested: { c: "first", z: "last" }, a: 1, b: 2 });
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("array order is preserved by design and changes the hash", () => {
  const first = hashCanonicalJson({ files: [{ file_id: 1 }, { file_id: 2 }] });
  const second = hashCanonicalJson({ files: [{ file_id: 2 }, { file_id: 1 }] });
  assert.notEqual(first, second);
});

test("null and missing fields have deterministic different representations", () => {
  assert.notEqual(canonicalizeJson({ value: null }), canonicalizeJson({}));
  assert.equal(canonicalizeJson({ value: null }), '{"value":null}');
});

test("integer cents, dimension units, and Chinese text hash stably", () => {
  const snapshot = {
    dimensions_mm: { x: 20, y: 20, z: 20 },
    final_total_cents: 1234,
    material: "PLA",
    note: "中文字段",
  };
  assert.equal(hashCanonicalJson(snapshot), hashCanonicalJson({ note: "中文字段", material: "PLA", final_total_cents: 1234, dimensions_mm: { z: 20, y: 20, x: 20 } }));
});

test("file, quote, and candidate identity hashes are 64 lowercase hex", () => {
  const fileHash = buildFileSnapshotHash({ snapshot_version: "production_file_v1", files: [] });
  const quoteHash = buildQuoteSnapshotHash({ snapshot_version: "production_quote_v1", final_total_cents: 1000 });
  const identity = buildCandidateIdentityHash({
    order_id: 1,
    file_snapshot_sha256: fileHash,
    quote_snapshot_sha256: quoteHash,
  });

  assert.match(fileHash, /^[a-f0-9]{64}$/);
  assert.match(quoteHash, /^[a-f0-9]{64}$/);
  assert.match(identity, /^[a-f0-9]{64}$/);
});
