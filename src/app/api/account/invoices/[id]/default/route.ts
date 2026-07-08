import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import {
  listCustomerInvoiceProfiles,
  openDatabase,
  setCustomerDefaultInvoiceProfile,
} from "@/backend/database";

export const runtime = "nodejs";

export async function POST(
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
    const profile = setCustomerDefaultInvoiceProfile(db, session.customerId, profileId);
    return NextResponse.json({ profile, profiles: listCustomerInvoiceProfiles(db, session.customerId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "默认发票资料更新失败" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
