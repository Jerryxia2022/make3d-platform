import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("quote slice API rejects logged out customers with a clear 401 message", async () => {
  const source = await readSource("src/app/api/quote/slice/route.ts");

  assert.match(source, /getCustomerFromRequestCookie/);
  assert.match(source, /请先登录后使用自动报价/);
  assert.match(source, /401/);
});

test("customer account me API reports logged out state without admin session", async () => {
  const source = await readSource("src/app/api/account/me/route.ts");

  assert.match(source, /getCustomerFromRequestCookie/);
  assert.match(source, /authenticated: false/);
  assert.match(source, /status: 401/);
  assert.doesNotMatch(source, /ADMIN_SESSION_COOKIE/);
});

test("customer API logout clears only the customer session cookie", async () => {
  const source = await readSource("src/app/api/account/logout/route.ts");

  assert.match(source, /createCustomerLogoutResponse/);
  assert.doesNotMatch(source, /ADMIN_SESSION_COOKIE/);
});

test("customer register API returns unified phone validation errors", async () => {
  const source = await readSource("src/app/api/account/register/route.ts");

  assert.match(source, /createCustomerAccount/);
  assert.match(source, /Response\.json/);
  assert.match(source, /status: 400/);
});
