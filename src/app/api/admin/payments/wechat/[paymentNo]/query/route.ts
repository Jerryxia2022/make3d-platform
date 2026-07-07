import { NextResponse } from "next/server";
import { openDatabase } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { refreshWechatPaymentStatus } from "@/backend/wechatPayService";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ paymentNo: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { paymentNo } = await params;
  const db = openDatabase();
  try {
    const payment = await refreshWechatPaymentStatus(db, paymentNo, { forceQuery: true });
    return NextResponse.json({ payment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wechat_payment_query_failed" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
