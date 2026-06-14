import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import {
  createCustomerAddress,
  listCustomerAddresses,
  openDatabase,
  type CustomerAddressInput,
} from "@/backend/database";

export const runtime = "nodejs";

const phonePattern = /^1[3-9][0-9]{9}$/;

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

  const input = await readAddressInput(request);
  const validationError = validateAddressInput(input);

  if (validationError) {
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

async function readAddressInput(request: Request): Promise<CustomerAddressInput> {
  const body = await request.json().catch(() => ({}));

  return {
    recipientName: readString(body.recipientName),
    phone: readString(body.phone),
    province: readString(body.province),
    city: readString(body.city),
    district: readString(body.district),
    detailAddress: readString(body.detailAddress),
    postalCode: readString(body.postalCode) || null,
    label: readString(body.label) || null,
    isDefault: Boolean(body.isDefault),
  };
}

function validateAddressInput(input: CustomerAddressInput) {
  if (!input.recipientName) {
    return "收件人姓名不能为空";
  }

  if (!phonePattern.test(input.phone)) {
    return "手机号必须为中国大陆 11 位手机号";
  }

  if (!input.province || !input.city || !input.district) {
    return "省、市、区/县不能为空";
  }

  if (!input.detailAddress || input.detailAddress.length < 5) {
    return "详细地址不能为空，且建议不少于 5 个字符";
  }

  if (input.label && input.label.length > 10) {
    return "地址标签最多 10 个字符";
  }

  if (input.postalCode && !/^[0-9]{1,10}$/.test(input.postalCode)) {
    return "邮编只能填写数字，最多 10 位";
  }

  return "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
