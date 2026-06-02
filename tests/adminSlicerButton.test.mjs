import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("admin slicer test button triggers API and renders all result states", async () => {
  const source = await readSource("src/frontend/components/AdminSlicerTestButton.tsx");

  assert.match(source, /"use client"/);
  assert.match(source, /fetch\(`\/api\/admin\/orders\/\$\{orderId\}\/slice-test`/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /正在切片\.\.\./);
  assert.match(source, /切片成功/);
  assert.match(source, /切片失败/);
  assert.match(source, /切片配置缺失/);
  assert.match(source, /自动切片报价尚未启用/);
  assert.match(source, /disabled={!enabled \|\| isRunning}/);
});

test("admin order detail page wires slicer test button without breaking detail actions", async () => {
  const source = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(source, /AdminSlicerTestButton/);
  assert.match(source, /orderId={order\.id}/);
  assert.match(source, /enabled={slicerConfig\.enabled}/);
  assert.match(source, /profilePath={slicerConfig\.profilePath}/);
  assert.match(source, /AdminStatusForm orderId={order\.id} status={order\.status}/);
  assert.match(source, /\/api\/admin\/files\/\$\{file\.id\}\/download/);
});

test("admin slicer test API checks auth, disabled state, profile missing, and uniform response", async () => {
  const source = await readSource("src/app/api/admin/orders/[id]/slice-test/route.ts");

  assert.match(source, /requireAdminSession/);
  assert.match(source, /success: false/);
  assert.match(source, /success: true/);
  assert.match(source, /自动切片报价尚未启用/);
  assert.match(source, /切片配置缺失，请先配置 profiles\/bambu-p1s\.ini/);
  assert.match(source, /切片失败/);
  assert.match(source, /job:/);
});
