import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateAutoFilePrice,
  calculateAutoLeadTimeHours,
  calculateAutoOrderPrice,
  getShippingFee,
} from "../src/backend/autoPricing.ts";

test("calculates automatic file quote with material, labor minimum, and packaging share", () => {
  const price = calculateAutoFilePrice({
    material: "PLA",
    filamentWeightG: 40,
    printTimeSeconds: 2 * 60 * 60,
    packagingShare: 3,
  });

  assert.equal(price.materialFee, 10);
  assert.equal(price.laborFee, 5);
  assert.equal(price.packagingShare, 3);
  assert.equal(price.estimatedPrice, 18);
});

test("calculates exact slicer quote with fixed packaging and rounded delivery lead time", () => {
  const price = calculateAutoFilePrice({
    material: "PLA",
    filamentWeightG: 859.07,
    printTimeSeconds: 72750,
    packagingFee: 3,
  });

  assert.equal(price.materialFee, 214.77);
  assert.equal(price.laborFee, 30.31);
  assert.equal(price.packagingFee, 3);
  assert.equal(price.estimatedPrice, 248.08);
  assert.equal(calculateAutoLeadTimeHours([20 * 60 * 60 + 13 * 60]), 45);
});

test("calculates rounded delivery lead time for multiple files across six machines", () => {
  assert.equal(
    calculateAutoLeadTimeHours([12 * 60 * 60, 18 * 60 * 60, 6 * 60 * 60]),
    30,
  );
});

test("applies order minimum and supported shipping rules", () => {
  assert.equal(getShippingFee("普通快递"), 10);
  assert.equal(getShippingFee("顺丰快递"), 18);
  assert.equal(getShippingFee("到店自取"), 0);
  assert.equal(getShippingFee("西安本地跑腿"), null);

  const ordinary = calculateAutoOrderPrice({
    filePrices: [18],
    shippingMethod: "普通快递",
  });
  const courier = calculateAutoOrderPrice({
    filePrices: [18],
    shippingMethod: "西安本地跑腿",
  });
  const pickupMinimum = calculateAutoOrderPrice({
    filePrices: [8],
    shippingMethod: "到店自取",
  });

  assert.equal(ordinary.estimatedPrice, 28);
  assert.equal(ordinary.shippingFee, 10);
  assert.equal(courier.estimatedPrice, 20);
  assert.equal(courier.shippingFee, null);
  assert.equal(courier.requiresManualShipping, true);
  assert.equal(pickupMinimum.estimatedPrice, 20);
});
