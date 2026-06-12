import { NextResponse } from "next/server";
import { openDatabase, updateServiceRequestStatus } from "@/backend/database";
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
  const body = await request.json();
  const db = openDatabase();

  try {
    const updated = updateServiceRequestStatus(db, Number(id), {
      status: String(body.status || ""),
      adminNote: getOptionalString(body.adminNote),
      contactNote: getOptionalString(body.contactNote),
      operator: "admin",
    });

    if (!updated) {
      return NextResponse.json({ error: "需求不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "需求状态更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    db.close();
  }
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
