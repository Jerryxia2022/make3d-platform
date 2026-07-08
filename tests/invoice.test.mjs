import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateInvoiceTotalCents,
  maskTaxpayerId,
} from "../src/shared/invoice.ts";

test("invoice totals are calculated with integer cents", () => {
  assert.deepEqual(calculateInvoiceTotalCents(12345, "none"), {
    invoiceType: "none",
    invoiceRequired: false,
    invoiceRateBps: 100,
    invoicePriceAdjustmentBps: 0,
    invoiceBaseAmountCents: 12345,
    invoiceAdjustmentAmountCents: 0,
    invoiceTotalAmountCents: 12345,
  });

  assert.equal(calculateInvoiceTotalCents(101, "ordinary").invoiceTotalAmountCents, 104);
  assert.equal(calculateInvoiceTotalCents(101, "special").invoiceTotalAmountCents, 108);
  assert.equal(calculateInvoiceTotalCents(100, "ordinary").invoiceAdjustmentAmountCents, 3);
  assert.equal(calculateInvoiceTotalCents(100, "special").invoiceAdjustmentAmountCents, 7);
});

test("taxpayer identifiers are masked for evidence snapshots", () => {
  assert.equal(maskTaxpayerId("91610113MAEK6AUB19"), "916***B19");
});
