import { acceptBarbershopInvite, sessionCookie } from "../../../../db/auth";

export async function POST(request: Request) {
  try {
    const data = await request.json() as {
      inviteToken?: string;
      ownerName?: string;
      organizationName?: string;
      ownerDocument?: string;
      email?: string;
      password?: string;
    };
    const created = await acceptBarbershopInvite(String(data.inviteToken ?? ""), {
      ownerName: String(data.ownerName ?? ""),
      organizationName: String(data.organizationName ?? ""),
      ownerDocument: String(data.ownerDocument ?? ""),
      email: String(data.email ?? ""),
      password: String(data.password ?? ""),
    });
    if (created.verificationRequired) return Response.json({ ok: true, verificationRequired: true, email: created.email });
    if (!created.token) throw new Error("Não foi possível criar a sessão.");
    return Response.json({ ok: true, verificationRequired: false }, { headers: { "set-cookie": sessionCookie(created.token) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeMessages = [
      "Este convite não existe.",
      "Este convite não está mais disponível.",
      "Informe seu nome.",
      "Informe o nome da barbearia.",
      "Insira um CPF ou CNPJ válido.",
      "Informe um e-mail válido.",
      "Crie uma senha com pelo menos 6 caracteres.",
      "A senha informada é muito longa.",
      "Este e-mail já possui acesso ao Cortou Anotou.",
      "Este e-mail já está cadastrado em uma barbearia.",
      "Este CPF ou CNPJ já foi usado para criar uma barbearia.",
      "Não foi possível enviar o e-mail de confirmação agora.",
    ];
    const status = message.startsWith("Não foi possível enviar") ? 503 : safeMessages.includes(message) ? 400 : 500;
    return Response.json({ error: safeMessages.includes(message) ? message : "Não foi possível criar sua barbearia agora." }, { status });
  }
}
