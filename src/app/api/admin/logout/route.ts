import { createAdminLogoutRedirectResponse } from "@/backend/adminAuth";

export async function POST() {
  return createAdminLogoutRedirectResponse();
}
