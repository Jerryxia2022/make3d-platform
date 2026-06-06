import { createCustomerLogoutResponse } from "@/backend/accountAuth";

export const runtime = "nodejs";

export function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  return createCustomerLogoutResponse(303, getSafeLogoutRedirect(searchParams.get("next")));
}

function getSafeLogoutRedirect(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}
