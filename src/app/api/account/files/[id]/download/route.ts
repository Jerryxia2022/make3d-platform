import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import { getFileById, getOrderByIdForCustomer, openDatabase } from "@/backend/database";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const db = openDatabase();

  try {
    const file = getFileById(db, Number(id));
    getOrderByIdForCustomer(db, file.orderId, session.customerId);
    const content = await readFile(file.filepath);

    return new NextResponse(content, {
      headers: {
        "Content-Disposition": `inline; filename="${basename(file.filename)}"`,
        "Content-Type": "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  } finally {
    db.close();
  }
}
