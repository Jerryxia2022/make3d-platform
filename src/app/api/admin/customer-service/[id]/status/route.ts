import { NextResponse } from "next/server";
import { markCustomerServiceRequestHandled, openDatabase } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const db = openDatabase();

  try {
    const updated = markCustomerServiceRequestHandled(db, Number(id));

    if (!updated) {
      return NextResponse.json({ error: "客服请求不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    db.close();
  }
}
