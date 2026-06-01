const WINDOW_MS = 10 * 60 * 1000;
const MAX_UPLOADS_PER_WINDOW = 10;

type UploadRateLimitRecord = {
  count: number;
  windowStartedAt: number;
};

const uploadRateLimits = new Map<string, UploadRateLimitRecord>();

export function consumeUploadRateLimit(ip: string, now = Date.now()) {
  const key = ip || "unknown";
  const record = uploadRateLimits.get(key);

  if (!record || now - record.windowStartedAt >= WINDOW_MS) {
    uploadRateLimits.set(key, {
      count: 1,
      windowStartedAt: now,
    });
    return { allowed: true };
  }

  if (record.count >= MAX_UPLOADS_PER_WINDOW) {
    return {
      allowed: false,
      status: 429,
      retryAfterSeconds: Math.ceil((WINDOW_MS - (now - record.windowStartedAt)) / 1000),
    };
  }

  record.count += 1;
  return { allowed: true };
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

export function resetUploadRateLimit() {
  uploadRateLimits.clear();
}
