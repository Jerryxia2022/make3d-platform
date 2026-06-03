export const runtime = "nodejs";

export async function POST() {
  return new Response(null, {
    status: 303,
    headers: { Location: "/account/forgot-password?sent=1" },
  });
}
