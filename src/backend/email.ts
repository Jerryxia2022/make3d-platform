import nodemailer from "nodemailer";
import type { CreatedOrder, OrderInput, OrderRecord } from "./database";

export type NewOrderEmailOrder = CreatedOrder &
  Pick<
    OrderInput,
    | "customerName"
    | "phone"
    | "wechat"
    | "company"
    | "material"
    | "quantity"
    | "remark"
    | "estimatedPrice"
    | "estimatedLeadTimeMaxHours"
    | "estimatedLeadTimeHours"
  >;

export type MailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

export type MailTransport = {
  sendMail: (message: MailMessage) => Promise<unknown>;
};

export type OrderStatusEmailOrder = Pick<
  OrderRecord,
  | "id"
  | "orderNo"
  | "email"
  | "status"
  | "phone"
  | "finalPrice"
  | "finalLeadTimeHours"
  | "shippingCompany"
  | "trackingNumber"
>;

const CUSTOMER_STATUS_EMAIL_STATUSES = new Set(["待付款", "已付款", "生产中", "已发货", "已完成"]);

export function buildNewOrderEmail(order: NewOrderEmailOrder, appUrl = getAppUrl()): MailMessage {
  const detailUrl = `${appUrl.replace(/\/$/, "")}/admin/orders/${order.id}`;

  return {
    from: process.env.SMTP_USER || "",
    to: process.env.ADMIN_EMAIL || "",
    subject: `Make3D 新订单通知 - ${order.orderNo}`,
    text: [
      "Make3D 收到一笔新订单。",
      "",
      `订单编号：${order.orderNo}`,
      `客户姓名：${order.customerName}`,
      `电话：${order.phone}`,
      `微信：${order.wechat}`,
      `公司名称：${order.company || "-"}`,
      `材料：${order.material}`,
      `数量：${order.quantity}`,
      `总价：${formatMoney(order.estimatedPrice)}`,
      `预计交货期：${formatLeadTime(order.estimatedLeadTimeHours ?? order.estimatedLeadTimeMaxHours)}`,
      `备注：${order.remark || "-"}`,
      "",
      `后台订单详情：${detailUrl}`,
    ].join("\n"),
  };
}

export function buildPasswordResetEmail(to: string, resetUrl: string): MailMessage {
  return {
    from: process.env.SMTP_USER || "",
    to,
    subject: "Make3D 密码重置",
    text: [
      "您正在重置 Make3D 账号密码。",
      "请在30分钟内点击链接完成重置。",
      resetUrl,
      "如果不是本人操作，请忽略此邮件。",
    ].join("\n"),
  };
}

export function buildOrderStatusEmail(
  order: OrderStatusEmailOrder,
  appUrl = getAppUrl(),
): MailMessage {
  const detailUrl = `${appUrl.replace(/\/$/, "")}/account/orders/${order.id}`;
  const lines = [
    "您的 Make3D 订单状态已更新。",
    "",
    `订单编号：${order.orderNo}`,
    `当前状态：${order.status}`,
    `订单详情：${detailUrl}`,
  ];

  if (order.status === "待付款") {
    lines.push(`最终报价：${formatMoney(order.finalPrice)}`);
    lines.push(`预计交货期：${formatLeadTime(order.finalLeadTimeHours)}`);
    lines.push("请按最终报价付款，付款时请备注订单编号或注册手机号，便于我们核对。");
    lines.push(`付款入口：${detailUrl}`);
    lines.push(`备注建议：${order.orderNo}/${order.phone || "-"}`);
  }

  if (order.status === "已付款") {
    lines.push("付款已确认，订单已进入生产准备。");
  }

  if (order.status === "已发货") {
    lines.push(`快递公司：${order.shippingCompany || "-"}`);
    lines.push(`快递单号：${order.trackingNumber || "待填写"}`);
  }

  return {
    from: process.env.SMTP_USER || "",
    to: order.email || "",
    subject: `Make3D 订单状态更新 - ${order.orderNo}`,
    text: lines.join("\n"),
  };
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  transport = createSmtpTransport(),
) {
  if (!hasSmtpConfig()) {
    return { sent: false, skipped: true };
  }

  try {
    await transport.sendMail(buildPasswordResetEmail(to, resetUrl));
    return { sent: true };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error("邮件发送失败");
    return { sent: false, error: normalizedError };
  }
}

function formatMoney(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} 元` : "-";
}

function formatLeadTime(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `约${value}小时` : "-";
}

export async function notifyAdminNewOrder(
  order: NewOrderEmailOrder,
  transport = createSmtpTransport(),
) {
  if (!hasSmtpConfig()) {
    return { sent: false, skipped: true };
  }

  try {
    await transport.sendMail(buildNewOrderEmail(order));
    return { sent: true };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error("邮件发送失败");
    return { sent: false, error: normalizedError };
  }
}

export async function notifyCustomerOrderStatus(
  order: OrderStatusEmailOrder,
  transport = createSmtpTransport(),
) {
  if (!CUSTOMER_STATUS_EMAIL_STATUSES.has(order.status) || !order.email) {
    return { sent: false, skipped: true };
  }

  if (!hasSmtpConfig()) {
    return { sent: false, skipped: true };
  }

  try {
    await transport.sendMail(buildOrderStatusEmail(order));
    return { sent: true };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error("邮件发送失败");
    return { sent: false, error: normalizedError };
  }
}

function createSmtpTransport(): MailTransport {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.ADMIN_EMAIL,
  );
}

function getAppUrl() {
  return process.env.APP_URL || "https://make3d.com.cn";
}
