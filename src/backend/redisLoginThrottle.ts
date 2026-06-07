import type {
  AuthIdentifierType,
  CustomerLoginBlockResult,
} from "./customerLoginThrottle";

const WRONG_CREDENTIALS_MESSAGE = "手机号或密码错误，请重新输入";
const TEN_MINUTE_BLOCK_MESSAGE = "密码错误次数过多，请10分钟后再试";
const DAY_BLOCK_MESSAGE = "安全系统检测到异常，请24小时后再试";
const PERMANENT_BLOCK_MESSAGE = "当前请求暂不可用";
const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type RedisClient = Awaited<ReturnType<typeof createRedisClient>>;

type RedisAuthBlockRecord = {
  failedCount: number;
  blockStage: number;
  blockedUntil: number | null;
  permanentlyBlocked: boolean;
};

let clientPromise: Promise<RedisClient | null> | null = null;

export function isRedisLoginThrottleConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedisCustomerLoginBlock(
  identifierType: AuthIdentifierType,
  identifier: string,
  now = Date.now(),
) {
  const record = await getRedisAuthBlock(identifierType, identifier);
  return record ? getActiveBlockResult(record, now) : null;
}

export async function recordRedisCustomerLoginFailure(
  identifierType: AuthIdentifierType,
  identifier: string,
  now = Date.now(),
): Promise<CustomerLoginBlockResult> {
  const activeBlock = await getRedisCustomerLoginBlock(identifierType, identifier, now);

  if (activeBlock) {
    return activeBlock;
  }

  const record =
    (await getRedisAuthBlock(identifierType, identifier)) || createEmptyRedisAuthBlock();
  const failedCount = record.failedCount + 1;

  if (failedCount < 3) {
    const nextRecord = { ...record, failedCount };
    await setRedisAuthBlock(identifierType, identifier, nextRecord);

    return {
      allowed: true,
      failedCount,
      message: WRONG_CREDENTIALS_MESSAGE,
      status: 401,
    };
  }

  const nextStage = record.blockStage + 1;

  if (nextStage >= 3) {
    const nextRecord = {
      failedCount: 0,
      blockStage: nextStage,
      blockedUntil: null,
      permanentlyBlocked: true,
    };
    await setRedisAuthBlock(identifierType, identifier, nextRecord);

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
  const nextRecord = {
    failedCount: 0,
    blockStage: nextStage,
    blockedUntil,
    permanentlyBlocked: false,
  };
  await setRedisAuthBlock(identifierType, identifier, nextRecord);

  return {
    allowed: false,
    blockStage: nextStage,
    blockedUntil,
    permanentlyBlocked: false,
    message: nextStage === 1 ? TEN_MINUTE_BLOCK_MESSAGE : DAY_BLOCK_MESSAGE,
    status: 429,
  };
}

export async function clearRedisSuccessfulCustomerLoginFailures(phone: string) {
  const record = await getRedisAuthBlock("phone", phone);

  if (!record || record.permanentlyBlocked) {
    return;
  }

  await setRedisAuthBlock("phone", phone, {
    ...record,
    failedCount: 0,
    blockedUntil: null,
  });
}

async function getRedisAuthBlock(
  identifierType: AuthIdentifierType,
  identifier: string,
) {
  const client = await getRedisClient();

  if (!client) {
    return null;
  }

  const raw = await client.get(redisAuthBlockKey(identifierType, identifier));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RedisAuthBlockRecord;
  } catch {
    return createEmptyRedisAuthBlock();
  }
}

async function setRedisAuthBlock(
  identifierType: AuthIdentifierType,
  identifier: string,
  record: RedisAuthBlockRecord,
) {
  const client = await getRedisClient();

  if (!client) {
    return;
  }

  await client.set(redisAuthBlockKey(identifierType, identifier), JSON.stringify(record));
}

async function getRedisClient() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  clientPromise ||= createRedisClient().catch((error) => {
    console.warn("[make3d] redis login throttle unavailable", {
      error: error instanceof Error ? error.message : "unknown",
    });
    clientPromise = null;
    return null;
  });

  return clientPromise;
}

async function createRedisClient() {
  const { createClient } = await import("redis");
  const client = createClient({ url: process.env.REDIS_URL });

  client.on("error", (error) => {
    console.warn("[make3d] redis login throttle error", {
      error: error instanceof Error ? error.message : "unknown",
    });
  });

  await client.connect();
  return client;
}

function redisAuthBlockKey(identifierType: AuthIdentifierType, identifier: string) {
  return `make3d:auth:block:${identifierType}:${identifier}`;
}

function createEmptyRedisAuthBlock(): RedisAuthBlockRecord {
  return {
    failedCount: 0,
    blockStage: 0,
    blockedUntil: null,
    permanentlyBlocked: false,
  };
}

function getActiveBlockResult(record: RedisAuthBlockRecord, now: number) {
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
