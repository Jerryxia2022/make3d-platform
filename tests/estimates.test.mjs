import { test } from "node:test";
import assert from "node:assert/strict";

import {
  estimateFileBySize,
  estimateOrderSummary,
  getShippingEstimate,
} from "../src/backend/estimates.ts";

test("estimates file price and lead time from file size buckets", () => {
  assert.deepEqual(estimateFileBySize(4 * 1024 * 1024, "PLA"), {
    priceMin: 20,
    priceMax: 50,
    leadTimeMinHours: 4,
    leadTimeMaxHours: 8,
    materialRate: 0.15,
  });
  assert.deepEqual(estimateFileBySize(10 * 1024 * 1024, "PETG"), {
    priceMin: 50,
    priceMax: 120,
    leadTimeMinHours: 8,
    leadTimeMaxHours: 24,
    materialRate: 0.25,
  });
  assert.deepEqual(estimateFileBySize(30 * 1024 * 1024, "ABS"), {
    priceMin: 120,
    priceMax: 300,
    leadTimeMinHours: 24,
    leadTimeMaxHours: 48,
    materialRate: 0.3,
  });
});

test("estimates order totals by summing files and adding manual order fee", () => {
  const summary = estimateOrderSummary(
    [
      { filesize: 4 * 1024 * 1024, material: "PLA", color: "黑" },
      { filesize: 10 * 1024 * 1024, material: "PETG", color: "白" },
    ],
    "普通快递",
  );

  assert.deepEqual(summary, {
    priceMin: 80,
    priceMax: 180,
    leadTimeMinHours: 12,
    leadTimeMaxHours: 32,
    shippingFeeEstimate: "10 元起",
  });
});

test("returns shipping fee estimates for supported shipping methods", () => {
  assert.equal(getShippingEstimate("普通快递"), "10 元起");
  assert.equal(getShippingEstimate("顺丰快递"), "18 元起");
  assert.equal(getShippingEstimate("西安本地跑腿"), "需人工确认");
  assert.equal(getShippingEstimate("到店自取"), "0 元");
});
