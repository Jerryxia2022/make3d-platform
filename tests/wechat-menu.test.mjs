import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildWechatMenu,
  getWechatMenuClickKeys,
  isExpectedCertifiedServiceAccount,
  validateWechatMenu,
} from "../scripts/wechat-menu.mjs";
import { WECHAT_MENU_CLICK_KEYS } from "../src/backend/wechat.ts";

test("wechat custom menu JSON is valid for certified service account API", () => {
  const menu = buildWechatMenu("https://make3d.com.cn/");
  const validation = validateWechatMenu(menu);
  const clickKeys = getWechatMenuClickKeys(menu);

  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.ok(menu.button.length <= 3);

  for (const button of menu.button) {
    assert.ok(button.sub_button.length <= 5);
  }

  for (const item of flattenMenu(menu)) {
    if (item.type === "view") {
      assert.match(item.url, /^https:\/\//);
    }
  }

  assert.deepEqual([...new Set(clickKeys)].sort(), [...clickKeys].sort());
  assert.deepEqual([...clickKeys].sort(), [...WECHAT_MENU_CLICK_KEYS].sort());
});

test("every wechat menu CLICK key has a callback reply handler", async () => {
  const source = await readFile(new URL("../src/backend/wechat.ts", import.meta.url), "utf8");

  for (const key of getWechatMenuClickKeys(buildWechatMenu())) {
    assert.match(source, new RegExp(key));
  }
});

test("old personal official account cannot pass certified service account guard", () => {
  assert.equal(
    isExpectedCertifiedServiceAccount({
      nickname: "西安3D打印",
      wx_verify_info: { qualification_verify: false, naming_verify: false },
    }),
    false,
  );
  assert.equal(
    isExpectedCertifiedServiceAccount({
      nickname: "瑞淞Make3D快速制造",
      wx_verify_info: { qualification_verify: true, naming_verify: false },
    }),
    true,
  );
});

function flattenMenu(menu) {
  return menu.button.flatMap((button) => button.sub_button || [button]);
}
