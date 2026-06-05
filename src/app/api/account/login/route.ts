import { createCustomerLoginRedirectResponse, createCustomerSessionToken } from "@/backend/accountAuth";
import {
  clearSuccessfulCustomerLoginFailures,
  getClientIp,
  getCustomerLoginBlock,
  recordCustomerLoginFailure,
} from "@/backend/customerLoginThrottle";
import { findCustomerByLogin, openDatabase, verifyPassword } from "@/backend/database";
import { isValidMainlandPhone, mainlandPhoneErrorMessage } from "@/shared/phoneValidation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const phone = getString(formData, "phone");
  const password = getString(formData, "password");
  const ip = getClientIp(request);
  const db = openDatabase();

  try {
    if (!isValidMainlandPhone(phone)) {
      return Response.json(
        {
          success: false,
          error: mainlandPhoneErrorMessage,
          message: mainlandPhoneErrorMessage,
        },
        { status: 400 },
      );
    }

    const phoneBlock = getCustomerLoginBlock(db, "phone", phone);
    const ipBlock = getCustomerLoginBlock(db, "ip", ip);
    const block = phoneBlock || ipBlock;

    if (block) {
      return Response.json(formatLoginError(block), { status: block.status });
    }

    const customer = findCustomerByLogin(db, phone);

    if (!customer || !verifyPassword(password, customer.passwordHash)) {
      const phoneFailure = recordCustomerLoginFailure(db, "phone", phone);
      const ipFailure = recordCustomerLoginFailure(db, "ip", ip);
      const failure = [phoneFailure, ipFailure].find((item) => !item.allowed) || phoneFailure;

      return Response.json(formatLoginError(failure), { status: failure.status });
    }

    clearSuccessfulCustomerLoginFailures(db, phone);

    if (wantsJson(request)) {
      const response = Response.json({ success: true, redirect: "/quote" });
      response.headers.append(
        "Set-Cookie",
        createCustomerLoginRedirectResponse(createCustomerSessionToken(customer.id)).headers.get("Set-Cookie") || "",
      );
      return response;
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

function formatLoginError(block: {
  message: string;
  status: number;
  blockedUntil?: number | null;
  permanentlyBlocked?: boolean;
}) {
  return {
    success: false,
    error: block.message,
    message: block.message,
    blockedUntil: block.blockedUntil ?? null,
    permanentlyBlocked: Boolean(block.permanentlyBlocked),
  };
}

function wantsJson(request: Request) {
  return request.headers.get("accept")?.includes("application/json");
}
