import { randomBytes, timingSafeEqual } from "node:crypto";

export function createCsrfToken() {
  return randomBytes(24).toString("base64url");
}

export function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data:",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
    ].join("; "),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export function isAllowedHost(hostHeader, port) {
  const host = String(hostHeader || "").toLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function isSameOrigin(headers, port) {
  const allowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const origin = headers.origin || headers.Origin || "";
  const referer = headers.referer || headers.Referer || "";
  if (origin && !allowed.has(String(origin).replace(/\/+$/, ""))) return false;
  if (referer) {
    try {
      const url = new URL(referer);
      if (!allowed.has(url.origin)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function safeTokenEqual(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
