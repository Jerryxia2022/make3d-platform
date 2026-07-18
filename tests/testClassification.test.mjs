import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyTestSubject as classifyBackend } from "../src/backend/testClassification.ts";
import { classifyTestSubject as classifyScript } from "../scripts/lib/testClassification.mjs";

const CASES = [
  {
    name: "real customer with authoritative false flag",
    input: { customerId: 7, customerIsTestAccount: 0, sourceMarkers: ["M3D202607180001"] },
    expected: { isTest: false, authoritativeTestFlag: false, failClosed: false },
  },
  {
    name: "customer id is not 5 but authoritative flag is test",
    input: { customerId: 7, customerIsTestAccount: 1, sourceMarkers: ["M3D202607180001"] },
    expected: { isTest: true, authoritativeTestFlag: true, failClosed: false },
  },
  {
    name: "source marker blocks even when customer flag is false",
    input: { customerId: 8, customerIsTestAccount: 0, sourceMarkers: ["PHASE05_K_D_TEST"] },
    expected: { isTest: true, authoritativeTestFlag: false, failClosed: false },
  },
  {
    name: "missing customer id fails closed",
    input: { customerId: null, customerIsTestAccount: 0, sourceMarkers: ["M3D202607180001"] },
    expected: { isTest: true, authoritativeTestFlag: false, failClosed: true },
  },
  {
    name: "null authoritative flag fails closed",
    input: { customerId: 9, customerIsTestAccount: null, sourceMarkers: ["M3D202607180001"] },
    expected: { isTest: true, authoritativeTestFlag: null, failClosed: true },
  },
];

test("backend and script TEST classification helpers stay equivalent", () => {
  for (const entry of CASES) {
    const backend = classifyBackend(entry.input);
    const script = classifyScript(entry.input);
    assert.deepEqual(script, backend, entry.name);
    assert.equal(backend.isTest, entry.expected.isTest, entry.name);
    assert.equal(backend.authoritativeTestFlag, entry.expected.authoritativeTestFlag, entry.name);
    assert.equal(backend.failClosed, entry.expected.failClosed, entry.name);
  }
});
