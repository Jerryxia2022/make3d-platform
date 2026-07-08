import { NextResponse } from "next/server";
import { getOrderByIdForCustomer, openDatabase } from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { getWechatPaymentByPaymentNo, refreshWechatPaymentStatus } from "@/backend/wechatPayService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const paymentNo = searchParams.get("paymentNo") || "";
  const forceQuery = searchParams.get("query") === "true";

  if (!paymentNo) {
    return NextResponse.json({ error: "payment_no_required" }, { status: 400 });
  }

  const db = openDatabase();
  try {
    const payment = getWechatPaymentByPaymentNo(db, paymentNo);
    if (!payment) {
      return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
    }

    getOrderByIdForCustomer(db, payment.orderId, customer.id);
    const refreshed = forceQuery ? await refreshWechatPaymentStatus(db, paymentNo, { forceQuery: true }) : payment;
    return NextResponse.json({
      payment: {
        paymentNo: refreshed.paymentNo,
        orderId: refreshed.orderId,
        scenario: refreshed.scenario,
        amountCents: refreshed.amountCents,
        status: refreshed.status,
        codeUrl: refreshed.codeUrl,
        expiresAt: refreshed.expiresAt,
        paidAt: refreshed.paidAt,
        refundedAmountCents: refreshed.refundedAmountCents,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wechat_payment_status_failed" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
