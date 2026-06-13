import { existsSync, readFileSync } from "node:fs";

loadLocalEnv();

const appUrl = (process.env.APP_URL || "https://make3d.com.cn").replace(/\/$/, "");
const appId = (process.env.WECHAT_MP_APP_ID || "").trim();
const appSecret = (process.env.WECHAT_MP_APP_SECRET || "").trim();
const menuApiEnabled = process.env.WECHAT_MP_MENU_ENABLED === "true";

if (!menuApiEnabled) {
  console.log(
    "Wechat menu API creation is paused. Make3D is using keyword service mode: 报价 / 订单 / 付款 / 人工.",
  );
  console.log("Set WECHAT_MP_MENU_ENABLED=true only for an account with custom menu API permission.");
  process.exit(0);
}

const menu = {
  button: [
    {
      name: "在线服务",
      sub_button: [
        { type: "view", name: "在线报价", url: `${appUrl}/quote` },
        { type: "view", name: "我的订单", url: `${appUrl}/account` },
        { type: "view", name: "绑定账号", url: `${appUrl}/account` },
      ],
    },
    {
      name: "订单服务",
      sub_button: [
        { type: "view", name: "付款说明", url: `${appUrl}/account` },
        { type: "view", name: "发货查询", url: `${appUrl}/account` },
      ],
    },
    {
      name: "联系我们",
      sub_button: [
        { type: "click", name: "人工客服", key: "人工" },
        { type: "view", name: "服务范围", url: appUrl },
        { type: "view", name: "常见问题", url: appUrl },
      ],
    },
  ],
};

try {
  if (!appId || !appSecret) {
    throw new Error("WECHAT_MP_APP_ID and WECHAT_MP_APP_SECRET are required.");
  }

  const accessToken = await getAccessToken();
  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(menu),
    },
  );
  const result = await response.json();

  if (!response.ok || result.errcode) {
    throw new Error(formatWechatError("menu_create", response, result));
  }

  console.log("Wechat official account menu updated.");
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  console.warn(`Wechat menu update skipped: ${message}`);
  console.warn(
    "This is non-blocking. Current personal account mode relies on keyword replies instead of API-created menus.",
  );
}

async function getAccessToken() {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok || !result.access_token) {
    throw new Error(formatWechatError("token", response, result));
  }

  return result.access_token;
}

function formatWechatError(step, response, result) {
  const errcode = result?.errcode ?? response.status;
  const errmsg = result?.errmsg || response.statusText || "wechat api failed";
  return `${step} failed: errcode=${errcode}, errmsg=${errmsg}`;
}

function loadLocalEnv() {
  for (const filename of [".env.local", ".env.production", ".env"]) {
    if (!existsSync(filename)) {
      continue;
    }

    const content = readFileSync(filename, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();

      if (key && process.env[key] == null) {
        process.env[key] = unquote(value);
      }
    }
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
