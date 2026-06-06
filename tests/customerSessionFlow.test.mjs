import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CUSTOMER_SESSION_COOKIE,
  createCustomerSessionToken,
  getCustomerCookieOptions,
  getCustomerFromRequestCookie,
  setCustomerSessionCookie,
  verifyCustomerSessionTokenDetailed,
} from "../src/backend/accountAuth.ts";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("customer login responses set the same customer_session cookie read by APIs", () => {
  const previousSecret = process.env.SESSION_SECRET;
  const previousSecure = process.env.COOKIE_SECURE;

  try {
    process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
    process.env.COOKIE_SECURE = "true";

    const token = createCustomerSessionToken(42);
    const response = Response.json({ success: true, redirect: "/quote" });
    setCustomerSessionCookie(response, token);
    const setCookie = response.headers.get("Set-Cookie") || "";

    assert.equal(CUSTOMER_SESSION_COOKIE, "customer_session");
    assert.equal(getCustomerCookieOptions().httpOnly, true);
    assert.equal(getCustomerCookieOptions().sameSite, "lax");
    assert.equal(getCustomerCookieOptions().secure, true);
    assert.equal(getCustomerCookieOptions().path, "/");
    assert.match(setCookie, /customer_session=/);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=lax/);
    assert.match(setCookie, /Secure/);

    const parsed = getCustomerFromRequestCookie(
      new Request("https://make3d.com.cn/api/account/me", {
        headers: { Cookie: setCookie.split(";")[0] },
      }),
    );

    assert.equal(parsed?.customerId, 42);
  } finally {
    process.env.SESSION_SECRET = previousSecret;
    process.env.COOKIE_SECURE = previousSecure;
  }
});

test("account login, me, and order submit routes share customer session logic", async () => {
  const loginSource = await readSource("src/app/api/account/login/route.ts");
  const meSource = await readSource("src/app/api/account/me/route.ts");
  const ordersSource = await readSource("src/app/api/orders/route.ts");
  const databaseSource = await readSource("src/backend/database.ts");

  assert.match(loginSource, /setCustomerSessionCookie\(response, createCustomerSessionToken\(customer\.id\)\)/);
  assert.doesNotMatch(loginSource, /headers\.get\("Set-Cookie"\)/);
  assert.match(meSource, /getCustomerFromRequestCookie\(request\)/);
  assert.match(ordersSource, /getCustomerFromRequestCookie\(request\)/);
  assert.match(databaseSource, /import \{ verifyCustomerSessionToken \} from "\.\/customerSessionCore\.js"/);
  assert.match(databaseSource, /const session = verifyCustomerSessionToken\(token\)/);
  assert.doesNotMatch(databaseSource, /verifyCustomerSessionTokenForDatabase/);
  assert.match(ordersSource, /请先登录后提交订单/);
  assert.doesNotMatch(meSource, /ADMIN_SESSION_COOKIE/);
  assert.doesNotMatch(ordersSource, /ADMIN_SESSION_COOKIE/);
});

test("customer session verify failures log safe diagnostics without secrets", () => {
  const previousSecret = process.env.SESSION_SECRET;
  const logs = [];
  const previousWarn = console.warn;

  try {
    process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
    const token = createCustomerSessionToken(7);
    const badToken = `${token.slice(0, -2)}xx`;
    console.warn = (...args) => logs.push(args);

    const result = getCustomerFromRequestCookie(
      new Request("https://make3d.com.cn/api/account/me", {
        headers: { Cookie: `${CUSTOMER_SESSION_COOKIE}=${badToken}` },
      }),
    );
    const details = verifyCustomerSessionTokenDetailed(badToken);

    assert.equal(result, null);
    assert.equal(details.error, "signature mismatch");
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], "[make3d] customer session verify failed");
    assert.deepEqual(logs[0][1], {
      customerSessionExists: true,
      tokenPrefix: badToken.slice(0, 12),
      verifyErrorMessage: "signature mismatch",
      sessionSecretExists: true,
    });
    assert.doesNotMatch(JSON.stringify(logs[0]), new RegExp(token));
    assert.doesNotMatch(JSON.stringify(logs[0]), /test-session-secret-with-enough-length/);
  } finally {
    console.warn = previousWarn;
    process.env.SESSION_SECRET = previousSecret;
  }
});
