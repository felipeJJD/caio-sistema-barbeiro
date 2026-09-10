import { createPublicBarbershop, sessionCookie } from "../../../../db/auth";

type SignupBody = {
  ownerName?: string;
  organizationName?: string;
  whatsapp?: string;
  ownerDocument?: string;
  email?: string;
  password?: string;
  signupSource?: string;
  referralCode?: string;
  termsAccepted?: boolean;
  companyWebsite?: string;
};

export async function POST(request: Request) {
  try {
    const data = await request.json() as SignupBody;

    // Campo invisível para pessoas; bots costumam preenchê-lo.
    if (String(data.companyWebsite ?? "").trim()) return Response.json({ ok: true });

    const forwardedIp = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? undefined;
    const created = await createPublicBarbershop({
      ownerName: String(data.ownerName ?? ""),
      organizationName: String(data.organizationName ?? ""),
      whatsapp: String(data.whatsapp ?? ""),
      ownerDocument: String(data.ownerDocument ?? ""),
      email: String(data.email ?? ""),
      password: String(data.password ?? ""),
      signupSource: String(data.signupSource ?? ""),
      referralCode: String(data.referralCode ?? ""),
      termsAccepted: data.termsAccepted === true,
      requestIp: forwardedIp,
    });
    if (created.verificationRequired) return Response.json({ ok: true, verificationRequired: true, email: created.email });
    if (!created.token) throw new Error("Não foi possível criar a sessão.");
    return Response.json({ ok: true, verificationRequired: false }, { headers: { "set-cookie": sessionCookie(created.token) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeMessages = [
      "Informe seu nome.",
      "Informe o nome da barbearia.",
      "Informe um WhatsApp válido com DDD.",
      "Insira um CPF ou CNPJ válido.",
      "Informe um e-mail válido.",
      "Crie uma senha com pelo menos 6 caracteres.",
      "A senha informada é muito longa.",
      "Confirme que você leu e concorda com os termos do teste.",
      "Este e-mail já possui acesso ao Cortou Anotou.",
      "Este e-mail já está cadastrado em uma barbearia.",
      "Este CPF ou CNPJ já foi usado para criar uma barbearia.",
      "Não foi possível enviar o e-mail agora.",
      "Muitas tentativas com este e-mail. Aguarde 15 minutos e tente novamente.",
    ];
    const publicMessage = safeMessages.includes(message) ? message : "Não foi possível criar sua barbearia agora.";
    const status = message.startsWith("Muitas tentativas") ? 429 : message.startsWith("Não foi possível enviar") ? 503 : safeMessages.includes(message) ? 400 : 500;
    return Response.json({ error: publicMessage }, { status });
  }
}
