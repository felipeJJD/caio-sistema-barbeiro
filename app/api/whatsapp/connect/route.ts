import { getSessionAccess } from "../../../../db/auth";
import { isOrganizationAccessExpired } from "../../../../db/access";
import { getWhatsappAutomationStatus } from "../../../../db/whatsapp";
import {
  getEvolutionClientConfig,
  refreshEvolutionConnection,
  startEvolutionConnection,
} from "../../../../db/whatsapp-evolution";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode conectar o WhatsApp." }, { status: 403 });
    const origin = new URL(request.url).origin;
    const current = await getWhatsappAutomationStatus(access);
    const whatsapp = current.connection.provider === "evolution"
      ? await refreshEvolutionConnection(access, origin)
      : current;
    return Response.json(
      { config: getEvolutionClientConfig(), whatsapp },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível preparar a conexão com a Evolution." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode conectar o WhatsApp." }, { status: 403 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "O período da barbearia terminou. Renove o plano antes de conectar o WhatsApp." }, { status: 402 });
    if (Number(request.headers.get("content-length") ?? 0) > 4_000) return Response.json({ error: "Solicitação muito grande." }, { status: 413 });

    const result = await startEvolutionConnection(access, new URL(request.url).origin);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível iniciar a conexão com a Evolution." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
