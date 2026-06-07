import { NextResponse } from "next/server";
import { openDatabase, updateOrderFinalQuote } from "@/backend/database";
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
      const updated = updateOrderFinalQuote(db, Number(id), {
        finalPrice: parseFinalPrice(body.finalPrice),
        priceAdjustmentReason: getOptionalString(body.priceAdjustmentReason),
      });

      if (!updated) {
        return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      }

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
  if (value === "" || value == null) {
    return null;
  }

  const price = Number(value);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("最终报价必须为非负数字");
  }

  return Math.round(price * 100) / 100;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}
