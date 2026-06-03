import { CUSTOMER_SESSION_COOKIE } from "@/backend/accountAuth";

export function GET() {
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": `${CUSTOMER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=lax`,
    },
  });
}
