import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clearSuccessfulCustomerLoginFailures,
  getClientIp,
  getCustomerLoginBlock,
  recordCustomerLoginFailure,
} from "../src/backend/customerLoginThrottle.ts";
import { initDatabase } from "../src/backend/database.ts";

const wrongMessage = "手机号或密码错误，请重新输入";
const tenMinuteMessage = "密码错误次数过多，请10分钟后再试";
const dayMessage = "安全系统检测到异常，请24小时后再试";
const permanentMessage = "当前请求暂不可用";

test("customer login failures escalate by phone from 401 to 10 minute, 24 hour, and permanent blocks", () => {
  const db = initDatabase(":memory:");
  const now = 1_700_000_000_000;
  const phone = "13800000000";

  try {
    assert.deepEqual(recordCustomerLoginFailure(db, "phone", phone, now), {
      allowed: true,
      failedCount: 1,
      message: wrongMessage,
      status: 401,
    });
    assert.deepEqual(recordCustomerLoginFailure(db, "phone", phone, now + 1000), {
      allowed: true,
      failedCount: 2,
      message: wrongMessage,
      status: 401,
    });

    const firstBlock = recordCustomerLoginFailure(db, "phone", phone, now + 2000);
    assert.equal(firstBlock.allowed, false);
    assert.equal(firstBlock.status, 429);
    assert.equal(firstBlock.message, tenMinuteMessage);
    assert.equal(firstBlock.blockStage, 1);
    assert.equal(firstBlock.blockedUntil, now + 2000 + 10 * 60 * 1000);
    assert.equal(getCustomerLoginBlock(db, "phone", phone, now + 3000).message, tenMinuteMessage);

    const afterTenMinutes = now + 2000 + 10 * 60 * 1000 + 1;
    recordCustomerLoginFailure(db, "phone", phone, afterTenMinutes);
    recordCustomerLoginFailure(db, "phone", phone, afterTenMinutes + 1000);
    const secondBlock = recordCustomerLoginFailure(db, "phone", phone, afterTenMinutes + 2000);
    assert.equal(secondBlock.status, 429);
    assert.equal(secondBlock.message, dayMessage);
    assert.equal(secondBlock.blockStage, 2);

    const afterOneDay = afterTenMinutes + 2000 + 24 * 60 * 60 * 1000 + 1;
    recordCustomerLoginFailure(db, "phone", phone, afterOneDay);
    recordCustomerLoginFailure(db, "phone", phone, afterOneDay + 1000);
    const permanent = recordCustomerLoginFailure(db, "phone", phone, afterOneDay + 2000);
    assert.equal(permanent.status, 403);
    assert.equal(permanent.message, permanentMessage);
    assert.equal(permanent.permanentlyBlocked, true);
    assert.equal(getCustomerLoginBlock(db, "phone", phone, afterOneDay + 3000).status, 403);
  } finally {
    db.close();
  }
});

test("successful customer login clears phone failures but not IP block stage or permanent blocks", () => {
  const db = initDatabase(":memory:");
  const now = 1_700_000_000_000;
  const phone = "13900000000";
  const ip = "203.0.113.8";

  try {
    recordCustomerLoginFailure(db, "phone", phone, now);
    recordCustomerLoginFailure(db, "phone", phone, now + 1000);
    recordCustomerLoginFailure(db, "ip", ip, now);
    recordCustomerLoginFailure(db, "ip", ip, now + 1000);
    recordCustomerLoginFailure(db, "ip", ip, now + 2000);
    clearSuccessfulCustomerLoginFailures(db, phone);

    const phoneRecord = getAuthBlockRecord(db, "phone", phone);
    const ipRecord = getAuthBlockRecord(db, "ip", ip);
    assert.equal(phoneRecord.failed_count, 0);
    assert.equal(phoneRecord.blocked_until, null);
    assert.equal(ipRecord.block_stage, 1);
    assert.equal(ipRecord.blocked_until > now, true);
  } finally {
    db.close();
  }
});

test("IP dimension can independently trigger a customer login block", () => {
  const db = initDatabase(":memory:");
  const now = 1_700_000_000_000;
  const ip = "198.51.100.7";

  try {
    recordCustomerLoginFailure(db, "ip", ip, now);
    recordCustomerLoginFailure(db, "ip", ip, now + 1000);
    const block = recordCustomerLoginFailure(db, "ip", ip, now + 2000);

    assert.equal(block.status, 429);
    assert.equal(block.message, tenMinuteMessage);
    assert.equal(getCustomerLoginBlock(db, "ip", ip, now + 3000).status, 429);
  } finally {
    db.close();
  }
});

test("customer login IP helper prefers forwarded headers", () => {
  assert.equal(
    getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1" } })),
    "203.0.113.4",
  );
  assert.equal(
    getClientIp(new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.2" } })),
    "198.51.100.2",
  );
  assert.equal(getClientIp(new Request("http://localhost")), "127.0.0.1");
});

function getAuthBlockRecord(db, type, identifier) {
  return db
    .prepare("SELECT * FROM auth_blocks WHERE identifier_type = ? AND identifier = ?")
    .get(type, identifier);
}
