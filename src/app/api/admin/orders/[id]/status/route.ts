import { NextResponse } from "next/server";
import { openDatabase, updateOrderStatus } from "@/backend/database";
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
      const updated = updateOrderStatus(db, Number(id), String(body.status || ""));

      if (!updated) {
        return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      }

      return NextResponse.json({ ok: true });
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "状态更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
