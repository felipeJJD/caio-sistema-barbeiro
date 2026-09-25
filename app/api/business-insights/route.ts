import { isOrganizationAccessExpired } from "../../../db/access";
import { getSessionAccess } from "../../../db/auth";
import { getBusinessInsights } from "../../../db/business-insights";

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "O período da barbearia terminou." }, { status: 402 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode acessar esta análise." }, { status: 403 });
    return Response.json({ data: await getBusinessInsights(access) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a análise agora." }, { status: 400 });
  }
}
