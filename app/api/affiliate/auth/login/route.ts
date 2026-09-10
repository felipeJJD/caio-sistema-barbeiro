import { affiliateSessionCookie, loginAffiliate } from "../../../../../db/affiliate-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    const token = await loginAffiliate(String(body.email ?? ""), String(body.password ?? ""));
    return Response.json({ ok: true }, { headers: { "set-cookie": affiliateSessionCookie(token), "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível entrar.";
    return Response.json({ error: message }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
