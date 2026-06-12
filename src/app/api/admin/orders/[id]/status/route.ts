import { NextResponse } from "next/server";
import { getOrderById, openDatabase, updateOrderStatus } from "@/backend/database";
import { notifyCustomerOrderStatus } from "@/backend/email";
import { requireAdminSession } from "@/backend/nextAdmin";
import { notifyWechatOrderStatus } from "@/backend/wechat";

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
      const updated = updateOrderStatus(db, orderId, {
        status: String(body.status || ""),
        operator: "admin",
        shippingCompany: getOptionalString(body.shippingCompany),
        trackingNumber: getOptionalString(body.trackingNumber),
        adminRemark: getOptionalString(body.adminRemark),
      });

      if (!updated) {
        return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      }

      const order = getOrderById(db, orderId);
      await notifyCustomerOrderStatus(order);
      await notifyWechatOrderStatus(db, order);

      return NextResponse.json({ ok: true });
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "状态更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}
