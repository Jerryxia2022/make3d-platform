import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_QUOTE_MAX_DIMENSION_MM,
  AUTO_QUOTE_MIN_DIMENSION_MM,
  evaluateAutoQuoteDimensions,
} from "../src/shared/modelGeometry.ts";

test("automatic quote dimension boundaries are inclusive at 10 and 300 mm", () => {
  assert.equal(AUTO_QUOTE_MIN_DIMENSION_MM, 10);
  assert.equal(AUTO_QUOTE_MAX_DIMENSION_MM, 300);
  assert.equal(evaluateAutoQuoteDimensions({ x: 10, y: 50, z: 300 }).eligible, true);
  assert.equal(evaluateAutoQuoteDimensions({ x: 299.99, y: 300, z: 10 }).eligible, true);
  assert.equal(evaluateAutoQuoteDimensions({ x: 10, y: 10, z: 10 }).eligible, true);
  assert.equal(evaluateAutoQuoteDimensions({ x: 10, y: 50, z: 50 }).eligible, true);
  assert.equal(evaluateAutoQuoteDimensions({ x: 299.99, y: 299.99, z: 299.99 }).eligible, true);
  assert.equal(evaluateAutoQuoteDimensions({ x: 300, y: 300, z: 300 }).eligible, true);
});

test("automatic quote dimension boundaries reject values outside the frozen range", () => {
  assert.deepEqual(evaluateAutoQuoteDimensions({ x: 9.99, y: 50, z: 50 }).reasonCode, "DIMENSION_BELOW_MIN");
  assert.deepEqual(evaluateAutoQuoteDimensions({ x: 10, y: 300.01, z: 50 }).reasonCode, "DIMENSION_ABOVE_MAX");
  assert.deepEqual(evaluateAutoQuoteDimensions({ x: 301, y: 50, z: 50 }).reasonCode, "DIMENSION_ABOVE_MAX");
  assert.deepEqual(evaluateAutoQuoteDimensions({ x: 400, y: 50, z: 50 }).reasonCode, "DIMENSION_ABOVE_MAX");
  assert.deepEqual(evaluateAutoQuoteDimensions({ x: 50, y: 301, z: 50 }).reasonCode, "DIMENSION_ABOVE_MAX");
  assert.deepEqual(evaluateAutoQuoteDimensions({ x: 50, y: 50, z: 400 }).reasonCode, "DIMENSION_ABOVE_MAX");
  assert.deepEqual(evaluateAutoQuoteDimensions({ x: 0, y: 50, z: 50 }).reasonCode, "DIMENSIONS_MISSING");
  assert.deepEqual(evaluateAutoQuoteDimensions(null).reasonCode, "DIMENSIONS_MISSING");
});
