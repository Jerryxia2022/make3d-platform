import { createCustomerSessionToken, createCustomerLoginRedirectResponse } from "@/backend/accountAuth";
import {
  createCustomerAccount,
  openDatabase,
  recordRequiredUserLegalAcceptances,
} from "@/backend/database";
import { getClientIp } from "@/backend/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const db = openDatabase();

  try {
    const password = getString(formData, "password");
    const confirmPassword = getString(formData, "confirmPassword");

    if (password !== confirmPassword) {
      return Response.json(
        { success: false, error: "两次输入的密码不一致", message: "两次输入的密码不一致" },
        { status: 400 },
      );
    }

    if (!isChecked(formData, "acceptTerms") || !isChecked(formData, "acceptPrivacy")) {
      return Response.json(
        {
          success: false,
          error: "请先阅读并同意用户服务协议和隐私政策",
          message: "请先阅读并同意用户服务协议和隐私政策",
        },
        { status: 400 },
      );
    }

    const customer = createCustomerAccount(db, {
      phone: getString(formData, "phone"),
      password,
      name: getString(formData, "name"),
      wechat: getString(formData, "wechat") || "",
      email: getString(formData, "email"),
      defaultAddress: getString(formData, "defaultAddress"),
    });
    recordRequiredUserLegalAcceptances(db, customer.id, {
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
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

function isChecked(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}
