import { NextResponse } from "next/server.js";
import { openDatabase } from "../../../../../backend/database.ts";
import {
  isOperatorWorkbenchAuthContext,
  listOperatorWorkbenchOrders,
  requireOperatorWorkbenchAuth,
} from "../../../../../backend/operatorWorkbench.ts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireOperatorWorkbenchAuth(request);

  if (!isOperatorWorkbenchAuthContext(auth)) {
    return auth;
  }

  const url = new URL(request.url);
  const db = openDatabase();

  try {
    return NextResponse.json(
      listOperatorWorkbenchOrders(db, {
        query: url.searchParams.get("q"),
        status: url.searchParams.get("status"),
        syncStatus: url.searchParams.get("sync_status"),
        limit: Number(url.searchParams.get("limit") || 50),
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    db.close();
  }
}
