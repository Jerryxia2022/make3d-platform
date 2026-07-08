import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import {
  createCustomerInvoiceProfile,
  listCustomerInvoiceProfiles,
  openDatabase,
} from "@/backend/database";
import {
  readInvoiceProfileInput,
  validateInvoiceProfileInput,
} from "@/shared/invoiceProfileValidation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const db = openDatabase();

  try {
    return NextResponse.json({ profiles: listCustomerInvoiceProfiles(db, session.customerId) });
  } finally {
    db.close();
  }
}

export async function POST(request: Request) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const input = readInvoiceProfileInput(body as Record<string, unknown>);
  const validationError = validateInvoiceProfileInput(input);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const db = openDatabase();

  try {
    const profile = createCustomerInvoiceProfile(db, session.customerId, {
      ...input,
      isDefault: Boolean((body as { isDefault?: unknown }).isDefault),
    });
    return NextResponse.json(
      { profile, profiles: listCustomerInvoiceProfiles(db, session.customerId) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发票资料保存失败" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
