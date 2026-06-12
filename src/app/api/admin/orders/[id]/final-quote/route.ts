import { NextResponse } from "next/server";
import { confirmOrderFinalQuote, getOrderById, openDatabase } from "@/backend/database";
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
      const updated = confirmOrderFinalQuote(db, orderId, {
        finalPrice: parseFinalPrice(body.finalPrice),
        finalLeadTimeHours: parseOptionalInteger(body.finalLeadTimeHours),
        priceAdjustmentReason: getOptionalString(body.priceAdjustmentReason),
        productionNote: getOptionalString(body.productionNote),
        operator: "admin",
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
    const message = error instanceof Error ? error.message : "最终报价保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseFinalPrice(value: unknown) {
  const price = Number(value);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("没有最终报价不能进入待付款");
  }

  return Math.round(price * 100) / 100;
}

function parseOptionalInteger(value: unknown) {
  if (value === "" || value == null) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error("最终交货期必须为非负整数小时");
  }

  return Math.ceil(number);
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}
