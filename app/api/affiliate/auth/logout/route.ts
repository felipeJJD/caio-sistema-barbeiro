import { clearedAffiliateSessionCookie, logoutCurrentAffiliateSession } from "../../../../../db/affiliate-auth";

export async function GET(request: Request) {
  await logoutCurrentAffiliateSession();
  return new Response(null, {
    status: 303,
    headers: { location: new URL("/afiliado", request.url).toString(), "set-cookie": clearedAffiliateSessionCookie(), "cache-control": "no-store" },
  });
}

export async function POST() {
  await logoutCurrentAffiliateSession();
  return Response.json({ ok: true }, { headers: { "set-cookie": clearedAffiliateSessionCookie(), "cache-control": "no-store" } });
}
