import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import {
  deleteCustomerInvoiceProfile,
  listCustomerInvoiceProfiles,
  openDatabase,
  updateCustomerInvoiceProfile,
} from "@/backend/database";
import {
  readInvoiceProfileInput,
  validateInvoiceProfileInput,
} from "@/shared/invoiceProfileValidation";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const profileId = Number((await params).id);

  if (!Number.isInteger(profileId) || profileId <= 0) {
    return NextResponse.json({ error: "发票资料不存在" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const input = readInvoiceProfileInput(body as Record<string, unknown>);
  const validationError = validateInvoiceProfileInput(input);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const db = openDatabase();

  try {
    const profile = updateCustomerInvoiceProfile(db, session.customerId, profileId, {
      ...input,
      isDefault: Boolean((body as { isDefault?: unknown }).isDefault),
    });
    return NextResponse.json({ profile, profiles: listCustomerInvoiceProfiles(db, session.customerId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发票资料更新失败" },
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

  const profileId = Number((await params).id);

  if (!Number.isInteger(profileId) || profileId <= 0) {
    return NextResponse.json({ error: "发票资料不存在" }, { status: 404 });
  }

  const db = openDatabase();

  try {
    deleteCustomerInvoiceProfile(db, session.customerId, profileId);
    return NextResponse.json({ profiles: listCustomerInvoiceProfiles(db, session.customerId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发票资料删除失败" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
