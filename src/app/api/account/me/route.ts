import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import { getCustomerById, openDatabase } from "@/backend/database";

export const runtime = "nodejs";

export function GET(request: Request) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  const db = openDatabase();

  try {
    const customer = getCustomerById(db, session.customerId);

    if (!customer) {
      return Response.json({ authenticated: false }, { status: 401 });
    }

    return Response.json({
      authenticated: true,
      customer: {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        wechat: customer.wechat,
        email: customer.email,
      },
    });
  } finally {
    db.close();
  }
}
