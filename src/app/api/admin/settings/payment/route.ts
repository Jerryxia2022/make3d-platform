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
        wechatQrPath: getOptionalString(body.wechatQrPath),
        alipayQrPath: getOptionalString(body.alipayQrPath),
        xianyuUrl: getOptionalString(body.xianyuUrl),
        taobaoUrl: getOptionalString(body.taobaoUrl),
        otherNote: getOptionalString(body.otherNote),
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
