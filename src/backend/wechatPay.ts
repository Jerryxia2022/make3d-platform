import {
  X509Certificate,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { URL } from "node:url";

export const WECHAT_PAY_PROVIDER = "wechat";
export const WECHAT_PAY_CURRENCY = "CNY";
export const WECHAT_PAY_MAIN_HOST = "https://api.mch.weixin.qq.com";
export const WECHAT_PAY_BACKUP_HOST = "https://api2.mch.weixin.qq.com";

export type WechatPayConfig = {
  enabled: boolean;
  testOnly: boolean;
  jsapiAuthReady: boolean;
  mchId: string;
  appId: string;
  merchantCertSerial: string;
  publicKeyId: string;
  notifyUrl: string;
  privateKeyPem: string;
  merchantCertPem: string;
  publicKeyPem: string;
  apiV3Key: string;
  testCustomerIds: number[];
};

export type WechatPayConfigDiagnostics = {
  enabled: boolean;
  testOnly: boolean;
  jsapiAuthReady: boolean;
  mchIdConfigured: boolean;
  appIdConfigured: boolean;
  merchantCertSerialConfigured: boolean;
  publicKeyIdConfigured: boolean;
  notifyUrlConfigured: boolean;
  privateKeyLoaded: boolean;
  merchantCertLoaded: boolean;
  publicKeyLoaded: boolean;
  apiV3KeyLoaded: boolean;
  privateKeyCanSign: boolean;
  publicKeyCanVerify: boolean;
  merchantCertificateSerialMatches: boolean;
  apiV3KeyValid: boolean;
  notifyUrlValid: boolean;
  testCustomerIds: number[];
  errors: string[];
};

export type WechatPayRequestResult<T> = {
  data: T;
  requestId: string | null;
  status: number;
  headers: Headers;
};

export type JsapiPrepayResponse = {
  prepay_id: string;
};

export type NativePrepayResponse = {
  code_url: string;
};

export type WechatPayTradeQuery = {
  appid?: string;
  mchid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_type?: string;
  trade_state?: string;
  trade_state_desc?: string;
  bank_type?: string;
  attach?: string;
  success_time?: string;
  payer?: {
    openid?: string;
  };
  amount?: {
    total?: number;
    payer_total?: number;
    currency?: string;
    payer_currency?: string;
  };
};

export type WechatRefundResponse = {
  refund_id?: string;
  out_refund_no?: string;
  transaction_id?: string;
  out_trade_no?: string;
  status?: string;
  success_time?: string;
  amount?: {
    refund?: number;
    payer_refund?: number;
    total?: number;
    currency?: string;
  };
};

export type WechatPayNotificationResource = {
  algorithm: string;
  ciphertext: string;
  associated_data?: string;
  nonce: string;
  original_type?: string;
};

export type WechatPayNotificationBody = {
  id: string;
  create_time: string;
  event_type: string;
  resource_type: string;
  summary: string;
  resource: WechatPayNotificationResource;
};

export type WechatPayTransaction = WechatPayTradeQuery & {
  out_trade_no: string;
  transaction_id?: string;
  trade_state: string;
  amount?: {
    total?: number;
    payer_total?: number;
    currency?: string;
    payer_currency?: string;
  };
  payer?: {
    openid?: string;
  };
};

export type WechatPayJsapiBridgeParams = {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
};

type FetchLike = typeof fetch;

export function loadWechatPayConfig(env = process.env): WechatPayConfig {
  const enabled = env.WECHAT_PAY_ENABLED === "true";
  const testOnly = env.WECHAT_PAY_TEST_ONLY !== "false";
  const jsapiAuthReady = env.WECHAT_PAY_JSAPI_AUTH_READY === "true";
  const mchId = readRequiredEnv(env, "WECHAT_PAY_MCH_ID");
  const appId = readRequiredEnv(env, "WECHAT_PAY_APP_ID");
  const merchantCertSerial = readRequiredEnv(env, "WECHAT_PAY_MERCHANT_CERT_SERIAL");
  const publicKeyId = readRequiredEnv(env, "WECHAT_PAY_PUBLIC_KEY_ID");
  const notifyUrl = readRequiredEnv(env, "WECHAT_PAY_NOTIFY_URL");
  const privateKeyPem = readSecretFile(readRequiredEnv(env, "WECHAT_PAY_MERCHANT_PRIVATE_KEY_FILE"));
  const merchantCertPem = readSecretFile(readRequiredEnv(env, "WECHAT_PAY_MERCHANT_CERT_FILE"));
  const publicKeyPem = readSecretFile(readRequiredEnv(env, "WECHAT_PAY_PUBLIC_KEY_FILE"));
  const apiV3Key = readApiV3KeyFile(readRequiredEnv(env, "WECHAT_PAY_API_V3_KEY_FILE"));
  const testCustomerIds = parseIdList(env.WECHAT_PAY_TEST_CUSTOMER_IDS);

  validateWechatPayConfig({
    enabled,
    testOnly,
    jsapiAuthReady,
    mchId,
    appId,
    merchantCertSerial,
    publicKeyId,
    notifyUrl,
    privateKeyPem,
    merchantCertPem,
    publicKeyPem,
    apiV3Key,
    testCustomerIds,
  });

  return {
    enabled,
    testOnly,
    jsapiAuthReady,
    mchId,
    appId,
    merchantCertSerial,
    publicKeyId,
    notifyUrl,
    privateKeyPem,
    merchantCertPem,
    publicKeyPem,
    apiV3Key,
    testCustomerIds,
  };
}

export function getWechatPayConfigDiagnostics(env = process.env): WechatPayConfigDiagnostics {
  const diagnostics: WechatPayConfigDiagnostics = {
    enabled: env.WECHAT_PAY_ENABLED === "true",
    testOnly: env.WECHAT_PAY_TEST_ONLY !== "false",
    jsapiAuthReady: env.WECHAT_PAY_JSAPI_AUTH_READY === "true",
    mchIdConfigured: Boolean(env.WECHAT_PAY_MCH_ID),
    appIdConfigured: Boolean(env.WECHAT_PAY_APP_ID),
    merchantCertSerialConfigured: Boolean(env.WECHAT_PAY_MERCHANT_CERT_SERIAL),
    publicKeyIdConfigured: Boolean(env.WECHAT_PAY_PUBLIC_KEY_ID),
    notifyUrlConfigured: Boolean(env.WECHAT_PAY_NOTIFY_URL),
    privateKeyLoaded: false,
    merchantCertLoaded: false,
    publicKeyLoaded: false,
    apiV3KeyLoaded: false,
    privateKeyCanSign: false,
    publicKeyCanVerify: false,
    merchantCertificateSerialMatches: false,
    apiV3KeyValid: false,
    notifyUrlValid: false,
    testCustomerIds: parseIdList(env.WECHAT_PAY_TEST_CUSTOMER_IDS),
    errors: [],
  };

  try {
    const config = loadWechatPayConfig(env);
    diagnostics.privateKeyLoaded = true;
    diagnostics.merchantCertLoaded = true;
    diagnostics.publicKeyLoaded = true;
    diagnostics.apiV3KeyLoaded = true;
    diagnostics.privateKeyCanSign = canSignWithPrivateKey(config.privateKeyPem);
    diagnostics.publicKeyCanVerify = canVerifyWithPublicKey(config.publicKeyPem);
    diagnostics.merchantCertificateSerialMatches =
      extractCertificateSerial(config.merchantCertPem).toUpperCase() === config.merchantCertSerial.toUpperCase();
    diagnostics.apiV3KeyValid = isValidApiV3Key(config.apiV3Key);
    diagnostics.notifyUrlValid = isHttpsUrl(config.notifyUrl);
  } catch (error) {
    diagnostics.errors.push(error instanceof Error ? error.message : "wechat pay config invalid");
  }

  return diagnostics;
}

export function validateWechatPayConfig(config: WechatPayConfig) {
  const failures: string[] = [];

  if (!/^\d{8,20}$/.test(config.mchId)) {
    failures.push("WECHAT_PAY_MCH_ID format is invalid");
  }

  if (!/^wx[0-9a-fA-F]{16,32}$/.test(config.appId)) {
    failures.push("WECHAT_PAY_APP_ID format is invalid");
  }

  if (!/^[0-9A-Fa-f]{20,64}$/.test(config.merchantCertSerial)) {
    failures.push("WECHAT_PAY_MERCHANT_CERT_SERIAL format is invalid");
  }

  if (!/^PUB_KEY_ID_\d+$/.test(config.publicKeyId)) {
    failures.push("WECHAT_PAY_PUBLIC_KEY_ID format is invalid");
  }

  if (!isHttpsUrl(config.notifyUrl)) {
    failures.push("WECHAT_PAY_NOTIFY_URL must be an HTTPS URL");
  }

  if (!isValidApiV3Key(config.apiV3Key)) {
    failures.push("WECHAT_PAY_API_V3_KEY_FILE must contain a 32 character alphanumeric key");
  }

  try {
    createPrivateKey(config.privateKeyPem);
  } catch {
    failures.push("merchant private key cannot be parsed");
  }

  try {
    createPublicKey(config.publicKeyPem);
  } catch {
    failures.push("wechat pay public key cannot be parsed");
  }

  try {
    const serial = extractCertificateSerial(config.merchantCertPem);
    if (serial.toUpperCase() !== config.merchantCertSerial.toUpperCase()) {
      failures.push("merchant certificate serial does not match WECHAT_PAY_MERCHANT_CERT_SERIAL");
    }
  } catch {
    failures.push("merchant certificate cannot be parsed");
  }

  if (!canSignWithPrivateKey(config.privateKeyPem)) {
    failures.push("merchant private key cannot sign");
  }

  if (!canVerifyWithPublicKey(config.publicKeyPem)) {
    failures.push("wechat pay public key cannot verify");
  }

  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
}

export function readApiV3KeyFile(path: string) {
  const content = readSecretFile(path);
  const line = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);

  if (!line) {
    throw new Error("APIv3 key file is empty");
  }

  if (!isValidApiV3Key(line)) {
    throw new Error("APIv3 key length or format is invalid");
  }

  return line;
}

export function extractWechatPayPublicKeyId(content: string) {
  const match = content.match(/PUB_KEY_ID_\d+/);
  if (!match) {
    throw new Error("wechat pay public key id not found");
  }
  return match[0];
}

export function isValidApiV3Key(value: string) {
  return /^[0-9A-Za-z]{32}$/.test(value);
}

export function extractCertificateSerial(certPem: string) {
  return new X509Certificate(certPem).serialNumber.replace(/:/g, "");
}

export function extractCertificateValidity(certPem: string) {
  const cert = new X509Certificate(certPem);
  return {
    serialNumber: cert.serialNumber.replace(/:/g, ""),
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    subject: cert.subject,
  };
}

export function createWechatPayNonce() {
  return randomBytes(16).toString("hex");
}

export function createWechatPaySignature(privateKeyPem: string, message: string) {
  return sign("RSA-SHA256", Buffer.from(message, "utf8"), privateKeyPem).toString("base64");
}

export function verifyWechatPaySignature(publicKeyPem: string, message: string, signature: string) {
  const actual = Buffer.from(signature, "base64");
  return verify("RSA-SHA256", Buffer.from(message, "utf8"), publicKeyPem, actual);
}

export function buildWechatPayAuthorization(
  config: Pick<WechatPayConfig, "mchId" | "merchantCertSerial" | "privateKeyPem">,
  method: string,
  canonicalUrl: string,
  body = "",
  timestamp = String(Math.floor(Date.now() / 1000)),
  nonce = createWechatPayNonce(),
) {
  const message = [method.toUpperCase(), canonicalUrl, timestamp, nonce, body].join("\n") + "\n";
  const signature = createWechatPaySignature(config.privateKeyPem, message);

  return {
    authorization: [
      "WECHATPAY2-SHA256-RSA2048",
      `mchid="${config.mchId}"`,
      `nonce_str="${nonce}"`,
      `signature="${signature}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${config.merchantCertSerial}"`,
    ].join(" "),
    timestamp,
    nonce,
    signature,
  };
}

export function buildJsapiBridgeParams(
  config: Pick<WechatPayConfig, "appId" | "privateKeyPem">,
  prepayId: string,
  now = Date.now(),
): WechatPayJsapiBridgeParams {
  const timeStamp = String(Math.floor(now / 1000));
  const nonceStr = createWechatPayNonce();
  const packageValue = `prepay_id=${prepayId}`;
  const message = [config.appId, timeStamp, nonceStr, packageValue].join("\n") + "\n";

  return {
    appId: config.appId,
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: "RSA",
    paySign: createWechatPaySignature(config.privateKeyPem, message),
  };
}

export function verifyWechatPayHeaders(
  config: Pick<WechatPayConfig, "publicKeyPem" | "publicKeyId">,
  headers: Headers | Record<string, string | null | undefined>,
  body: string,
) {
  const timestamp = readHeader(headers, "Wechatpay-Timestamp");
  const nonce = readHeader(headers, "Wechatpay-Nonce");
  const signature = readHeader(headers, "Wechatpay-Signature");
  const serial = readHeader(headers, "Wechatpay-Serial");

  if (!timestamp || !nonce || !signature || !serial) {
    return false;
  }

  if (serial !== config.publicKeyId) {
    return false;
  }

  const message = [timestamp, nonce, body].join("\n") + "\n";
  return verifyWechatPaySignature(config.publicKeyPem, message, signature);
}

export function decryptWechatPayResource<T>(
  apiV3Key: string,
  resource: WechatPayNotificationResource,
): T {
  if (resource.algorithm !== "AEAD_AES_256_GCM") {
    throw new Error("unsupported wechat pay resource algorithm");
  }

  const ciphertext = Buffer.from(resource.ciphertext, "base64");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(resource.nonce, "utf8"));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(resource.associated_data || "", "utf8"));
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export function encryptWechatPayResourceForTest(apiV3Key: string, plaintext: string, nonce = "testnonce123") {
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(nonce, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "AEAD_AES_256_GCM",
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
    nonce,
    associated_data: "",
  };
}

export function createWechatPayBodyHash(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

export function maskWechatIdentifier(value?: string | null) {
  if (!value) {
    return "-";
  }
  if (value.length <= 10) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export class WechatPayApiClient {
  private readonly fetchImpl: FetchLike;
  private readonly config: WechatPayConfig;

  constructor(
    config: WechatPayConfig,
    options: { fetchImpl?: FetchLike } = {},
  ) {
    this.config = config;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  prepayJsapi(input: {
    description: string;
    outTradeNo: string;
    amountCents: number;
    payerOpenid: string;
    timeExpire: string;
    attach?: string;
  }) {
    return this.request<JsapiPrepayResponse>("POST", "/v3/pay/transactions/jsapi", {
      appid: this.config.appId,
      mchid: this.config.mchId,
      description: input.description,
      out_trade_no: input.outTradeNo,
      time_expire: input.timeExpire,
      attach: input.attach,
      notify_url: this.config.notifyUrl,
      amount: {
        total: input.amountCents,
        currency: WECHAT_PAY_CURRENCY,
      },
      payer: {
        openid: input.payerOpenid,
      },
    });
  }

  prepayNative(input: {
    description: string;
    outTradeNo: string;
    amountCents: number;
    timeExpire: string;
    attach?: string;
  }) {
    return this.request<NativePrepayResponse>("POST", "/v3/pay/transactions/native", {
      appid: this.config.appId,
      mchid: this.config.mchId,
      description: input.description,
      out_trade_no: input.outTradeNo,
      time_expire: input.timeExpire,
      attach: input.attach,
      notify_url: this.config.notifyUrl,
      amount: {
        total: input.amountCents,
        currency: WECHAT_PAY_CURRENCY,
      },
    });
  }

  queryByOutTradeNo(outTradeNo: string) {
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}`;
    return this.request<WechatPayTradeQuery>("GET", `${path}?mchid=${encodeURIComponent(this.config.mchId)}`);
  }

  queryByTransactionId(transactionId: string) {
    const path = `/v3/pay/transactions/id/${encodeURIComponent(transactionId)}`;
    return this.request<WechatPayTradeQuery>("GET", `${path}?mchid=${encodeURIComponent(this.config.mchId)}`);
  }

  closeByOutTradeNo(outTradeNo: string) {
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`;
    return this.request<Record<string, never>>("POST", path, { mchid: this.config.mchId }, { allowEmptyResponse: true });
  }

  createRefund(input: {
    outTradeNo: string;
    outRefundNo: string;
    reason: string;
    refundAmountCents: number;
    totalAmountCents: number;
  }) {
    return this.request<WechatRefundResponse>("POST", "/v3/refund/domestic/refunds", {
      out_trade_no: input.outTradeNo,
      out_refund_no: input.outRefundNo,
      reason: input.reason,
      amount: {
        refund: input.refundAmountCents,
        total: input.totalAmountCents,
        currency: WECHAT_PAY_CURRENCY,
      },
    });
  }

  queryRefund(outRefundNo: string) {
    const path = `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`;
    return this.request<WechatRefundResponse>("GET", path);
  }

  async request<T>(
    method: string,
    canonicalUrl: string,
    body?: unknown,
    options: { allowEmptyResponse?: boolean } = {},
  ): Promise<WechatPayRequestResult<T>> {
    const bodyText = body == null ? "" : JSON.stringify(body);
    const hosts = [WECHAT_PAY_MAIN_HOST, WECHAT_PAY_BACKUP_HOST];
    let lastError: Error | null = null;

    for (const host of hosts) {
      try {
        const result = await this.requestOnce<T>(host, method, canonicalUrl, bodyText, options);
        if (result.status >= 500 && host === WECHAT_PAY_MAIN_HOST) {
          lastError = new Error(`wechat pay gateway ${result.status}`);
          continue;
        }
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("wechat pay request failed");
        if (host === WECHAT_PAY_BACKUP_HOST) {
          break;
        }
      }
    }

    throw lastError || new Error("wechat pay request failed");
  }

  private async requestOnce<T>(
    host: string,
    method: string,
    canonicalUrl: string,
    bodyText: string,
    options: { allowEmptyResponse?: boolean },
  ) {
    const url = new URL(canonicalUrl, host);
    const auth = buildWechatPayAuthorization(this.config, method, `${url.pathname}${url.search}`, bodyText);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "identity",
          Authorization: auth.authorization,
          "Content-Type": "application/json",
          "User-Agent": "Make3D-WechatPay/1.0",
        },
        body: bodyText || undefined,
        signal: controller.signal,
      });
      const responseBody = await response.text();
      const requestId = response.headers.get("Request-ID") || response.headers.get("Wechatpay-Request-Id");

      if (responseBody && !verifyWechatPayHeaders(this.config, response.headers, responseBody)) {
        const serial = response.headers.get("Wechatpay-Serial") || "-";
        throw new Error(
          `wechat pay response signature verification failed (status ${response.status}, request ${requestId || "-"}, serial ${maskWechatIdentifier(serial)})`,
        );
      }

      if (!response.ok) {
        throw new Error(parseWechatPayError(response.status, responseBody));
      }

      const data =
        responseBody || options.allowEmptyResponse
          ? responseBody
            ? (JSON.parse(responseBody) as T)
            : ({} as T)
          : ({} as T);

      return {
        data,
        requestId,
        status: response.status,
        headers: response.headers,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readRequiredEnv(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for WeChat Pay`);
  }
  return value;
}

function readSecretFile(path: string) {
  const stats = statSync(path);
  if (!stats.isFile()) {
    throw new Error("wechat pay secret path is not a file");
  }

  if (process.platform !== "win32" && (stats.mode & 0o077) !== 0) {
    throw new Error("wechat pay secret file permissions are too broad");
  }

  return readFileSync(path, "utf8");
}

function canSignWithPrivateKey(privateKeyPem: string) {
  try {
    createWechatPaySignature(privateKeyPem, "make3d-config-self-check\n");
    return true;
  } catch {
    return false;
  }
}

function canVerifyWithPublicKey(publicKeyPem: string) {
  try {
    createPublicKey(publicKeyPem);
    return true;
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseIdList(value?: string) {
  return (value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function readHeader(headers: Headers | Record<string, string | null | undefined>, name: string) {
  if (headers instanceof Headers) {
    return headers.get(name) || headers.get(name.toLowerCase()) || null;
  }

  return headers[name] || headers[name.toLowerCase()] || null;
}

function parseWechatPayError(status: number, responseBody: string) {
  try {
    const parsed = JSON.parse(responseBody) as { code?: string; message?: string };
    return parsed.code ? `wechat pay ${status} ${parsed.code}: ${parsed.message || ""}` : `wechat pay ${status}`;
  } catch {
    return `wechat pay ${status}`;
  }
}

export function timingSafeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
