import { getAccessContext } from "../../../../db/access";
import { setupOwnerPassword, sessionCookie } from "../../../../db/auth";
import { ensureDemoData } from "../../../../db/dashboard";
import { getChatGPTUser } from "../../../chatgpt-auth";

export async function POST(request: Request) {
  try {
    const chatGPTUser = await getChatGPTUser();
    if (!chatGPTUser) return Response.json({ error: "Confirme primeiro a conta do proprietário." }, { status: 401 });
    await ensureDemoData();
    const access = await getAccessContext(chatGPTUser.email);
    if (!access?.isOwner) return Response.json({ error: "Somente o proprietário pode fazer esta ativação." }, { status: 403 });
    const data = await request.json() as { password?: string };
    const token = await setupOwnerPassword(access, String(data.password ?? ""));
    return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const allowed = [
      "Crie uma senha com pelo menos 6 caracteres.",
      "A senha informada é muito longa.",
      "Sua conta já foi ativada. Entre usando seu e-mail e sua senha.",
    ];
    return Response.json({ error: allowed.includes(message) ? message : "Não foi possível ativar seu acesso agora." }, { status: allowed.includes(message) ? 400 : 500 });
  }
}
