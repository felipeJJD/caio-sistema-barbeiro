import { loginWithPassword, sessionCookie } from "../../../../db/auth";
import { ensureDemoData } from "../../../../db/dashboard";
import { enforceRateLimit, RateLimitError } from "../../../../db/rate-limit";

export async function POST(request: Request) {
  try {
    await ensureDemoData();
    const data = await request.json() as { email?: string; password?: string };
    const forwardedIp = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "";
    await enforceRateLimit({
      scope: "login",
      identifier: forwardedIp ? `${forwardedIp}:${String(data.email ?? "").trim().toLowerCase()}` : undefined,
      limit: 12,
      windowMs: 15 * 60 * 1000,
      message: "Muitas tentativas de entrada. Aguarde 15 minutos e tente novamente.",
    });
    const { token } = await loginWithPassword(String(data.email ?? ""), String(data.password ?? ""));
    return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const publicMessage = [
      "Informe seu e-mail e sua senha.",
      "E-mail ou senha incorretos.",
      "Este acesso está desativado. Fale com o administrador.",
      "Confirme seu e-mail antes de entrar. Abra o link enviado para você.",
      "Muitas tentativas de entrada. Aguarde 15 minutos e tente novamente.",
    ].includes(message) ? message : "Não foi possível entrar agora. Tente novamente.";
    const status = error instanceof RateLimitError ? 429 : publicMessage === message ? 401 : 500;
    return Response.json({ error: publicMessage }, { status });
  }
}
