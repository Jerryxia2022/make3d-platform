import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyMinimumPrintUnitPrice,
  calculateLinePrintTotal,
  MIN_PRINT_UNIT_PRICE,
} from "../src/shared/pricing.ts";

test("applies the 5 yuan minimum to each printed unit", () => {
  assert.equal(MIN_PRINT_UNIT_PRICE, 5);
  assert.equal(applyMinimumPrintUnitPrice(3), 5);
  assert.equal(calculateLinePrintTotal(3, 1).subtotalPrice, 5);
  assert.equal(calculateLinePrintTotal(3, 4).subtotalPrice, 20);
  assert.equal(calculateLinePrintTotal(8, 4).subtotalPrice, 32);
});

test("applies the unit minimum per file before summing multi-file totals", () => {
  const fileA = calculateLinePrintTotal(3, 2);
  const fileB = calculateLinePrintTotal(7, 3);

  assert.equal(fileA.unitPrice, 5);
  assert.equal(fileA.subtotalPrice, 10);
  assert.equal(fileB.unitPrice, 7);
  assert.equal(fileB.subtotalPrice, 21);
  assert.equal(fileA.subtotalPrice + fileB.subtotalPrice, 31);
});
