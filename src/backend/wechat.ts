import { createHash, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  bindWechatAccountByCode,
  createCustomerServiceRequest,
  createWechatNotification,
  getBoundWechatAccountByCustomerId,
  getWechatAccountByOpenid,
  markWechatSubscribed,
  touchWechatAccountMessage,
  type OrderRecord,
} from "./database.ts";

export type WechatInboundMessage = {
  toUserName: string;
  fromUserName: string;
  createTime: string;
  msgType: string;
  content: string;
  event: string;
  eventKey: string;
  unionid: string | null;
};

export type WechatMessageClient = {
  sendText: (openid: string, content: string) => Promise<unknown>;
};

export type WechatNotifyResult = {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  notificationId?: number;
  error?: Error;
};

export type WechatVerificationDiagnostics = {
  receivedGet: boolean;
  hasTimestamp: boolean;
  hasNonce: boolean;
  hasEchostr: boolean;
  hasSignature: boolean;
  tokenConfigured: boolean;
  signatureVerified: boolean;
};

export type WechatVerificationResult = {
  body: string;
  contentType: string;
  diagnostics: WechatVerificationDiagnostics;
  status: number;
};

const BIND_CODE_PATTERN = /^M3D-\d{6}$/i;
const SERVICE_ACCOUNT_BRAND_NAME = "瑞淞Make3D快速制造";
const WECHAT_ONBOARDING_REPLY = [
  `欢迎关注${SERVICE_ACCOUNT_BRAND_NAME}。`,
  "",
  "您可以通过底部菜单使用：",
  "在线报价｜我的订单｜地址管理｜联系客服",
  "",
  "也可以发送：",
  "“报价”——进入在线报价",
  "“订单”——查看我的订单",
  "“付款”——查看付款说明",
  "“人工”——联系人工客服",
  "",
  "复杂模型、STEP/STP、多实体、超尺寸或需要拆分的文件，将转人工确认。",
].join("\n");
const WECHAT_ORDER_NOTIFY_STATUSES = new Set([
  "待付款",
  "已付款",
  "生产中",
  "已发货",
  "已完成",
]);

export const WECHAT_MENU_CLICK_KEYS = [
  "MAKE3D_PAYMENT_HELP",
  "MAKE3D_ORDER_HELP",
  "MAKE3D_CUSTOMER_SERVICE",
  "MAKE3D_SERVICE_SCOPE",
  "MAKE3D_FAQ",
] as const;

export const WECHAT_MENU_CLICK_REPLIES: Record<(typeof WECHAT_MENU_CLICK_KEYS)[number], string> = {
  MAKE3D_PAYMENT_HELP: [
    "付款方式将在订单最终报价确认后显示。",
    "请登录网站查看待付款订单：",
    `${getAppUrl()}/account`,
    "",
    "如付款资料尚未启用，请发送“人工”联系客服确认。",
  ].join("\n"),
  MAKE3D_ORDER_HELP: [
    "请登录网站查看订单状态：",
    `${getAppUrl()}/account`,
    "",
    "如需人工查询，请发送：",
    "人工 + 订单号 + 问题说明",
  ].join("\n"),
  MAKE3D_CUSTOMER_SERVICE: [
    "已进入人工客服流程。",
    "",
    "请继续发送：",
    "",
    "1. 订单号",
    "2. 联系手机号",
    "3. 需要咨询的问题",
  ].join("\n"),
  MAKE3D_SERVICE_SCOPE: [
    "Make3D提供：",
    "",
    "* FDM 3D打印",
    "* 模型修改与打印",
    "* 小批量零件试制",
    "* 工装夹具与研发咨询",
    "",
    "复杂模型、STEP/STP、多实体或超尺寸文件需要人工确认。",
  ].join("\n"),
  MAKE3D_FAQ: [
    "常用关键词：",
    "报价｜订单｜付款｜人工",
    "",
    "在线报价：",
    `${getAppUrl()}/quote`,
    "",
    "我的订单：",
    `${getAppUrl()}/account`,
  ].join("\n"),
};

let accessTokenCache:
  | {
      accessToken: string;
      expiresAt: number;
    }
  | null = null;

export function getWechatMpConfig() {
  return {
    enabled: process.env.WECHAT_MP_ENABLED === "true",
    appId: (process.env.WECHAT_MP_APP_ID || "").trim(),
    appSecret: (process.env.WECHAT_MP_APP_SECRET || "").trim(),
    token: (process.env.WECHAT_MP_TOKEN || "").trim(),
    aesKey: (process.env.WECHAT_MP_AES_KEY || "").trim(),
  };
}

export function isWechatMpEnabled() {
  return getWechatMpConfig().enabled;
}

export function hasWechatCallbackConfig() {
  return Boolean(getWechatMpConfig().token);
}

export function hasWechatSendConfig() {
  const config = getWechatMpConfig();
  return Boolean(config.enabled && config.appId && config.appSecret);
}

export function verifyWechatSignature(
  token: string,
  timestamp: string | null,
  nonce: string | null,
  signature: string | null,
) {
  if (!token || !timestamp || !nonce || !signature) {
    return false;
  }

  const expected = createHash("sha1")
    .update([token, timestamp, nonce].sort().join(""))
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function verifyWechatServerRequest(
  url: string | URL,
  token = getWechatMpConfig().token,
): WechatVerificationResult {
  const { searchParams } = new URL(String(url));
  const signature = searchParams.get("signature");
  const timestamp = searchParams.get("timestamp");
  const nonce = searchParams.get("nonce");
  const echostr = searchParams.get("echostr");
  const signatureVerified = verifyWechatSignature(token, timestamp, nonce, signature);
  const diagnostics = {
    receivedGet: true,
    hasTimestamp: Boolean(timestamp),
    hasNonce: Boolean(nonce),
    hasEchostr: Boolean(echostr),
    hasSignature: Boolean(signature),
    tokenConfigured: Boolean(token),
    signatureVerified,
  };

  if (!token) {
    return {
      body: "wechat token is not configured",
      contentType: "text/plain; charset=utf-8",
      diagnostics,
      status: 400,
    };
  }

  if (!echostr) {
    return {
      body: "missing echostr",
      contentType: "text/plain; charset=utf-8",
      diagnostics,
      status: 400,
    };
  }

  if (!signatureVerified) {
    return {
      body: "invalid signature",
      contentType: "text/plain; charset=utf-8",
      diagnostics,
      status: 403,
    };
  }

  return {
    body: echostr,
    contentType: "text/plain; charset=utf-8",
    diagnostics,
    status: 200,
  };
}

export function parseWechatXml(xml: string): WechatInboundMessage {
  return {
    toUserName: getXmlValue(xml, "ToUserName"),
    fromUserName: getXmlValue(xml, "FromUserName"),
    createTime: getXmlValue(xml, "CreateTime"),
    msgType: getXmlValue(xml, "MsgType").toLowerCase(),
    content: getXmlValue(xml, "Content"),
    event: getXmlValue(xml, "Event").toLowerCase(),
    eventKey: getXmlValue(xml, "EventKey"),
    unionid: getXmlValue(xml, "UnionId") || getXmlValue(xml, "UnionID") || null,
  };
}

export function buildWechatTextReply(
  message: Pick<WechatInboundMessage, "fromUserName" | "toUserName">,
  content: string,
  now = Date.now(),
) {
  return [
    "<xml>",
    `<ToUserName><![CDATA[${escapeCdata(message.fromUserName)}]]></ToUserName>`,
    `<FromUserName><![CDATA[${escapeCdata(message.toUserName)}]]></FromUserName>`,
    `<CreateTime>${Math.floor(now / 1000)}</CreateTime>`,
    "<MsgType><![CDATA[text]]></MsgType>",
    `<Content><![CDATA[${escapeCdata(content)}]]></Content>`,
    "</xml>",
  ].join("");
}

export async function handleWechatMessage(db: DatabaseSync, xml: string) {
  const message = parseWechatXml(xml);

  if (!message.fromUserName || !message.toUserName || !message.msgType) {
    return "success";
  }

  if (message.msgType === "event") {
    return handleWechatEvent(db, message);
  }

  if (message.msgType === "text") {
    return handleWechatText(db, message);
  }

  return "success";
}

export function buildWechatOrderStatusContent(order: OrderRecord, appUrl = getAppUrl()) {
  const detailUrl = `${appUrl.replace(/\/$/, "")}/account/orders/${order.id}`;
  const lines = [
    "Make3D 订单状态更新",
    `订单编号：${order.orderNo}`,
    `当前状态：${order.status}`,
    `最终金额：${formatMoney(order.finalPrice ?? order.payablePrice ?? order.estimatedPrice)}`,
    `预计交货期：${formatLeadTime(order.finalLeadTimeHours ?? order.estimatedLeadTimeHours ?? order.estimatedLeadTimeMaxHours)}`,
    `订单详情：${detailUrl}`,
  ];

  if (order.status === "已发货") {
    lines.push(`快递公司：${order.shippingCompany || "-"}`);
    lines.push(`快递单号：${order.trackingNumber || "-"}`);
  }

  return lines.join("\n");
}

export async function notifyWechatOrderStatus(
  db: DatabaseSync,
  order: OrderRecord,
  client?: WechatMessageClient,
): Promise<WechatNotifyResult> {
  if (!WECHAT_ORDER_NOTIFY_STATUSES.has(order.status)) {
    return { sent: false, skipped: true, reason: "status_not_supported" };
  }

  const account = getBoundWechatAccountByCustomerId(db, order.customerId);

  if (!account?.openid || !account.subscribed) {
    return { sent: false, skipped: true, reason: "customer_not_bound" };
  }

  if (!isWechatMpEnabled()) {
    return { sent: false, skipped: true, reason: "wechat_disabled" };
  }

  const content = buildWechatOrderStatusContent(order);

  if (!client && !hasWechatSendConfig()) {
    const notificationId = createWechatNotification(db, {
      customerId: order.customerId,
      openid: account.openid,
      orderId: order.id,
      type: "order_status",
      content,
      sendStatus: "skipped",
      errorMessage: "WECHAT_MP_APP_ID or WECHAT_MP_APP_SECRET is missing",
    });

    return { sent: false, skipped: true, reason: "wechat_config_missing", notificationId };
  }

  try {
    await (client || createWechatMessageClient()).sendText(account.openid, content);
    const notificationId = createWechatNotification(db, {
      customerId: order.customerId,
      openid: account.openid,
      orderId: order.id,
      type: "order_status",
      content,
      sendStatus: "sent",
    });

    return { sent: true, notificationId };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error("wechat notification failed");
    const notificationId = createWechatNotification(db, {
      customerId: order.customerId,
      openid: account.openid,
      orderId: order.id,
      type: "order_status",
      content,
      sendStatus: "failed",
      errorMessage: normalizedError.message,
    });

    return { sent: false, notificationId, error: normalizedError };
  }
}

export function maskOpenid(openid?: string | null) {
  if (!openid) {
    return "-";
  }

  if (openid.length <= 10) {
    return `${openid.slice(0, 2)}***${openid.slice(-2)}`;
  }

  return `${openid.slice(0, 6)}...${openid.slice(-4)}`;
}

export function createWechatMessageClient(): WechatMessageClient {
  return {
    async sendText(openid, content) {
      const accessToken = await getWechatAccessToken();
      const response = await fetch(
        `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            touser: openid,
            msgtype: "text",
            text: { content },
          }),
        },
      );
      const result = (await response.json()) as { errcode?: number; errmsg?: string };

      if (!response.ok || result.errcode) {
        throw new Error(result.errmsg || `wechat send failed: ${response.status}`);
      }

      return result;
    },
  };
}

async function handleWechatEvent(db: DatabaseSync, message: WechatInboundMessage) {
  if (message.event === "subscribe") {
    markWechatSubscribed(db, {
      openid: message.fromUserName,
      unionid: message.unionid,
      subscribed: true,
    });

    return buildWechatTextReply(
      message,
      WECHAT_ONBOARDING_REPLY,
    );
  }

  if (message.event === "unsubscribe") {
    markWechatSubscribed(db, {
      openid: message.fromUserName,
      unionid: message.unionid,
      subscribed: false,
    });

    return "success";
  }

  if (message.event === "click") {
    if (message.eventKey === "MAKE3D_CUSTOMER_SERVICE") {
      return createWechatMenuCustomerServiceReply(db, message);
    }

    if (isWechatMenuClickKey(message.eventKey)) {
      return buildWechatTextReply(message, WECHAT_MENU_CLICK_REPLIES[message.eventKey]);
    }
  }

  if (message.event === "click" && matchesAny(message.eventKey, ["人工", "客服", "联系"])) {
    return createCustomerServiceRequestReply(db, message, message.eventKey || "人工客服");
  }

  return "success";
}

async function handleWechatText(db: DatabaseSync, message: WechatInboundMessage) {
  const content = message.content.trim();
  markWechatSubscribed(db, {
    openid: message.fromUserName,
    unionid: message.unionid,
    subscribed: true,
  });
  touchWechatAccountMessage(db, message.fromUserName);

  if (BIND_CODE_PATTERN.test(content)) {
    const account = bindWechatAccountByCode(db, {
      openid: message.fromUserName,
      bindCode: content,
      unionid: message.unionid,
    });

    return buildWechatTextReply(
      message,
      account
        ? "绑定成功，您将通过公众号接收订单状态通知。"
        : "绑定码无效或已过期，请登录网站重新生成绑定码。",
    );
  }

  if (matchesAny(content, ["人工", "客服", "联系"])) {
    return createCustomerServiceRequestReply(db, message, content);
  }

  if (matchesAny(content, ["报价", "上传", "打印"])) {
    return buildWechatTextReply(message, `请点击进入在线报价：${getAppUrl()}/quote`);
  }

  if (matchesAny(content, ["订单", "我的订单"])) {
    return buildWechatTextReply(message, `请点击查看我的订单：${getAppUrl()}/account`);
  }

  if (matchesAny(content, ["付款", "支付"])) {
    return buildWechatTextReply(
      message,
      `请登录网站查看订单详情和付款方式：${getAppUrl()}/account`,
    );
  }

  if (matchesAny(content, ["常见问题", "FAQ", "faq"])) {
    return buildWechatTextReply(message, WECHAT_MENU_CLICK_REPLIES.MAKE3D_FAQ);
  }

  return buildWechatTextReply(
    message,
    "您可以回复“报价”“订单”“付款”或“人工”，获取对应服务入口。",
  );
}

function createCustomerServiceRequestReply(
  db: DatabaseSync,
  message: WechatInboundMessage,
  content: string,
) {
  const account = getWechatAccountByOpenid(db, message.fromUserName);
  if (!hasRecentWechatKeywordCustomerServiceRequest(db, message.fromUserName, content)) {
    createCustomerServiceRequest(db, {
      customerId: account?.customerId ?? null,
      openid: message.fromUserName,
      phone: extractPhone(content),
      message: content,
      source: "wechat_keyword",
      category: "other",
    });
  }

  return buildWechatTextReply(
    message,
    "已收到人工客服请求，请留下订单号、手机号和问题，我们会尽快联系您。",
  );
}

function createWechatMenuCustomerServiceReply(db: DatabaseSync, message: WechatInboundMessage) {
  const account = getWechatAccountByOpenid(db, message.fromUserName);

  if (!hasRecentWechatMenuCustomerServiceRequest(db, message.fromUserName)) {
    createCustomerServiceRequest(db, {
      customerId: account?.customerId ?? null,
      openid: message.fromUserName,
      message: "菜单：联系客服",
      source: "wechat",
      category: "customer_service",
    });
  }

  return buildWechatTextReply(message, WECHAT_MENU_CLICK_REPLIES.MAKE3D_CUSTOMER_SERVICE);
}

function hasRecentWechatMenuCustomerServiceRequest(db: DatabaseSync, openid: string) {
  const row = db
    .prepare(
      `SELECT id
       FROM customer_service_requests
       WHERE openid = ?
         AND source = 'wechat'
         AND category = 'customer_service'
         AND status IN ('pending', 'processing', 'waiting_customer')
         AND created_at >= datetime('now', '-10 minutes')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(openid);

  return Boolean(row);
}

function hasRecentWechatKeywordCustomerServiceRequest(
  db: DatabaseSync,
  openid: string,
  message: string,
) {
  const row = db
    .prepare(
      `SELECT id
       FROM customer_service_requests
       WHERE openid = ?
         AND source = 'wechat_keyword'
         AND message = ?
         AND status IN ('pending', 'processing', 'waiting_customer')
         AND created_at >= datetime('now', '-10 minutes')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(openid, message);

  return Boolean(row);
}

function isWechatMenuClickKey(value: string): value is (typeof WECHAT_MENU_CLICK_KEYS)[number] {
  return WECHAT_MENU_CLICK_KEYS.includes(value as (typeof WECHAT_MENU_CLICK_KEYS)[number]);
}

async function getWechatAccessToken() {
  const now = Date.now();

  if (accessTokenCache && accessTokenCache.expiresAt > now + 60 * 1000) {
    return accessTokenCache.accessToken;
  }

  const config = getWechatMpConfig();

  if (!config.appId || !config.appSecret) {
    throw new Error("WECHAT_MP_APP_ID or WECHAT_MP_APP_SECRET is missing");
  }

  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("secret", config.appSecret);

  const response = await fetch(url);
  const result = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };

  if (!response.ok || !result.access_token) {
    throw new Error(result.errmsg || `wechat token failed: ${response.status}`);
  }

  accessTokenCache = {
    accessToken: result.access_token,
    expiresAt: now + Math.max(60, result.expires_in || 7200) * 1000,
  };

  return accessTokenCache.accessToken;
}

function getXmlValue(xml: string, tagName: string) {
  const pattern = new RegExp(
    `<${tagName}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tagName}>`,
    "i",
  );
  const match = xml.match(pattern);
  return (match?.[1] ?? match?.[2] ?? "").trim();
}

function escapeCdata(value: string) {
  return value.replaceAll("]]>", "]]]]><![CDATA[>");
}

function matchesAny(content: string, keywords: string[]) {
  return keywords.some((keyword) => content.includes(keyword));
}

function extractPhone(content: string) {
  return content.match(/1[3-9]\d{9}/)?.[0] || null;
}

function formatMoney(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} 元` : "-";
}

function formatLeadTime(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `约 ${Math.ceil(value)} 小时` : "-";
}

function getAppUrl() {
  return (process.env.APP_URL || "https://make3d.com.cn").replace(/\/$/, "");
}
