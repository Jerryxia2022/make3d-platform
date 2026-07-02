import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateAutoFilePrice,
  calculateAutoLeadTimeHours,
  calculateAutoOrderPrice,
  getShippingFee,
} from "../src/backend/autoPricing.ts";

test("calculates automatic file quote with material, labor minimum, unit minimum, and packaging share", () => {
  const price = calculateAutoFilePrice({
    material: "PLA",
    filamentWeightG: 1,
    printTimeSeconds: 60,
    packagingShare: 0,
  });

  assert.equal(price.materialFee, 0.25);
  assert.equal(price.laborFee, 5);
  assert.equal(price.packagingShare, 0);
  assert.equal(price.estimatedPrice, 5.25);
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

test("keeps the longest file on one machine and shares remaining lead time", () => {
  assert.equal(
    calculateAutoLeadTimeHours([12 * 60 * 60, 18 * 60 * 60, 6 * 60 * 60]),
    45,
  );
});

test("applies supported shipping rules without a whole-order minimum", () => {
  assert.equal(getShippingFee("普通快递"), 10);
  assert.equal(getShippingFee("顺丰快递"), 18);
  assert.equal(getShippingFee("到店自取"), 10);
  assert.equal(getShippingFee("西安本地跑腿"), null);

  const ordinary = calculateAutoOrderPrice({
    filePrices: [18],
    shippingMethod: "普通快递",
  });
  const courier = calculateAutoOrderPrice({
    filePrices: [18],
    shippingMethod: "西安本地跑腿",
  });
  const pickup = calculateAutoOrderPrice({
    filePrices: [8],
    shippingMethod: "到店自取",
  });
  const empty = calculateAutoOrderPrice({
    filePrices: [],
    shippingMethod: "普通快递",
  });

  assert.equal(ordinary.estimatedPrice, 28);
  assert.equal(ordinary.shippingFee, 10);
  assert.equal(courier.estimatedPrice, 18);
  assert.equal(courier.shippingFee, null);
  assert.equal(courier.requiresManualShipping, true);
  assert.equal(pickup.estimatedPrice, 18);
  assert.equal(empty.estimatedPrice, 0);
});
