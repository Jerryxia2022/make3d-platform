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
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export function isAllowedHost(hostHeader, port) {
  const host = String(hostHeader || "").toLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function isSameOrigin(headers, port) {
  return inspectLocalRequestOrigin(headers, port).ok;
}

export function inspectLocalRequestOrigin(headers, port) {
  const allowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const origin = normalizeOrigin(headers.origin || headers.Origin);
  const referer = normalizeRefererOrigin(headers.referer || headers.Referer);
  const fetchSite = String(headers["sec-fetch-site"] || headers["Sec-Fetch-Site"] || "")
    .trim()
    .toLowerCase();

  if (origin.invalid || referer.invalid) {
    return { ok: false, reason: "malformed-origin", origin: origin.value, referer: referer.value, fetchSite };
  }
  if (origin.value && !allowed.has(origin.value)) {
    return { ok: false, reason: "untrusted-origin", origin: origin.value, referer: referer.value, fetchSite };
  }
  if (referer.value && !allowed.has(referer.value)) {
    return { ok: false, reason: "untrusted-referer", origin: origin.value, referer: referer.value, fetchSite };
  }
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    return { ok: false, reason: "cross-site-fetch", origin: origin.value, referer: referer.value, fetchSite };
  }
  if (!origin.value && !referer.value && !["same-origin", "none"].includes(fetchSite)) {
    return { ok: false, reason: "missing-origin-evidence", origin: "", referer: "", fetchSite };
  }

  return { ok: true, reason: "trusted-local-origin", origin: origin.value, referer: referer.value, fetchSite };
}

export function safeTokenEqual(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function normalizeOrigin(value) {
  const text = String(value || "").trim();
  if (!text) return { value: "", invalid: false };
  if (text.toLowerCase() === "null") return { value: "null", invalid: true };
  try {
    const url = new URL(text);
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      return { value: text, invalid: true };
    }
    return { value: url.origin, invalid: false };
  } catch {
    return { value: text, invalid: true };
  }
}

function normalizeRefererOrigin(value) {
  const text = String(value || "").trim();
  if (!text) return { value: "", invalid: false };
  try {
    return { value: new URL(text).origin, invalid: false };
  } catch {
    return { value: text, invalid: true };
  }
}
