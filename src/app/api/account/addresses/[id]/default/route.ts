import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import {
  listCustomerAddresses,
  openDatabase,
  setCustomerDefaultAddress,
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

  const { id } = await params;
  const addressId = Number(id);

  if (!Number.isInteger(addressId) || addressId <= 0) {
    return NextResponse.json({ error: "地址不存在" }, { status: 404 });
  }

  const db = openDatabase();

  try {
    const address = setCustomerDefaultAddress(db, session.customerId, addressId);
    return NextResponse.json({ address, addresses: listCustomerAddresses(db, session.customerId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "默认地址设置失败" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
