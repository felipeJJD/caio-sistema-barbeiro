import { startTeamInviteVerification } from "../../../../db/verified-registration";

export async function POST(request: Request) {
  try {
    const data = await request.json() as { inviteToken?: string; name?: string; email?: string; password?: string };
    const created = await startTeamInviteVerification(String(data.inviteToken ?? ""), {
      name: String(data.name ?? ""),
      email: String(data.email ?? ""),
      password: String(data.password ?? ""),
    });
    return Response.json({ ok: true, verificationRequired: true, email: created.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeMessages = [
      "Este convite não existe.",
      "Este convite não está mais disponível. Peça um novo link ao administrador.",
      "Informe seu nome.",
      "Informe um e-mail válido.",
      "Crie uma senha com pelo menos 6 caracteres.",
      "A senha informada é muito longa.",
      "Este e-mail já possui acesso ao Cortou Anotou.",
      "Este e-mail já está cadastrado na equipe.",
      "Este profissional já possui login no Cortou Anotou.",
      "O profissional deste convite não foi encontrado.",
      "O envio de confirmação por e-mail ainda não está configurado.",
      "Não foi possível enviar o e-mail agora.",
    ];
    const safe = safeMessages.includes(message);
    return Response.json({ error: safe ? message : "Não foi possível concluir o cadastro agora." }, { status: safe ? 400 : 500 });
  }
}
