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

  assert.match(source, /STL/);
  assert.match(source, /3MF/);
  assert.match(source, /STEP/);
  assert.match(source, /PLA/);
  assert.match(source, /PETG/);
  assert.match(source, /ABS/);
  assert.match(source, /此价格为系统预估，最终价格以人工确认为准。/);
});

test("success page confirms order submission next steps", async () => {
  const source = await readSource("src/app/success/page.tsx");

  assert.match(source, /提交成功/);
  assert.match(source, /人工确认/);
});
