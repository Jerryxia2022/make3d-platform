import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const EXPECTED_SERVICE_ACCOUNT_NAME = "瑞淞Make3D快速制造";
export const TOKEN_REFRESH_ERRCODES = new Set([40001, 40014, 42001]);

export function buildWechatMenu(appUrl = process.env.APP_URL || "https://make3d.com.cn") {
  const normalizedAppUrl = appUrl.replace(/\/$/, "");

  return {
    button: [
      {
        name: "在线服务",
        sub_button: [
          { type: "view", name: "在线报价", url: `${normalizedAppUrl}/quote` },
          { type: "view", name: "我的订单", url: `${normalizedAppUrl}/account` },
          { type: "view", name: "地址管理", url: `${normalizedAppUrl}/account/addresses` },
        ],
      },
      {
        name: "订单帮助",
        sub_button: [
          { type: "click", name: "付款说明", key: "MAKE3D_PAYMENT_HELP" },
          { type: "click", name: "订单查询", key: "MAKE3D_ORDER_HELP" },
          { type: "click", name: "联系客服", key: "MAKE3D_CUSTOMER_SERVICE" },
        ],
      },
      {
        name: "了解我们",
        sub_button: [
          { type: "click", name: "服务范围", key: "MAKE3D_SERVICE_SCOPE" },
          { type: "click", name: "常见问题", key: "MAKE3D_FAQ" },
          { type: "view", name: "官方网站", url: normalizedAppUrl },
        ],
      },
    ],
  };
}

export function validateWechatMenu(menu) {
  const errors = [];
  const buttons = Array.isArray(menu?.button) ? menu.button : [];

  if (buttons.length === 0) {
    errors.push("menu must include at least one top-level button");
  }

  if (buttons.length > 3) {
    errors.push("top-level button count must not exceed 3");
  }

  const clickKeys = [];

  for (const button of buttons) {
    if (!button.name) {
      errors.push("button name is required");
    }

    if (Array.isArray(button.sub_button)) {
      if (button.sub_button.length > 5) {
        errors.push(`${button.name} sub-button count must not exceed 5`);
      }

      for (const subButton of button.sub_button) {
        validateButton(subButton, errors, clickKeys);
      }
    } else {
      validateButton(button, errors, clickKeys);
    }
  }

  if (new Set(clickKeys).size !== clickKeys.length) {
    errors.push("CLICK keys must be unique");
  }

  return { valid: errors.length === 0, errors };
}

export function getWechatMenuClickKeys(menu = buildWechatMenu()) {
  return flattenMenuButtons(menu)
    .filter((button) => button.type === "click")
    .map((button) => button.key);
}

export function summarizeWechatMenu(menu) {
  return {
    topLevel: (menu?.button || []).map((button) => ({
      name: button.name,
      items: (button.sub_button || []).map((item) =>
        item.type === "view" ? `${item.name}:view` : `${item.name}:click:${item.key}`,
      ),
    })),
  };
}

export function maskAppId(value) {
  return value ? `${value.slice(0, 6)}****${value.slice(-4)}` : "(empty)";
}

export function isExpectedCertifiedServiceAccount(accountInfo) {
  const verifyInfo = accountInfo?.wx_verify_info || {};
  return (
    accountInfo?.nickname === EXPECTED_SERVICE_ACCOUNT_NAME &&
    Boolean(verifyInfo.qualification_verify || verifyInfo.naming_verify)
  );
}

export function sanitizeWechatResult(result) {
  if (!result || typeof result !== "object") {
    return result;
  }

  const sanitized = {
    errcode: result.errcode ?? 0,
    errmsg: result.errmsg || "",
  };

  if (result.is_menu_open != null) {
    sanitized.is_menu_open = result.is_menu_open;
  }

  if (result.menu?.button) {
    sanitized.menu = summarizeWechatMenu(result.menu);
  }

  if (result.selfmenu_info?.button) {
    sanitized.selfmenu_info = {
      count: result.selfmenu_info.button.length,
      names: result.selfmenu_info.button.map((button) => button.name),
    };
  }

  if (result.nickname || result.account_type != null || result.wx_verify_info) {
    sanitized.account = {
      nickname: result.nickname || "",
      accountType: result.account_type ?? null,
      verified: Boolean(
        result.wx_verify_info?.qualification_verify || result.wx_verify_info?.naming_verify,
      ),
    };
  }

  return sanitized;
}

export async function runWechatMenuUpdate({
  env = process.env,
  fetchImpl = fetch,
  logger = console,
} = {}) {
  loadLocalEnv(env);

  const appUrl = (env.APP_URL || "https://make3d.com.cn").replace(/\/$/, "");
  const appId = (env.WECHAT_MP_APP_ID || "").trim();
  const appSecret = (env.WECHAT_MP_APP_SECRET || "").trim();
  const menuApiEnabled = env.WECHAT_MP_MENU_ENABLED === "true";
  const menu = buildWechatMenu(appUrl);
  const validation = validateWechatMenu(menu);

  logger.log(
    `Wechat menu config: appid=${maskAppId(appId)}, menuEnabled=${String(menuApiEnabled)}`,
  );

  if (!menuApiEnabled) {
    logger.log(
      "Wechat menu API creation is disabled. Make3D can still use keyword service mode: 报价 / 订单 / 付款 / 人工.",
    );
    logger.log("Set WECHAT_MP_MENU_ENABLED=true for a certified account with custom menu API permission.");
    return { created: false, skipped: true, reason: "menu_disabled" };
  }

  if (!validation.valid) {
    throw new Error(`invalid menu: ${validation.errors.join("; ")}`);
  }

  if (!appId || !appSecret) {
    throw new Error("WECHAT_MP_APP_ID and WECHAT_MP_APP_SECRET are required.");
  }

  let accessToken = await getAccessToken(fetchImpl, appId, appSecret);
  let checks = await runReadOnlyChecks(fetchImpl, accessToken);

  if (shouldRefreshAccessToken(checks)) {
    logger.warn("Wechat access token was rejected by a read-only endpoint; refreshing once.");
    accessToken = await getAccessToken(fetchImpl, appId, appSecret);
    checks = await runReadOnlyChecks(fetchImpl, accessToken);
  }

  logReadOnlyChecks(logger, checks, appId);

  if (!isExpectedCertifiedServiceAccount(checks.accountBasic.result)) {
    logger.warn(
      `Wechat menu update skipped: access token is not confirmed for ${EXPECTED_SERVICE_ACCOUNT_NAME}.`,
    );
    return {
      created: false,
      skipped: true,
      reason: "account_identity_not_confirmed",
      checks,
    };
  }

  if (hasErrcode(checks.menuGet.result, 48001) || hasErrcode(checks.selfMenuInfo.result, 48001)) {
    logger.warn("Wechat menu update skipped: custom menu API unauthorized, errcode=48001.");
    return { created: false, skipped: true, reason: "menu_api_unauthorized", checks };
  }

  const blockingError = getBlockingWechatError(checks);
  if (blockingError) {
    logger.warn(
      `Wechat menu update skipped: ${blockingError.step} failed, errcode=${blockingError.errcode}, errmsg=${blockingError.errmsg}`,
    );
    return { created: false, skipped: true, reason: "readonly_check_failed", checks };
  }

  const createResult = await callWechatApi(fetchImpl, {
    endpoint: "https://api.weixin.qq.com/cgi-bin/menu/create",
    accessToken,
    method: "POST",
    body: menu,
  });

  logger.log(
    `Wechat menu create result: errcode=${createResult.result?.errcode ?? 0}, errmsg=${createResult.result?.errmsg || ""}`,
  );

  if (!createResult.response.ok || createResult.result?.errcode) {
    return { created: false, skipped: true, reason: "menu_create_failed", checks, createResult };
  }

  const verifyResult = await callWechatApi(fetchImpl, {
    endpoint: "https://api.weixin.qq.com/cgi-bin/menu/get",
    accessToken,
  });

  logger.log(`Wechat menu updated. Summary: ${JSON.stringify(summarizeWechatMenu(menu))}`);
  logger.log(`Wechat menu verify: ${JSON.stringify(sanitizeWechatResult(verifyResult.result))}`);

  return { created: true, menu, checks, createResult, verifyResult };
}

async function getAccessToken(fetchImpl, appId, appSecret) {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);

  const response = await fetchImpl(url);
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.access_token) {
    const errcode = result?.errcode ?? response.status;
    const errmsg = result?.errmsg || response.statusText || "wechat token failed";
    throw new Error(`token failed: errcode=${errcode}, errmsg=${errmsg}`);
  }

  return result.access_token;
}

async function runReadOnlyChecks(fetchImpl, accessToken) {
  const [menuGet, selfMenuInfo, accountBasic] = await Promise.all([
    callWechatApi(fetchImpl, {
      endpoint: "https://api.weixin.qq.com/cgi-bin/menu/get",
      accessToken,
    }),
    callWechatApi(fetchImpl, {
      endpoint: "https://api.weixin.qq.com/cgi-bin/get_current_selfmenu_info",
      accessToken,
    }),
    callWechatApi(fetchImpl, {
      endpoint: "https://api.weixin.qq.com/cgi-bin/account/getaccountbasicinfo",
      accessToken,
    }),
  ]);

  return { menuGet, selfMenuInfo, accountBasic };
}

async function callWechatApi(fetchImpl, { endpoint, accessToken, method = "GET", body }) {
  const url = new URL(endpoint);
  url.searchParams.set("access_token", accessToken);

  const response = await fetchImpl(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));

  return { response, result };
}

function logReadOnlyChecks(logger, checks, appId) {
  for (const [name, check] of Object.entries(checks)) {
    logger.log(
      `Wechat ${name}: http=${check.response.status}, appid=${maskAppId(appId)}, result=${JSON.stringify(
        sanitizeWechatResult(check.result),
      )}`,
    );
  }
}

function shouldRefreshAccessToken(checks) {
  return Object.values(checks).some((check) => TOKEN_REFRESH_ERRCODES.has(Number(check.result?.errcode)));
}

function getBlockingWechatError(checks) {
  for (const [step, check] of Object.entries(checks)) {
    const errcode = Number(check.result?.errcode ?? 0);

    if (!check.response.ok || (errcode && errcode !== 46003)) {
      return {
        step,
        errcode: errcode || check.response.status,
        errmsg: check.result?.errmsg || check.response.statusText || "wechat api failed",
      };
    }
  }

  return null;
}

function hasErrcode(result, errcode) {
  return Number(result?.errcode ?? 0) === errcode;
}

function validateButton(button, errors, clickKeys) {
  if (!button.name) {
    errors.push("sub-button name is required");
  }

  if (button.type === "view") {
    if (!/^https:\/\//.test(button.url || "")) {
      errors.push(`${button.name} URL must be HTTPS`);
    }
    return;
  }

  if (button.type === "click") {
    if (!button.key) {
      errors.push(`${button.name} CLICK key is required`);
    } else {
      clickKeys.push(button.key);
    }
    return;
  }

  errors.push(`${button.name || "button"} uses unsupported type`);
}

function flattenMenuButtons(menu) {
  return (menu?.button || []).flatMap((button) => button.sub_button || [button]);
}

function loadLocalEnv(env) {
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

      if (key && env[key] == null) {
        env[key] = unquote(value);
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

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isMainModule()) {
  try {
    await runWechatMenuUpdate();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`Wechat menu update skipped: ${message}`);
    console.warn(
      "This is non-blocking. Make3D keyword replies remain available even if API-created menus fail.",
    );
  }
}
