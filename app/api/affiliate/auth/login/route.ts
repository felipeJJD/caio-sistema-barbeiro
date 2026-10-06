import { affiliateSessionCookie, loginAffiliate } from "../../../../../db/affiliate-auth";
import { enforceRateLimit, RateLimitError } from "../../../../../db/rate-limit";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    const identifier = String(body.email ?? "").trim();
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await enforceRateLimit({scope:"affiliate-login",identifier:identifier.toLowerCase(),limit:12,windowMs:15*60*1000,message:"Muitas tentativas. Aguarde 15 minutos e tente novamente."});
    await enforceRateLimit({scope:"affiliate-login-ip",identifier:ip,limit:60,windowMs:15*60*1000,message:"Muitas tentativas. Aguarde 15 minutos e tente novamente."});
    const token = await loginAffiliate(identifier, String(body.password ?? ""));
    return Response.json({ ok: true }, { headers: { "set-cookie": affiliateSessionCookie(token), "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível entrar.";
    return Response.json({ error: message }, { status: error instanceof RateLimitError ? 429 : 400, headers: { "cache-control": "no-store" } });
  }
}
