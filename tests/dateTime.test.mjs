import { test } from "node:test";
import assert from "node:assert/strict";

import { formatBeijingDateTime } from "../src/shared/dateTime.ts";

test("formats legacy SQLite UTC timestamps as Beijing time", () => {
  assert.equal(formatBeijingDateTime("2026-06-13 12:30:45"), "2026/6/13 20:30:45");
});

test("formats explicit Beijing timestamps without an extra timezone shift", () => {
  assert.equal(formatBeijingDateTime("2026-06-13T20:30:45+08:00"), "2026/6/13 20:30:45");
});
