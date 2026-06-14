import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import { deleteQuoteDraftFile, openDatabase, updateQuoteDraftFile } from "@/backend/database";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const input = await request.json().catch(() => ({}));
  const db = openDatabase();

  try {
    updateQuoteDraftFile(db, session.customerId, Number(id), {
      material: readOptionalString(input.material),
      color: readOptionalString(input.color),
      quantity: readOptionalQuantity(input.quantity),
      boundingBoxX: readOptionalPositiveNumber(input.boundingBoxX),
      boundingBoxY: readOptionalPositiveNumber(input.boundingBoxY),
      boundingBoxZ: readOptionalPositiveNumber(input.boundingBoxZ),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "草稿更新失败" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}

export async function DELETE(
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
    deleteQuoteDraftFile(db, session.customerId, Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "草稿文件删除失败" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalQuantity(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000 ? parsed : undefined;
}

function readOptionalPositiveNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
