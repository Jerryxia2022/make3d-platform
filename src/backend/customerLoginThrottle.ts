import type { DatabaseSync } from "node:sqlite";

export type AuthIdentifierType = "phone" | "ip";

export type CustomerLoginBlockResult = {
  allowed: boolean;
  failedCount?: number;
  blockStage?: number;
  blockedUntil?: number | null;
  permanentlyBlocked?: boolean;
  message: string;
  status: 401 | 403 | 429;
};

const WRONG_CREDENTIALS_MESSAGE = "手机号或密码错误，请重新输入";
const TEN_MINUTE_BLOCK_MESSAGE = "密码错误次数过多，请10分钟后再试";
const DAY_BLOCK_MESSAGE = "安全系统检测到异常，请24小时后再试";
const PERMANENT_BLOCK_MESSAGE = "当前请求暂不可用";
const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type AuthBlockRecord = {
  id: number;
  identifierType: AuthIdentifierType;
  identifier: string;
  failedCount: number;
  blockStage: number;
  blockedUntil: number | null;
  permanentlyBlocked: 0 | 1;
};

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) {
    return forwardedFor;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "127.0.0.1";
}

export function getCustomerLoginBlock(
  db: DatabaseSync,
  identifierType: AuthIdentifierType,
  identifier: string,
  now = Date.now(),
): CustomerLoginBlockResult | null {
  const record = getAuthBlock(db, identifierType, identifier);

  if (!record) {
    return null;
  }

  return getActiveBlockResult(record, now);
}

export function recordCustomerLoginFailure(
  db: DatabaseSync,
  identifierType: AuthIdentifierType,
  identifier: string,
  now = Date.now(),
): CustomerLoginBlockResult {
  const activeBlock = getCustomerLoginBlock(db, identifierType, identifier, now);

  if (activeBlock) {
    return activeBlock;
  }

  const record = ensureAuthBlock(db, identifierType, identifier);
  const failedCount = record.failedCount + 1;

  if (failedCount < 3) {
    db.prepare(
      `UPDATE auth_blocks
       SET failed_count = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(failedCount, record.id);

    return {
      allowed: true,
      failedCount,
      message: WRONG_CREDENTIALS_MESSAGE,
      status: 401,
    };
  }

  const nextStage = record.blockStage + 1;

  if (nextStage >= 3) {
    db.prepare(
      `UPDATE auth_blocks
       SET failed_count = 0,
           block_stage = ?,
           blocked_until = NULL,
           permanently_blocked = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(nextStage, record.id);

    return {
      allowed: false,
      blockStage: nextStage,
      blockedUntil: null,
      permanentlyBlocked: true,
      message: PERMANENT_BLOCK_MESSAGE,
      status: 403,
    };
  }

  const blockedUntil = now + (nextStage === 1 ? TEN_MINUTES_MS : ONE_DAY_MS);
  db.prepare(
    `UPDATE auth_blocks
     SET failed_count = 0,
         block_stage = ?,
         blocked_until = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(nextStage, blockedUntil, record.id);

  return {
    allowed: false,
    blockStage: nextStage,
    blockedUntil,
    permanentlyBlocked: false,
    message: nextStage === 1 ? TEN_MINUTE_BLOCK_MESSAGE : DAY_BLOCK_MESSAGE,
    status: 429,
  };
}

export function clearSuccessfulCustomerLoginFailures(db: DatabaseSync, phone: string) {
  db.prepare(
    `UPDATE auth_blocks
     SET failed_count = 0,
         blocked_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE identifier_type = 'phone'
       AND identifier = ?
       AND permanently_blocked = 0`,
  ).run(phone);
}

function ensureAuthBlock(
  db: DatabaseSync,
  identifierType: AuthIdentifierType,
  identifier: string,
) {
  db.prepare(
    `INSERT OR IGNORE INTO auth_blocks (
      identifier_type,
      identifier,
      failed_count,
      block_stage,
      permanently_blocked
    ) VALUES (?, ?, 0, 0, 0)`,
  ).run(identifierType, identifier);

  return getAuthBlock(db, identifierType, identifier) as AuthBlockRecord;
}

function getAuthBlock(
  db: DatabaseSync,
  identifierType: AuthIdentifierType,
  identifier: string,
) {
  const record = db
    .prepare(
      `SELECT
        id,
        identifier_type AS identifierType,
        identifier,
        failed_count AS failedCount,
        block_stage AS blockStage,
        blocked_until AS blockedUntil,
        permanently_blocked AS permanentlyBlocked
       FROM auth_blocks
       WHERE identifier_type = ? AND identifier = ?
       LIMIT 1`,
    )
    .get(identifierType, identifier) as AuthBlockRecord | undefined;

  return record || null;
}

function getActiveBlockResult(record: AuthBlockRecord, now: number) {
  if (record.permanentlyBlocked) {
    return {
      allowed: false,
      blockStage: record.blockStage,
      blockedUntil: null,
      permanentlyBlocked: true,
      message: PERMANENT_BLOCK_MESSAGE,
      status: 403,
    } satisfies CustomerLoginBlockResult;
  }

  if (record.blockedUntil && record.blockedUntil > now) {
    return {
      allowed: false,
      blockStage: record.blockStage,
      blockedUntil: record.blockedUntil,
      permanentlyBlocked: false,
      message: record.blockStage === 1 ? TEN_MINUTE_BLOCK_MESSAGE : DAY_BLOCK_MESSAGE,
      status: 429,
    } satisfies CustomerLoginBlockResult;
  }

  return null;
}
