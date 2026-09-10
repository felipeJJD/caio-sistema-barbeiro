import { resetPasswordWithToken } from "../../../../../db/auth";

export async function POST(request: Request) {
  try {
    const data = await request.json() as { token?: string; password?: string };
    await resetPasswordWithToken(String(data.token ?? ""), String(data.password ?? ""));
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeMessages = [
      "Este link de recuperação não é válido.",
      "Este link de recuperação expirou ou já foi utilizado.",
      "Este acesso não está disponível para recuperação.",
      "Crie uma senha com pelo menos 6 caracteres.",
      "A senha informada é muito longa.",
    ];
    return Response.json({ error: safeMessages.includes(message) ? message : "Não foi possível alterar sua senha agora." }, { status: 400 });
  }
}
