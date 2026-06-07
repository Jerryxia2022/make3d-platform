import { NextResponse } from "next/server";
import { confirmOrderPayment, getOrderById, openDatabase } from "@/backend/database";
import { notifyCustomerOrderStatus } from "@/backend/email";
import { requireAdminSession } from "@/backend/nextAdmin";

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
      const updated = confirmOrderPayment(db, orderId, {
        paymentMethod: getOptionalString(body.paymentMethod),
        paymentNote: getOptionalString(body.paymentNote),
        operator: "admin",
      });

      if (!updated) {
        return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      }

      const order = getOrderById(db, orderId);
      await notifyCustomerOrderStatus(order);

      return NextResponse.json({ ok: true });
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
