import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isValidMainlandPhone,
  mainlandPhoneErrorMessage,
  mainlandPhoneHtmlPattern,
} from "../src/shared/phoneValidation.ts";

test("validates mainland China mobile phone numbers consistently", () => {
  assert.equal(isValidMainlandPhone("13922339016"), true);
  assert.equal(isValidMainlandPhone("18292895409"), true);
  assert.equal(isValidMainlandPhone("12345678901"), false);
  assert.equal(isValidMainlandPhone("1392233901"), false);
  assert.equal(isValidMainlandPhone("139223390166"), false);
  assert.equal(isValidMainlandPhone(" 13922339016 "), true);
});

test("exposes browser-safe phone pattern and unified error message", () => {
  assert.equal(mainlandPhoneHtmlPattern, "^1[3-9][0-9]{9}$");
  assert.equal(mainlandPhoneErrorMessage, "请填写正确的11位中国大陆手机号");
});
