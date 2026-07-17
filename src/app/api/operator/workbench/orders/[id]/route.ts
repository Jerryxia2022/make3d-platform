import { NextResponse } from "next/server.js";
import { openDatabase } from "../../../../../../backend/database.ts";
import {
  getOperatorWorkbenchOrderDetail,
  isOperatorWorkbenchAuthContext,
  requireOperatorWorkbenchAuth,
} from "../../../../../../backend/operatorWorkbench.ts";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireOperatorWorkbenchAuth(request);

  if (!isOperatorWorkbenchAuthContext(auth)) {
    return auth;
  }

  const params = await context.params;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const db = openDatabase();

  try {
    const detail = getOperatorWorkbenchOrderDetail(db, id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } finally {
    db.close();
  }
}
