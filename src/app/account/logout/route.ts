import { createCustomerLogoutResponse } from "@/backend/accountAuth";

export function GET(request: Request) {
  if (isRouterPrefetch(request)) {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  return createCustomerLogoutResponse(303, getSafeLogoutRedirect(searchParams.get("next")));
}

function isRouterPrefetch(request: Request) {
  return (
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose") === "prefetch"
  );
}

function getSafeLogoutRedirect(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}
