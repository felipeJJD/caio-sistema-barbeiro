import { loginWithPassword, sessionCookie } from "../../../../db/auth";
import { ensureDemoData } from "../../../../db/dashboard";
import { enforceRateLimit, RateLimitError } from "../../../../db/rate-limit";
import { hasPendingRegistrationEmail } from "../../../../db/verified-registration";

export async function POST(request: Request) {
  try {
    await ensureDemoData();
    const data = await request.json() as { email?: string; password?: string };
    const email = String(data.email ?? "").trim().toLowerCase();
    const forwardedIp = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "";
    await enforceRateLimit({
      scope: "login",
      identifier: forwardedIp ? `${forwardedIp}:${email}` : undefined,
      limit: 12,
      windowMs: 15 * 60 * 1000,
      message: "Muitas tentativas de entrada. Aguarde 15 minutos e tente novamente.",
    });
    if (await hasPendingRegistrationEmail(email, "team")) {
      throw new Error("Confirme seu e-mail antes de entrar. Abra o link enviado para você.");
    }
    const { token } = await loginWithPassword(email, String(data.password ?? ""));
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
