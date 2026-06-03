import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createCustomerAccount,
  findCustomerByLogin,
  getCustomerBySessionToken,
  hashPassword,
  initDatabase,
  verifyPassword,
} from "../src/backend/database.ts";
import {
  CUSTOMER_SESSION_COOKIE,
  createCustomerLoginRedirectResponse,
  createCustomerSessionToken,
  getCustomerCookieOptions,
  verifyCustomerSessionToken,
} from "../src/backend/accountAuth.ts";

test("creates customer accounts with hashed passwords and signed sessions", () => {
  const previousSecret = process.env.SESSION_SECRET;
  const db = initDatabase(":memory:");

  try {
    process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
    const customer = createCustomerAccount(db, {
      phone: "13800000000",
      password: "password123",
      name: "Jerry",
      wechat: "make3d",
      email: "jerry@example.com",
    });
    const found = findCustomerByLogin(db, "13800000000");
    const passwordHash = hashPassword("password123");
    const token = createCustomerSessionToken(customer.id);

    assert.equal(CUSTOMER_SESSION_COOKIE, "make3d_customer");
    assert.notEqual(found?.passwordHash, "password123");
    assert.equal(verifyPassword("password123", found?.passwordHash || ""), true);
    assert.equal(verifyPassword("wrong-password", found?.passwordHash || ""), false);
    assert.notEqual(passwordHash, "password123");
    assert.equal(verifyCustomerSessionToken(token)?.customerId, customer.id);
    assert.equal(getCustomerBySessionToken(db, token)?.phone, "13800000000");
    assert.equal(getCustomerCookieOptions().httpOnly, true);
    assert.equal(getCustomerCookieOptions().sameSite, "lax");
    assert.equal(createCustomerLoginRedirectResponse(token).headers.get("Location"), "/quote");
  } finally {
    process.env.SESSION_SECRET = previousSecret;
    db.close();
  }
});
