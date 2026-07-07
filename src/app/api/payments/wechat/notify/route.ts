import { NextResponse } from "next/server";
import { notifyCustomerOrderStatus } from "@/backend/email";
import { getOrderById, openDatabase } from "@/backend/database";
import { notifyWechatOrderStatus } from "@/backend/wechat";
import { handleWechatPayNotify } from "@/backend/wechatPayService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const db = openDatabase();

  try {
    const result = await handleWechatPayNotify(db, rawBody, request.headers);
    const order = getOrderById(db, result.payment.orderId);

    if (result.newlyConfirmed) {
      await notifyCustomerOrderStatus(order).catch(() => null);
      await notifyWechatOrderStatus(db, order).catch(() => null);
    }

    return NextResponse.json({ code: "SUCCESS", message: "success" });
  } catch {
    return NextResponse.json({ code: "FAIL", message: "wechat pay notify failed" }, { status: 500 });
  } finally {
    db.close();
  }
}
