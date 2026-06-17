import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import {
  deleteCustomerAddress,
  listCustomerAddresses,
  openDatabase,
  updateCustomerAddress,
} from "@/backend/database";
import {
  readCustomerAddressInput,
  validateAndNormalizeCustomerAddressInput,
} from "@/shared/customerAddressValidation";

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
  const addressId = Number(id);

  if (!Number.isInteger(addressId) || addressId <= 0) {
    return NextResponse.json({ error: "地址不存在" }, { status: 404 });
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
    const address = updateCustomerAddress(db, session.customerId, addressId, input);
    return NextResponse.json({ address, addresses: listCustomerAddresses(db, session.customerId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "地址更新失败" },
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
  const addressId = Number(id);

  if (!Number.isInteger(addressId) || addressId <= 0) {
    return NextResponse.json({ error: "地址不存在" }, { status: 404 });
  }

  const db = openDatabase();

  try {
    deleteCustomerAddress(db, session.customerId, addressId);
    return NextResponse.json({ success: true, addresses: listCustomerAddresses(db, session.customerId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "地址删除失败" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
