import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("home page contains Make3D service entry and quote CTA", async () => {
  const source = await readSource("src/app/page.tsx");

  assert.match(source, /Make3D/);
  assert.match(source, /工业级3D打印服务/);
  assert.match(source, /立即报价/);
});

test("quote page exposes the V1 material and customer form shell", async () => {
  const source = await readSource("src/app/quote/page.tsx");
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");

  assert.match(source, /STL/);
  assert.match(source, /3MF/);
  assert.match(source, /STEP/);
  assert.match(source, /PLA/);
  assert.match(source, /PETG/);
  assert.match(source, /ABS/);
  assert.match(source, /此价格为系统预估，最终价格以人工确认为准。/);
  assert.match(formSource, /name="customerName"/);
  assert.match(formSource, /name="phone"/);
  assert.match(formSource, /name="wechat"/);
  assert.match(formSource, /name="email"/);
  assert.match(formSource, /name="company"/);
  assert.match(formSource, /autoComplete="tel"/);
  assert.match(formSource, /autoComplete="off"/);
});

test("success page confirms order submission next steps", async () => {
  const source = await readSource("src/app/success/page.tsx");

  assert.match(source, /提交成功/);
  assert.match(source, /人工确认/);
});

test("admin pages display contact fields from the matching order properties", async () => {
  const listSource = await readSource("src/app/admin/orders/page.tsx");
  const detailSource = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(listSource, /客户姓名/);
  assert.match(listSource, /{order\.customerName}/);
  assert.match(listSource, /电话/);
  assert.match(listSource, /{order\.phone}/);
  assert.match(listSource, /微信/);
  assert.match(listSource, /{order\.wechat}/);
  assert.match(detailSource, /label="姓名" value={order\.customerName}/);
  assert.match(detailSource, /label="电话" value={order\.phone}/);
  assert.match(detailSource, /label="微信" value={order\.wechat}/);
  assert.match(detailSource, /label="邮箱" value={order\.email \|\| "-"}/);
  assert.match(detailSource, /label="公司" value={order\.company \|\| "-"}/);
});
