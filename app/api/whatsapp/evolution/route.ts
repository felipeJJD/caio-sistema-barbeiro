import { publicErrorMessage } from "../../../../lib/api-error";
import { getSessionAccess } from "../../../../db/auth";
import { isOrganizationAccessExpired } from "../../../../db/access";
import {
  getEvolutionClientConfig,
  refreshEvolutionStatus,
} from "../../../../db/evolution-whatsapp";
import { beginEvolutionPairingSafe } from "../../../../db/evolution-pairing";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error:"Sua sessão terminou. Entre novamente." }, { status:401 });
    if (!access.isOwner) return Response.json({ error:"Somente o proprietário pode conectar o WhatsApp." }, { status:403 });
    const status = await refreshEvolutionStatus(access);
    return Response.json({ evolution:getEvolutionClientConfig(), ...status }, { headers:{ "Cache-Control":"no-store" } });
  } catch (error) {
    return Response.json({ error: publicErrorMessage(error, "Não foi possível consultar o WhatsApp.") }, { status:400, headers:{ "Cache-Control":"no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error:"Sua sessão terminou. Entre novamente." }, { status:401 });
    if (!access.isOwner) return Response.json({ error:"Somente o proprietário pode conectar o WhatsApp." }, { status:403 });
    if (!access.isPlatformAdmin && isOrganizationAccessExpired(access)) return Response.json({ error:"O período de acesso terminou. Renove a assinatura antes de conectar o WhatsApp." }, { status:402 });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 4_000) return Response.json({ error:"Solicitação muito grande." }, { status:413 });
    const data = await request.json() as Record<string, unknown>;
    const phone = String(data.phone ?? "").slice(0,40);
    const result = await beginEvolutionPairingSafe(access, phone);
    return Response.json({ ok:true, ...result }, { headers:{ "Cache-Control":"no-store" } });
  } catch (error) {
    return Response.json({ error: publicErrorMessage(error, "Não foi possível gerar o código do WhatsApp.") }, { status:400, headers:{ "Cache-Control":"no-store" } });
  }
}
