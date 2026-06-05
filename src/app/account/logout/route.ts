import { createCustomerLogoutResponse } from "@/backend/accountAuth";

export function GET() {
  return createCustomerLogoutResponse(303, "/");
}
