import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildNewOrderEmail,
  notifyAdminNewOrder,
} from "../src/backend/email.ts";

const order = {
  id: 7,
  orderNo: "M3D202606010001234",
  customerName: "Jerry",
  phone: "13800000000",
  wechat: "make3d",
  company: "Make3D",
  material: "PLA",
  quantity: 2,
  remark: "尽快处理",
};

test("builds new order notification email with admin detail link", () => {
  const email = buildNewOrderEmail(order, "https://make3d.com.cn");

  assert.equal(email.subject, "Make3D 新订单通知 - M3D202606010001234");
  assert.equal(email.to, process.env.ADMIN_EMAIL || "");
  assert.match(email.text, /订单编号：M3D202606010001234/);
  assert.match(email.text, /客户姓名：Jerry/);
  assert.match(email.text, /电话：13800000000/);
  assert.match(email.text, /微信：make3d/);
  assert.match(email.text, /公司名称：Make3D/);
  assert.match(email.text, /材料：PLA/);
  assert.match(email.text, /数量：2/);
  assert.match(email.text, /备注：尽快处理/);
  assert.match(email.text, /后台订单详情：https:\/\/make3d\.com\.cn\/admin\/orders\/7/);
});

test("sends admin notification when SMTP configuration is complete", async () => {
  const previous = snapshotEnv();
  const sent = [];

  try {
    setSmtpEnv();

    const result = await notifyAdminNewOrder(order, {
      sendMail: async (message) => {
        sent.push(message);
      },
    });

    assert.equal(result.sent, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "admin@make3d.com.cn");
    assert.equal(sent[0].subject, "Make3D 新订单通知 - M3D202606010001234");
  } finally {
    restoreEnv(previous);
  }
});

test("does not throw when email delivery fails", async () => {
  const previous = snapshotEnv();

  try {
    setSmtpEnv();

    const result = await notifyAdminNewOrder(order, {
      sendMail: async () => {
        throw new Error("smtp unavailable");
      },
    });

    assert.equal(result.sent, false);
    assert.match(result.error.message, /smtp unavailable/);
  } finally {
    restoreEnv(previous);
  }
});

function setSmtpEnv() {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_USER = "robot@example.com";
  process.env.SMTP_PASS = "secret";
  process.env.ADMIN_EMAIL = "admin@make3d.com.cn";
  process.env.APP_URL = "https://make3d.com.cn";
}

function snapshotEnv() {
  return {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    APP_URL: process.env.APP_URL,
  };
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
