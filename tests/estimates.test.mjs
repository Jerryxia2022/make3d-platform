import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEVICE_COUNT,
  PACKAGING_FEE,
  estimateFileBySize,
  estimateOrderSummary,
  getMaterialCostRate,
  getMaterialSalesRate,
  getShippingEstimate,
} from "../src/backend/estimates.ts";

test("uses V2 material sales and cost rates", () => {
  assert.equal(getMaterialSalesRate("PLA"), 0.25);
  assert.equal(getMaterialSalesRate("PETG"), 0.2);
  assert.equal(getMaterialSalesRate("ABS"), 0.35);
  assert.equal(getMaterialCostRate("PLA"), 0.05);
  assert.equal(getMaterialCostRate("PETG"), 0.03);
  assert.equal(getMaterialCostRate("ABS"), 0.05);
});

test("estimates file price with labor minimum and dimension risks", () => {
  const smallPla = estimateFileBySize(4 * 1024 * 1024, "PLA", {
    x: 9,
    y: 30,
    z: 30,
  });

  assert.equal(smallPla.priceMin, 26);
  assert.equal(smallPla.priceMax, 63);
  assert.equal(smallPla.leadTimeMinHours, 4);
  assert.equal(smallPla.leadTimeMaxHours, 8);
  assert.equal(smallPla.riskLevel, "warning");
  assert.equal(smallPla.riskNotice, "模型尺寸较小，可能无法稳定打印，需要人工确认。");

  const nearLimitPla = estimateFileBySize(30 * 1024 * 1024, "PLA", {
    x: 241,
    y: 120,
    z: 80,
  });

  assert.equal(nearLimitPla.requiresManualConfirmation, false);
  assert.equal(nearLimitPla.riskLevel, "warning");
  assert.equal(nearLimitPla.riskNotice, "模型接近设备成型极限，可能需要调整摆放或拆件。");

  const oversizedAbs = estimateFileBySize(30 * 1024 * 1024, "ABS", {
    x: 260,
    y: 120,
    z: 80,
  });

  assert.equal(oversizedAbs.requiresManualConfirmation, true);
  assert.equal(oversizedAbs.riskLevel, "danger");
  assert.equal(
    oversizedAbs.riskNotice,
    "模型超出单台设备成型尺寸，通常需要分件打印，最终报价需人工确认。",
  );
  assert.equal(oversizedAbs.materialSalesRate, 0.35);
  assert.equal(oversizedAbs.materialCostRate, 0.05);
});

test("estimates order total with packaging, fixed freight and six-device lead time", () => {
  const summary = estimateOrderSummary(
    [
      { filesize: 4 * 1024 * 1024, material: "PLA", color: "黑" },
      { filesize: 10 * 1024 * 1024, material: "PETG", color: "白" },
    ],
    "普通快递",
  );

  assert.equal(DEVICE_COUNT, 6);
  assert.equal(PACKAGING_FEE, 3);
  assert.equal(summary.packagingFee, 3);
  assert.equal(summary.shippingFee, 10);
  assert.equal(summary.shippingFeeEstimate, "10 元");
  assert.equal(summary.priceMin, 55);
  assert.equal(summary.priceMax, 154);
  assert.equal(summary.leadTimeMinHours, 4);
  assert.equal(summary.leadTimeMaxHours, 8);
});

test("returns V2 shipping estimates for supported shipping methods", () => {
  assert.deepEqual(getShippingEstimate("普通快递"), {
    label: "10 元",
    amount: 10,
    includedInAutoPrice: true,
  });
  assert.deepEqual(getShippingEstimate("顺丰快递"), {
    label: "18 元",
    amount: 18,
    includedInAutoPrice: true,
  });
  assert.deepEqual(getShippingEstimate("西安本地跑腿"), {
    label: "人工确认",
    amount: null,
    includedInAutoPrice: false,
  });
  assert.deepEqual(getShippingEstimate("到店自取"), {
    label: "10 元",
    amount: 10,
    includedInAutoPrice: true,
  });
});
