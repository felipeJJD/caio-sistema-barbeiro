import { getSessionAccess } from "../../../../db/auth";
import { saveWhatsappPlanForOrganization } from "../../../../db/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isPlatformAdmin) return Response.json({ error: "Apenas o administrador da plataforma pode alterar pacotes de WhatsApp." }, { status: 403 });
    const data = await request.json() as Record<string, unknown>;
    if (String(data.action ?? "") !== "set-plan") return Response.json({ error: "Ação inválida." }, { status: 400 });
    await saveWhatsappPlanForOrganization(access, {
      organizationId: Number(data.organizationId ?? 0),
      planCode: String(data.planCode ?? "off"),
      monthlyMessageLimit: Number(data.monthlyMessageLimit ?? 0),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o pacote de WhatsApp." }, { status: 400 });
  }
}
