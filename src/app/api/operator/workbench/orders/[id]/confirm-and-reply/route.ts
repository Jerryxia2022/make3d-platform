import { NextResponse } from "next/server.js";
import { initDatabase } from "../../../../../../../backend/database.ts";
import {
  confirmAndReplyToTestOrder,
  OrderWorkbenchWriteError,
} from "../../../../../../../backend/orderWorkbenchOnlineSync.ts";
import {
  isOperatorWorkbenchAuthContext,
  requireOperatorWorkbenchAuth,
} from "../../../../../../../backend/operatorWorkbench.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireOperatorWorkbenchAuth(request);
  if (!isOperatorWorkbenchAuthContext(auth)) return auth;

  const { id } = await context.params;
  const orderId = Number(id);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "Invalid order id", code: "INVALID_ORDER_ID" }, { status: 422 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 422 });
  }

  const db = initDatabase();
  try {
    const result = confirmAndReplyToTestOrder(db, orderId, allowlistedInput(body));
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof OrderWorkbenchWriteError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  } finally {
    db.close();
  }
}

function allowlistedInput(body: unknown) {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    client_request_id: input.client_request_id,
    expected_order_version: input.expected_order_version,
    confirmed_quote_amount_cents: input.confirmed_quote_amount_cents,
    lead_time_min_hours: input.lead_time_min_hours,
    lead_time_max_hours: input.lead_time_max_hours,
    estimated_ship_at: input.estimated_ship_at,
    expected_ship_date: input.expected_ship_date,
    price_adjustment_reason: input.price_adjustment_reason,
    production_note: input.production_note,
    message_type: input.message_type,
    message_body: input.message_body,
  };
}
