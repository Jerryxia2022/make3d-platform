import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, getCustomerSessionFromToken } from "./accountAuth";
import { getCustomerById, openDatabase } from "./database";

export async function getCurrentCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = getCustomerSessionFromToken(token);

  if (!session) {
    return null;
  }

  const db = openDatabase();

  try {
    return getCustomerById(db, session.customerId);
  } finally {
    db.close();
  }
}
