import { NextResponse } from "next/server";
import { openDatabase } from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { consumePaymentRateLimit } from "@/backend/paymentRateLimit";
import { getClientIp } from "@/backend/rateLimit";
import { createWechatPayment } from "@/backend/wechatPayService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rateLimit = consumePaymentRateLimit(`${customer.id}:${getClientIp(request)}`);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "too_many_payment_requests" }, { status: rateLimit.status || 429 });
  }

  try {
    const body = await request.json();
    const orderId = Number(body.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "invalid_order_id" }, { status: 400 });
    }

    const db = openDatabase();
    try {
      const result = await createWechatPayment(db, {
        orderId,
        customerId: customer.id,
        scenario: "native",
      });

      return NextResponse.json({
        payment: {
          paymentNo: result.payment.paymentNo,
          orderId: result.payment.orderId,
          scenario: result.payment.scenario,
          amountCents: result.payment.amountCents,
          status: result.payment.status,
          codeUrl: result.payment.codeUrl,
          expiresAt: result.payment.expiresAt,
        },
      });
    } finally {
      db.close();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wechat_native_payment_failed" },
      { status: 400 },
    );
  }
}
