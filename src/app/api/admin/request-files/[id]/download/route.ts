import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { NextResponse } from "next/server";
import { getServiceRequestFileById, openDatabase } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const db = openDatabase();

  try {
    const file = getServiceRequestFileById(db, Number(id));
    const content = await readFile(file.filepath);

    return new NextResponse(content, {
      headers: {
        "Content-Disposition": `attachment; filename="${basename(file.filename)}"`,
        "Content-Type": "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  } finally {
    db.close();
  }
}
