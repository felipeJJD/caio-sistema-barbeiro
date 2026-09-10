import { acceptAffiliateInvite, affiliateSessionCookie } from "../../../../../db/affiliate-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { inviteToken?: string; name?: string; email?: string; password?: string };
    const token = await acceptAffiliateInvite(String(body.inviteToken ?? ""), {
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
    });
    return Response.json({ ok: true }, { headers: { "set-cookie": affiliateSessionCookie(token), "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir o cadastro.";
    return Response.json({ error: message }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
