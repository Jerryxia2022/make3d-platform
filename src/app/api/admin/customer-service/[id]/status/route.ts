import { NextResponse } from "next/server";
import {
  CUSTOMER_SERVICE_REQUEST_STATUSES,
  openDatabase,
  updateCustomerServiceRequest,
  type CustomerServiceRequestStatus,
} from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = readStatus(body.status) || "resolved";
  const db = openDatabase();

  try {
    const updated = updateCustomerServiceRequest(db, Number(id), {
      status,
      adminNote: readString(body.adminNote),
      customerVisibleReply: readString(body.customerVisibleReply),
      handledBy: "admin",
    });

    if (!updated) {
      return NextResponse.json({ error: "客服请求不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    db.close();
  }
}

function readStatus(value: unknown): CustomerServiceRequestStatus | null {
  return typeof value === "string" &&
    CUSTOMER_SERVICE_REQUEST_STATUSES.includes(value as CustomerServiceRequestStatus)
    ? (value as CustomerServiceRequestStatus)
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}
