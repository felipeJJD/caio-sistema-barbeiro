import { getSessionAccess } from "../../../../db/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isPlatformAdmin) return Response.json({ error: "Acesso restrito." }, { status: 403 });
    return Response.json({ error: "Pacotes de mensagens foram encerrados. WhatsApp está incluído na assinatura." }, { status: 410 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o pacote de WhatsApp." }, { status: 400 });
  }
}
