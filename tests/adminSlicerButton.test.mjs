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
  assert.match(source, /耗材重量/);
  assert.match(source, /打印时间/);
  assert.match(source, /自动计算价格/);
  assert.match(source, /材料费/);
  assert.match(source, /工时费/);
  assert.match(source, /使用材料/);
  assert.match(source, /0\.4喷嘴 \/ 0\.2层高 \/ 50%填充/);
  assert.match(source, /disabled={!enabled \|\| isRunning}/);
});

test("admin order detail page wires slicer test button without breaking detail actions", async () => {
  const source = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(source, /AdminSlicerTestButton/);
  assert.match(source, /orderId={order\.id}/);
  assert.match(source, /enabled={slicerConfig\.enabled}/);
  assert.match(source, /profilePath={slicerConfig\.profilePath}/);
  assert.match(source, /getLatestSliceJobByOrderId/);
  assert.match(source, /最近一次切片记录/);
  assert.match(source, /formatSlicePrintTime/);
  assert.match(source, /formatSliceMoney/);
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
  assert.match(source, /切片完成，但未解析到重量\/时间，请检查 G-code 输出格式。/);
  assert.match(source, /runPrusaSlicer/);
  assert.match(source, /calculateAutoFilePrice/);
  assert.match(source, /createSliceJob/);
  assert.match(source, /updateSliceJobSuccess/);
  assert.match(source, /updateSliceJobFailure/);
  assert.match(source, /result:/);
  assert.match(source, /filament_weight_g/);
  assert.match(source, /print_time_seconds/);
  assert.match(source, /material_fee/);
  assert.match(source, /time_fee/);
  assert.match(source, /estimated_price/);
  assert.match(source, /切片失败/);
  assert.match(source, /job:/);
});
