import { NextResponse } from "next/server";
import { openDatabase } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { updateOrderStatusAndNotify } from "@/backend/orderWorkflow";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const db = openDatabase();

    try {
      const orderId = Number(id);
      const result = await updateOrderStatusAndNotify(db, orderId, {
        status: "已付款",
        paymentMethod: getOptionalString(body.paymentMethod),
        paymentNote: getOptionalString(body.paymentNote),
        paidAmount: getOptionalNumber(body.paidAmount),
        paidAt: getOptionalString(body.paidAt),
        payerName: getOptionalString(body.payerName),
        payerReference: getOptionalString(body.payerReference),
        platformTradeNo: getOptionalString(body.platformTradeNo),
        paymentDifferenceReason: getOptionalString(body.paymentDifferenceReason),
        operator: "admin",
      });

      if (!result.updated) {
        return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        emailError: result.emailError,
        wechatStatus: result.wechatResult?.sent
          ? "sent"
          : result.wechatResult?.reason || result.wechatResult?.error?.message || result.wechatError || null,
      });
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "确认到账失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getOptionalNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
