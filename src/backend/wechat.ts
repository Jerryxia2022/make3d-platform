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
const WECHAT_ORDER_NOTIFY_STATUSES = new Set([
  "待付款",
  "已付款",
  "排产中",
  "生产中",
  "后处理",
  "已发货",
  "已完成",
]);

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
      "欢迎关注 Make3D。您可以点击菜单进入在线报价，或登录网站生成绑定码后发送给公众号完成账号绑定。",
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
  createCustomerServiceRequest(db, {
    customerId: account?.customerId ?? null,
    openid: message.fromUserName,
    phone: extractPhone(content),
    message: content,
  });

  return buildWechatTextReply(
    message,
    "已收到人工客服请求，请留下订单号、手机号和问题，我们会尽快联系您。",
  );
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
