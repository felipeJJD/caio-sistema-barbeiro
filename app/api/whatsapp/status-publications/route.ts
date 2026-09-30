import { isOrganizationAccessExpired } from "../../../../db/access";
import { getSessionAccess } from "../../../../db/auth";
import {
  cancelWhatsappStatusPublication,
  createWhatsappStatusPublication,
  getWhatsappStatusPublicationState,
  processWhatsappStatusQueue,
} from "../../../../db/whatsapp-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode programar Status do WhatsApp." }, { status: 403 });
    return Response.json({ statusPublications: await getWhatsappStatusPublicationState(access) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar as publicações." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode programar Status do WhatsApp." }, { status: 403 });
    if (!access.isPlatformAdmin && isOrganizationAccessExpired(access)) return Response.json({ error: "O período de acesso terminou. Renove a assinatura antes de publicar Status." }, { status: 402 });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 8_000) return Response.json({ error: "Solicitação muito grande." }, { status: 413 });

    const data = await request.json() as Record<string, unknown>;
    const action = String(data.action ?? "");
    const audiencePhone = String(data.audiencePhone ?? "");
    let publicationId: number | undefined;

    if (action === "publish-now") {
      publicationId = await createWhatsappStatusPublication(access, { text: String(data.text ?? ""), audiencePhone, publishNow: true });
      await processWhatsappStatusQueue({ organizationId: access.organizationId, messageId: publicationId, limit: 1 });
    } else if (action === "schedule") {
      publicationId = await createWhatsappStatusPublication(access, { text: String(data.text ?? ""), audiencePhone, scheduledAt: String(data.scheduledAt ?? "") });
    } else if (action === "cancel") {
      await cancelWhatsappStatusPublication(access, Number(data.id));
    } else {
      return Response.json({ error: "Ação de publicação inválida." }, { status: 400 });
    }

    return Response.json({ ok: true, publicationId, statusPublications: await getWhatsappStatusPublicationState(access) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a publicação." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
