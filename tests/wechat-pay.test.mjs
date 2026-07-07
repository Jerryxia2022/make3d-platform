import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildJsapiBridgeParams,
  buildWechatPayAuthorization,
  createWechatPaySignature,
  decryptWechatPayResource,
  encryptWechatPayResourceForTest,
  extractWechatPayPublicKeyId,
  isValidApiV3Key,
  verifyWechatPayHeaders,
  verifyWechatPaySignature,
} from "../src/backend/wechatPay.ts";
import {
  confirmOrderFinalQuote,
  createCustomerAccount,
  createOrderWithFile,
  initDatabase,
  markCustomerTestAccount,
} from "../src/backend/database.ts";
import { getWechatPayPublicAvailability } from "../src/backend/wechatPayService.ts";

test("wechat pay APIv3 signs authorization and verifies platform style headers", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = JSON.stringify({ hello: "make3d" });
  const auth = buildWechatPayAuthorization(
    {
      mchId: "1114987934",
      merchantCertSerial: "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
      privateKeyPem,
    },
    "POST",
    "/v3/pay/transactions/native",
    body,
    "1718000000",
    "nonce-for-test",
  );

  assert.match(auth.authorization, /^WECHATPAY2-SHA256-RSA2048 /);
  assert.match(auth.authorization, /mchid="1114987934"/);
  assert.equal(
    verifyWechatPaySignature(
      publicKeyPem,
      "POST\n/v3/pay/transactions/native\n1718000000\nnonce-for-test\n" + body + "\n",
      auth.signature,
    ),
    true,
  );

  const timestamp = "1718000001";
  const nonce = "response-nonce";
  const platformSignature = createWechatPaySignature(privateKeyPem, `${timestamp}\n${nonce}\n${body}\n`);
  assert.equal(
    verifyWechatPayHeaders(
      { publicKeyPem, publicKeyId: "PUB_KEY_ID_1234567890" },
      {
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": nonce,
        "Wechatpay-Signature": platformSignature,
        "Wechatpay-Serial": "PUB_KEY_ID_1234567890",
      },
      body,
    ),
    true,
  );
  assert.equal(
    verifyWechatPayHeaders(
      { publicKeyPem, publicKeyId: "PUB_KEY_ID_1234567890" },
      {
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": nonce,
        "Wechatpay-Signature": platformSignature,
        "Wechatpay-Serial": "PUB_KEY_ID_999",
      },
      body,
    ),
    false,
  );
});

test("wechat pay decrypts APIv3 notification resources and validates public key id/API key format", () => {
  const apiV3Key = "Aa1234567890Bb1234567890Cc123456";
  const plaintext = JSON.stringify({
    mchid: "1114987934",
    appid: "wx8b173c450927acac",
    out_trade_no: "M3DP202607070001",
    trade_state: "SUCCESS",
    amount: { total: 100, currency: "CNY" },
  });
  const resource = encryptWechatPayResourceForTest(apiV3Key, plaintext);

  assert.equal(isValidApiV3Key(apiV3Key), true);
  assert.equal(isValidApiV3Key("short"), false);
  assert.equal(extractWechatPayPublicKeyId("id: PUB_KEY_ID_1234567890123456789"), "PUB_KEY_ID_1234567890123456789");
  assert.deepEqual(decryptWechatPayResource(apiV3Key, resource), JSON.parse(plaintext));
});

test("wechat pay JSAPI params are RSA signed with prepay_id package", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const params = buildJsapiBridgeParams(
    { appId: "wx8b173c450927acac", privateKeyPem },
    "wx201410272009395522657a690389285100",
    1_718_000_000_000,
  );

  assert.equal(params.appId, "wx8b173c450927acac");
  assert.equal(params.package, "prepay_id=wx201410272009395522657a690389285100");
  assert.equal(params.signType, "RSA");
  assert.equal(
    verifyWechatPaySignature(
      publicKeyPem,
      `${params.appId}\n${params.timeStamp}\n${params.nonceStr}\n${params.package}\n`,
      params.paySign,
    ),
    true,
  );
});

test("wechat pay TEST_ONLY availability requires explicit test account whitelist", () => {
  const previous = {
    WECHAT_PAY_ENABLED: process.env.WECHAT_PAY_ENABLED,
    WECHAT_PAY_TEST_ONLY: process.env.WECHAT_PAY_TEST_ONLY,
    WECHAT_PAY_TEST_CUSTOMER_IDS: process.env.WECHAT_PAY_TEST_CUSTOMER_IDS,
  };
  const db = initDatabase(":memory:");

  try {
    process.env.WECHAT_PAY_ENABLED = "true";
    process.env.WECHAT_PAY_TEST_ONLY = "true";
    const customer = createCustomerAccount(db, {
      phone: "13800000000",
      password: "password123",
      name: "TEST customer",
      wechat: "test-customer",
      email: "test@example.com",
    });
    createPayableOrder(db, customer.id);

    process.env.WECHAT_PAY_TEST_CUSTOMER_IDS = "";
    assert.equal(getWechatPayPublicAvailability({ ...customer, isTestAccount: true }).allowedByTestMode, false);

    markCustomerTestAccount(db, customer.id, true);
    process.env.WECHAT_PAY_TEST_CUSTOMER_IDS = String(customer.id);
    assert.equal(getWechatPayPublicAvailability({ ...customer, isTestAccount: true }).allowedByTestMode, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    db.close();
  }
});

function createPayableOrder(db, customerId) {
  const order = createOrderWithFile(db, {
    customerId,
    customerName: "TEST customer",
    phone: "13800000000",
    wechat: "test-customer",
    material: "PLA",
    color: "white",
    quantity: 1,
    estimatedPrice: 30,
    file: {
      filename: "wechat-pay.stl",
      filepath: "/uploads/wechat-pay.stl",
      filesize: 128,
    },
  });

  confirmOrderFinalQuote(db, order.id, { finalPrice: 88, operator: "admin" });
  return order;
}
