import { NextResponse } from "next/server";
import { openDatabase } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { refundWechatPayment } from "@/backend/wechatPayService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentNo: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { paymentNo } = await params;
  const body = await request.json();
  const amountCents = Number(body.amountCents);
  const reason = typeof body.reason === "string" ? body.reason : "";
  const confirmText = typeof body.confirmText === "string" ? body.confirmText.trim() : "";

  if (confirmText !== "REFUND") {
    return NextResponse.json({ error: "refund_confirmation_required" }, { status: 400 });
  }

  const db = openDatabase();
  try {
    const refund = await refundWechatPayment(db, {
      paymentNo,
      amountCents,
      reason,
      adminId: "admin",
    });
    return NextResponse.json({ refund });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wechat_refund_failed" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
