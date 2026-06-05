import { createCustomerLogoutResponse } from "@/backend/accountAuth";

export const runtime = "nodejs";

export function POST() {
  return createCustomerLogoutResponse();
}
