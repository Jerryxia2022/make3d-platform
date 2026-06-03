import nodemailer from "nodemailer";
import type { CreatedOrder, OrderInput } from "./database";

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
