import { createCustomerLoginRedirectResponse, createCustomerSessionToken } from "@/backend/accountAuth";
import { findCustomerByLogin, openDatabase, verifyPassword } from "@/backend/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const phone = getString(formData, "phone");
  const password = getString(formData, "password");
  const db = openDatabase();

  try {
    const customer = findCustomerByLogin(db, phone);

    if (!customer || !verifyPassword(password, customer.passwordHash)) {
      return Response.json({ error: "手机号或密码错误" }, { status: 401 });
    }

    return createCustomerLoginRedirectResponse(createCustomerSessionToken(customer.id));
  } finally {
    db.close();
  }
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
