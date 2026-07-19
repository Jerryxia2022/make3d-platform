import assert from "node:assert/strict";
import { test } from "node:test";

import { buildOrderListView, requiresOrderDetailEnrichment } from "../worker/order-workbench/lib/orderList.mjs";

test("order list prioritizes blockers and calculates real summary counts", () => {
  const orders = [
    order(1, { sync: "verified", created_at: "2026-07-18T08:00:00Z" }),
    order(2, { sync: "failed", created_at: "2026-07-18T09:00:00Z" }),
    order(3, { sync: "verified", created_at: "2026-07-17T09:00:00Z" }),
  ];
  const local = new Map([
    [1, { order_id: 1, state: "UNREVIEWED" }],
    [2, { order_id: 2, state: "REVIEWING", slice_status: "failed" }],
    [3, { order_id: 3, state: "CLOSED", slice_status: "parsed", confirmed_price_cents: 1200 }],
  ]);
  const view = buildOrderListView({ orders, localOverviews: local, now: new Date("2026-07-18T12:00:00Z") });
  assert.deepEqual(view.rows.map((row) => row.id), [2, 1, 3]);
  assert.equal(view.stats.all, 3);
  assert.equal(view.stats.fileAbnormal, 1);
  assert.equal(view.stats.sliceFailed, 1);
  assert.equal(view.stats.todayNew, 2);
});

test("order list supports filename, order id, customer type, filters, and pagination", () => {
  const orders = Array.from({ length: 25 }, (_, index) => order(index + 1, {
    is_test_account: index === 0,
    sync: index === 2 ? "failed" : "verified",
  }));
  const details = new Map([[1, { files: [{ original_filename: "fixture-bracket.stl" }], customer_service_requests: [] }]]);

  const byFilename = buildOrderListView({ orders, details, query: { q: "bracket" } });
  assert.deepEqual(byFilename.rows.map((row) => row.id), [1]);
  const byId = buildOrderListView({ orders, query: { q: "25" } });
  assert.equal(byId.rows.some((row) => row.id === 25), true);
  const testOnly = buildOrderListView({ orders, query: { customer_type: "test" } });
  assert.deepEqual(testOnly.rows.map((row) => row.id), [1]);
  const exceptions = buildOrderListView({ orders, query: { exception: "1" } });
  assert.deepEqual(exceptions.rows.map((row) => row.id), [3]);
  const secondPage = buildOrderListView({ orders, query: { page: "2", page_size: "20", sort: "created_desc" } });
  assert.equal(secondPage.rows.length, 5);
  assert.equal(secondPage.pagination.page, 2);
  assert.equal(secondPage.pagination.totalPages, 2);
});

test("order detail enrichment is requested only for search and customer reply filters", () => {
  assert.equal(requiresOrderDetailEnrichment({}), false);
  assert.equal(requiresOrderDetailEnrichment({ q: "file.stl" }), true);
  assert.equal(requiresOrderDetailEnrichment({ customer_reply: "received" }), true);
});

function order(id, options = {}) {
  return {
    id,
    order_no: `M3DTEST${String(id).padStart(3, "0")}`,
    created_at: options.created_at || `2026-07-${String((id % 18) + 1).padStart(2, "0")}T10:00:00Z`,
    updated_at: options.updated_at || null,
    status: "pending",
    payment_status: "unpaid",
    material: "PLA",
    color: "black",
    quantity: 1,
    estimated_price: 12.5,
    remark: options.remark || "",
    file_count: 1,
    file_sync_summary: { status: options.sync || "verified", file_count: 1, verified_count: options.sync === "failed" ? 0 : 1 },
    is_test_account: options.is_test_account ?? false,
  };
}
