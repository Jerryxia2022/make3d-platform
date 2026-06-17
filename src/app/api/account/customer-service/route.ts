import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import {
  createCustomerServiceRequest,
  getOrderByIdForCustomer,
  openDatabase,
} from "@/backend/database";

export const runtime = "nodejs";

const CATEGORIES = new Set([
  "quote",
  "file",
  "payment",
  "production",
  "logistics",
  "after_sales",
  "invoice",
  "other",
]);

export async function POST(request: Request) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "请先登录后提交客服请求" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const message = readString(body.message);

  if (!message || message.length > 1000) {
    return NextResponse.json({ error: "请填写 1-1000 字的问题说明" }, { status: 400 });
  }

  const orderId = readPositiveInteger(body.orderId);
  const category = CATEGORIES.has(readString(body.category)) ? readString(body.category) : "other";
  const db = openDatabase();

  try {
    if (orderId) {
      getOrderByIdForCustomer(db, orderId, session.customerId);
    }

    const requestRecord = createCustomerServiceRequest(db, {
      customerId: session.customerId,
      orderId,
      message,
      source: readString(body.source) || "website_floating",
      category,
    });

    return NextResponse.json({ ok: true, request: requestRecord }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "客服请求提交失败" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
