import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createQuoteFileId,
  estimateDisplayDimensions,
  estimateFiles,
  estimateOrderSummary,
  formatBytes,
  formatDimensions,
  formatLeadTimeRange,
  formatPriceRange,
} from "../src/frontend/lib/quote-estimates.ts";

test("keeps quote estimates safe when uploaded STL dimensions are unavailable", () => {
  const file = {
    name: "part.stl",
    size: 2 * 1024 * 1024,
    lastModified: 1,
  };
  const dimensions = estimateDisplayDimensions(file);
  const estimates = estimateFiles([
    {
      id: "file-1",
      file,
      material: "PLA",
      color: "黑",
    },
  ]);
  const summary = estimateOrderSummary(estimates, "普通快递");

  assert.equal(dimensions, null);
  assert.equal(formatDimensions(dimensions), "尺寸暂未识别，最终以人工确认为准。");
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0].estimate.riskNotice, "");
  assert.equal(formatPriceRange(estimates[0].estimate.priceMin, estimates[0].estimate.priceMax), "26-58 元");
  assert.equal(formatLeadTimeRange(summary.leadTimeMinHours, summary.leadTimeMaxHours), "预计 48-72 小时");
});

test("formats invalid numeric inputs without throwing", () => {
  assert.equal(formatBytes(null), "0 B");
  assert.equal(formatBytes(undefined), "0 B");
  assert.equal(formatBytes(Number.NaN), "0 B");
  assert.equal(formatPriceRange(null, undefined), "-");
  assert.equal(formatLeadTimeRange(null, undefined), "-");

  const summary = estimateOrderSummary([{ estimate: null }, { estimate: {} }], "西安本地跑腿");

  assert.equal(summary.priceMin, 20);
  assert.equal(summary.priceMax, 20);
  assert.equal(summary.shippingFeeEstimate, "人工确认");
  assert.equal(formatLeadTimeRange(summary.leadTimeMinHours, summary.leadTimeMaxHours), "预计 48-72 小时");
});

test("creates file ids without requiring crypto.randomUUID", () => {
  const originalCrypto = globalThis.crypto;

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {},
  });

  try {
    assert.match(createQuoteFileId({ name: "part.stl", size: 1, lastModified: 2 }), /part\.stl-1-2-/);
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  }
});

test("still returns risk hints when dimensions are available", () => {
  const largeStep = {
    name: "fixture.step",
    size: 25 * 1024 * 1024,
    lastModified: 1,
  };
  const hugeStep = {
    name: "fixture.step",
    size: 49 * 1024 * 1024,
    lastModified: 1,
  };
  const smallStep = {
    name: "fixture.step",
    size: 512 * 1024,
    lastModified: 1,
  };

  assert.equal(
    formatDimensions(estimateDisplayDimensions(largeStep)),
    "模型最大外形尺寸约：245 × 160 × 120 mm",
  );
  assert.equal(
    estimateFiles([{ id: "large", file: largeStep, material: "PLA", color: "黑" }])[0].estimate
      .riskNotice,
    "模型接近设备成型极限，可能需要调整摆放或拆件。",
  );
  assert.equal(
    estimateFiles([{ id: "huge", file: hugeStep, material: "PLA", color: "黑" }])[0].estimate
      .riskNotice,
    "模型超出单台设备成型尺寸，通常需要分件打印，最终报价需人工确认。",
  );
  assert.equal(
    estimateFiles([{ id: "small", file: smallStep, material: "PLA", color: "黑" }])[0].estimate
      .riskNotice,
    "模型尺寸较小，可能无法稳定打印，需要人工确认。",
  );
});
