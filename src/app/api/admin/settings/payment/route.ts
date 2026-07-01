import { NextResponse } from "next/server";
import { openDatabase, updatePaymentSettings } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const db = openDatabase();

    try {
      updatePaymentSettings(db, {
        wechatQrPath: getOptionalString(body.wechatQrImagePath || body.wechatQrPath),
        alipayQrPath: getOptionalString(body.alipayQrImagePath || body.alipayQrPath),
        wechatEnabled: Boolean(body.wechatEnabled),
        wechatDisplayName: getOptionalString(body.wechatDisplayName) || "微信转账",
        wechatQrImagePath: getOptionalString(body.wechatQrImagePath || body.wechatQrPath),
        wechatPaymentInstruction: getOptionalString(body.wechatPaymentInstruction),
        alipayEnabled: Boolean(body.alipayEnabled),
        alipayDisplayName: getOptionalString(body.alipayDisplayName) || "支付宝转账",
        alipayQrImagePath: getOptionalString(body.alipayQrImagePath || body.alipayQrPath),
        alipayPaymentInstruction: getOptionalString(body.alipayPaymentInstruction),
        bankEnabled: Boolean(body.bankEnabled),
        bankAccountName: getOptionalString(body.bankAccountName),
        bankName: getOptionalString(body.bankName),
        bankBranch: getOptionalString(body.bankBranch),
        bankAccount: getOptionalString(body.bankAccount),
        bankPaymentInstruction: getOptionalString(body.bankPaymentInstruction),
        paymentNotice: getOptionalString(body.paymentNotice),
        customerServiceHours: getOptionalString(body.customerServiceHours),
        serviceAccountQrPath: getOptionalString(body.serviceAccountQrPath),
        publicSecurityRecordNumber: getOptionalString(body.publicSecurityRecordNumber),
        publicSecurityRecordUrl: getOptionalString(body.publicSecurityRecordUrl),
        publicSecurityRecordEnabled: Boolean(body.publicSecurityRecordEnabled),
      });

      return NextResponse.json({ ok: true });
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "付款设置保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}
