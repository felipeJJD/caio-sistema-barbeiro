import { resendOwnerVerificationEmail } from "../../../../db/auth";
import { enforceRateLimit, RateLimitError } from "../../../../db/rate-limit";

export async function POST(request: Request) {
  try {
    const data = await request.json() as { email?: string };
    const email = String(data.email ?? "").trim().toLowerCase();
    const forwardedIp = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "";
    await enforceRateLimit({
      scope: "email-verification-resend-ip",
      identifier: forwardedIp || undefined,
      limit: 8,
      windowMs: 60 * 60 * 1000,
      message: "Muitas solicitações. Aguarde uma hora e tente novamente.",
    });
    await enforceRateLimit({
      scope: "email-verification-resend-account",
      identifier: email || undefined,
      limit: 3,
      windowMs: 60 * 60 * 1000,
      message: "Muitas solicitações para este e-mail. Aguarde uma hora e tente novamente.",
    });
    await resendOwnerVerificationEmail(email);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error instanceof RateLimitError) return Response.json({ error: message }, { status: 429 });
    if (message.includes("não está configurado") || message.startsWith("Não foi possível enviar")) {
      return Response.json({ error: "O envio de e-mail está temporariamente indisponível. Fale com o suporte." }, { status: 503 });
    }
    return Response.json({ error: "Não foi possível reenviar agora. Tente novamente." }, { status: 500 });
  }
}
