import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import { getActiveQuoteDraft, openDatabase } from "@/backend/database";

export const runtime = "nodejs";

export function GET(request: Request) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ draft: null }, { status: 401 });
  }

  const db = openDatabase();

  try {
    return NextResponse.json({
      draft: getActiveQuoteDraft(db, session.customerId),
    });
  } finally {
    db.close();
  }
}
