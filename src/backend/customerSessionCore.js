import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CUSTOMER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function createCustomerSessionToken(customerId, now = Date.now()) {
  const expiresAt = now + CUSTOMER_SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${customerId}.${expiresAt}.${nonce}`;
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function verifyCustomerSessionToken(token, now = Date.now()) {
  return verifyCustomerSessionTokenDetailed(token, now).session;
}

export function verifyCustomerSessionTokenDetailed(token, now = Date.now()) {
  if (!token) {
    return { session: null, error: "missing token" };
  }

  const parts = token.split(".");

  if (parts.length !== 4) {
    return { session: null, error: "invalid token format" };
  }

  const [customerIdText, expiresAtText, nonce, signature] = parts;
  const customerId = Number(customerIdText);
  const expiresAt = Number(expiresAtText);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { session: null, error: "invalid customer id" };
  }

  if (!Number.isFinite(expiresAt)) {
    return { session: null, error: "invalid expiry" };
  }

  if (expiresAt < now) {
    return { session: null, error: "token expired" };
  }

  if (!nonce || !signature) {
    return { session: null, error: "missing token fields" };
  }

  if (!process.env.SESSION_SECRET) {
    return { session: null, error: "SESSION_SECRET missing" };
  }

  const expectedSignature = signPayload(`${customerIdText}.${expiresAtText}.${nonce}`);
  return safeEqual(signature, expectedSignature)
    ? { session: { customerId }, error: null }
    : { session: null, error: "signature mismatch" };
}

function signPayload(payload) {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET 未配置");
  }

  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}
