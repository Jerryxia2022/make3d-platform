import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import { createWechatBindCode, getCustomerById, openDatabase } from "@/backend/database";

export const runtime = "nodejs";

export function POST(request: Request) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "请先登录后生成绑定码" }, { status: 401 });
  }

  const db = openDatabase();

  try {
    const customer = getCustomerById(db, session.customerId);

    if (!customer) {
      return NextResponse.json({ error: "请先登录后生成绑定码" }, { status: 401 });
    }

    const bindCode = createWechatBindCode(db, customer.id);

    return NextResponse.json({
      bindCode: bindCode.bindCode,
      expiresAt: bindCode.expiresAt,
    });
  } finally {
    db.close();
  }
}
