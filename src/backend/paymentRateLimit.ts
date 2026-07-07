const WINDOW_MS = 5 * 60 * 1000;
const MAX_PAYMENT_REQUESTS_PER_WINDOW = 8;

type RateLimitRecord = {
  count: number;
  windowStartedAt: number;
};

const paymentRateLimits = new Map<string, RateLimitRecord>();

export function consumePaymentRateLimit(key: string, now = Date.now()) {
  const normalizedKey = key || "unknown";
  const record = paymentRateLimits.get(normalizedKey);

  if (!record || now - record.windowStartedAt >= WINDOW_MS) {
    paymentRateLimits.set(normalizedKey, {
      count: 1,
      windowStartedAt: now,
    });
    return { allowed: true };
  }

  if (record.count >= MAX_PAYMENT_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      status: 429,
      retryAfterSeconds: Math.ceil((WINDOW_MS - (now - record.windowStartedAt)) / 1000),
    };
  }

  record.count += 1;
  return { allowed: true };
}

export function resetPaymentRateLimit() {
  paymentRateLimits.clear();
}
