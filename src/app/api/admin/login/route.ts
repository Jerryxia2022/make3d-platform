import { NextResponse } from "next/server";
import {
  createAdminLoginRedirectResponse,
  createAdminSessionToken,
  verifyAdminCredentials,
} from "@/backend/adminAuth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = getString(formData, "username");
  const password = getString(formData, "password");

  if (!verifyAdminCredentials(username, password)) {
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
  }

  return createAdminLoginRedirectResponse(createAdminSessionToken());
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
