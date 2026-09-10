import { acceptTeamInvite, sessionCookie } from "../../../../db/auth";

export async function POST(request: Request) {
  try {
    const data = await request.json() as { inviteToken?: string; name?: string; email?: string; password?: string };
    const token = await acceptTeamInvite(String(data.inviteToken ?? ""), {
      name: String(data.name ?? ""),
      email: String(data.email ?? ""),
      password: String(data.password ?? ""),
    });
    return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeMessages = [
      "Este convite não existe.",
      "Este convite não está mais disponível.",
      "Informe seu nome.",
      "Informe um e-mail válido.",
      "Crie uma senha com pelo menos 6 caracteres.",
      "A senha informada é muito longa.",
      "Este e-mail já possui acesso ao Cortou Anotou.",
      "Este e-mail já está cadastrado na equipe.",
    ];
    const safe = safeMessages.includes(message) || message.startsWith("Este convite está ");
    return Response.json({ error: safe ? message : "Não foi possível concluir o cadastro agora." }, { status: safe ? 400 : 500 });
  }
}
