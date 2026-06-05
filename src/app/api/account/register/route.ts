import { createCustomerSessionToken, createCustomerLoginRedirectResponse } from "@/backend/accountAuth";
import { createCustomerAccount, openDatabase } from "@/backend/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const db = openDatabase();

  try {
    const customer = createCustomerAccount(db, {
      phone: getString(formData, "phone"),
      password: getString(formData, "password"),
      name: getString(formData, "name"),
      wechat: getString(formData, "wechat"),
      email: getString(formData, "email"),
      defaultAddress: getString(formData, "defaultAddress"),
    });
    return createCustomerLoginRedirectResponse(createCustomerSessionToken(customer.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "注册失败";
    return Response.json({ success: false, error: message, message }, { status: 400 });
  } finally {
    db.close();
  }
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
