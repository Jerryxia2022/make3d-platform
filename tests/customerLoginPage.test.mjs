import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("customer login page shows inline failures and block countdowns", async () => {
  const loginSource = await readSource("src/app/account/login/page.tsx");
  const formSource = await readSource("src/frontend/components/CustomerLoginForm.tsx");

  assert.match(loginSource, /CustomerLoginForm/);
  assert.match(formSource, /\/api\/account\/login/);
  assert.match(formSource, /手机号或密码错误，请重新输入/);
  assert.match(formSource, /setPassword\(""\)/);
  assert.match(formSource, /blockedUntil/);
  assert.match(formSource, /remainingSeconds/);
  assert.match(formSource, /密码错误次数过多，请10分钟后再试/);
  assert.match(formSource, /安全系统检测到异常，请24小时后再试/);
  assert.match(formSource, /当前请求暂不可用/);
});

test("customer login API uses SQLite auth blocks while admin login stays separate", async () => {
  const customerLoginApiSource = await readSource("src/app/api/account/login/route.ts");
  const adminLoginApiSource = await readSource("src/app/api/admin/login/route.ts");
  const throttleSource = await readSource("src/backend/customerLoginThrottle.ts");

  assert.match(customerLoginApiSource, /getClientIp/);
  assert.match(customerLoginApiSource, /getCustomerLoginBlock/);
  assert.match(customerLoginApiSource, /recordCustomerLoginFailure/);
  assert.match(customerLoginApiSource, /clearSuccessfulCustomerLoginFailures/);
  assert.match(throttleSource, /手机号或密码错误，请重新输入/);
  assert.match(customerLoginApiSource, /status: block\.status/);
  assert.doesNotMatch(adminLoginApiSource, /recordCustomerLoginFailure/);
  assert.doesNotMatch(adminLoginApiSource, /auth_blocks/);
});
