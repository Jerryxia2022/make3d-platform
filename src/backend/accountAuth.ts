import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CUSTOMER_SESSION_COOKIE = "make3d_customer";
export const CUSTOMER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function createCustomerSessionToken(customerId: number, now = Date.now()) {
  const expiresAt = now + CUSTOMER_SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${customerId}.${expiresAt}.${nonce}`;
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function verifyCustomerSessionToken(token?: string, now = Date.now()) {
  if (!token) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const [customerIdText, expiresAtText, nonce, signature] = parts;
  const customerId = Number(customerIdText);
  const expiresAt = Number(expiresAtText);

  if (!Number.isInteger(customerId) || customerId <= 0 || !Number.isFinite(expiresAt) || expiresAt < now || !nonce || !signature) {
    return null;
  }

  const expectedSignature = signPayload(`${customerIdText}.${expiresAtText}.${nonce}`);
  return safeEqual(signature, expectedSignature) ? { customerId } : null;
}

export function getCustomerCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: CUSTOMER_SESSION_MAX_AGE_SECONDS,
  };
}

export function createCustomerLoginRedirectResponse(sessionToken: string) {
  const response = new Response(null, {
    status: 303,
    headers: { Location: "/quote" },
  });
  response.headers.append(
    "Set-Cookie",
    serializeCookie(CUSTOMER_SESSION_COOKIE, sessionToken, getCustomerCookieOptions()),
  );

  return response;
}

export function createCustomerLogoutResponse(status = 200, location?: string) {
  const headers = new Headers({
    "Set-Cookie": `${CUSTOMER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=lax`,
  });

  if (location) {
    headers.set("Location", location);
  }

  return new Response(null, { status, headers });
}

export function getCustomerFromRequestCookie(request: Request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CUSTOMER_SESSION_COOKIE}=`))
    ?.slice(CUSTOMER_SESSION_COOKIE.length + 1);

  return verifyCustomerSessionToken(token);
}

function serializeCookie(
  name: string,
  value: string,
  options: ReturnType<typeof getCustomerCookieOptions>,
) {
  const parts = [`${name}=${value}`, `Path=${options.path}`, `Max-Age=${options.maxAge}`];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

function signPayload(payload: string) {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET 未配置");
  }

  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}
