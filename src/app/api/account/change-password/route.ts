import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import {
  hashPassword,
  openDatabase,
  verifyPassword,
} from "@/backend/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const formData = await request.formData();
  const currentPassword = getString(formData, "currentPassword");
  const newPassword = getString(formData, "newPassword");
  const confirmNewPassword = getString(formData, "confirmNewPassword");
  const db = openDatabase();

  try {
    const currentCustomer = db
      .prepare("SELECT phone, password_hash AS passwordHash FROM customers WHERE id = ? LIMIT 1")
      .get(session.customerId) as { phone: string; passwordHash: string } | undefined;

    if (!currentCustomer || !verifyPassword(currentPassword, currentCustomer.passwordHash)) {
      return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "新密码至少8位" }, { status: 400 });
    }

    if (newPassword !== confirmNewPassword) {
      return NextResponse.json({ error: "两次输入的新密码不一致" }, { status: 400 });
    }

    db.prepare("UPDATE customers SET password_hash = ? WHERE id = ?").run(
      hashPassword(newPassword),
      session.customerId,
    );

    return NextResponse.json({ success: true });
  } finally {
    db.close();
  }
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
