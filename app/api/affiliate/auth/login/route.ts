import { affiliateSessionCookie, loginAffiliate } from "../../../../../db/affiliate-auth";
import { hasPendingRegistrationEmail } from "../../../../../db/verified-registration";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    if (await hasPendingRegistrationEmail(email, "affiliate")) {
      throw new Error("Confirme seu e-mail antes de entrar. Abra o link enviado para você.");
    }
    const token = await loginAffiliate(email, String(body.password ?? ""));
    return Response.json({ ok: true }, { headers: { "set-cookie": affiliateSessionCookie(token), "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível entrar.";
    return Response.json({ error: message }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
