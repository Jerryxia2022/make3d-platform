import { NextResponse } from "next/server";
import { openDatabase } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { queryWechatRefund } from "@/backend/wechatPayService";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ refundNo: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { refundNo } = await params;
  const db = openDatabase();
  try {
    const refund = await queryWechatRefund(db, refundNo);
    return NextResponse.json({ refund });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wechat_refund_query_failed" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
