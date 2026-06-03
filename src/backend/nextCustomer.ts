import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE } from "./accountAuth";
import { getCustomerBySessionToken, openDatabase } from "./database";

export async function getCurrentCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  const db = openDatabase();

  try {
    return getCustomerBySessionToken(db, token);
  } finally {
    db.close();
  }
}
