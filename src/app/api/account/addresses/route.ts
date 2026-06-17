import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import {
  createCustomerAddress,
  listCustomerAddresses,
  openDatabase,
} from "@/backend/database";
import {
  readCustomerAddressInput,
  validateAndNormalizeCustomerAddressInput,
} from "@/shared/customerAddressValidation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const db = openDatabase();

  try {
    return NextResponse.json({ addresses: listCustomerAddresses(db, session.customerId) });
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
  const { input, error: validationError } = validateAndNormalizeCustomerAddressInput(
    readCustomerAddressInput(body),
  );

  if (validationError || !input) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const db = openDatabase();

  try {
    const address = createCustomerAddress(db, session.customerId, input);
    return NextResponse.json({ address, addresses: listCustomerAddresses(db, session.customerId) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "地址新增失败" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
