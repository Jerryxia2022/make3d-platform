import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "make3d_admin";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function verifyAdminCredentials(username: string, password: string) {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return false;
  }

  return username === expectedUsername && password === expectedPassword;
}

export function createAdminSessionToken(now = Date.now()) {
  const expiresAt = now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${expiresAt}.${nonce}`;
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(token?: string, now = Date.now()) {
  if (!token) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return false;
  }

  const [expiresAtText, nonce, signature] = parts;
  const expiresAt = Number(expiresAtText);

  if (!Number.isFinite(expiresAt) || expiresAt < now || !nonce || !signature) {
    return false;
  }

  const expectedSignature = signPayload(`${expiresAtText}.${nonce}`);
  return safeEqual(signature, expectedSignature);
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

export function getAdminLogoutCookieOptions() {
  return {
    ...getAdminCookieOptions(),
    maxAge: 0,
  };
}

export function createAdminLoginRedirectResponse(sessionToken: string) {
  const response = createRelativeRedirectResponse("/admin/orders");
  response.headers.append(
    "Set-Cookie",
    serializeCookie(ADMIN_SESSION_COOKIE, sessionToken, getAdminCookieOptions()),
  );

  return response;
}

export function createAdminLogoutRedirectResponse() {
  const response = createRelativeRedirectResponse("/admin/login");
  response.headers.append(
    "Set-Cookie",
    serializeCookie(ADMIN_SESSION_COOKIE, "", getAdminLogoutCookieOptions()),
  );

  return response;
}

function createRelativeRedirectResponse(location: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
    },
  });
}

function serializeCookie(
  name: string,
  value: string,
  options: ReturnType<typeof getAdminCookieOptions>,
) {
  const parts = [`${name}=${value}`, `Path=${options.path}`, `Max-Age=${options.maxAge}`];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

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
