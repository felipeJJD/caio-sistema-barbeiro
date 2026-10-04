import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { affiliateProspectingFetch, affiliateProspectorIdentity } from "../../../../../lib/affiliate-prospecting-bridge";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access?.active) return noStore({ error: "Entre como afiliado para consultar a prospecção." }, 401);
    const { response, payload } = await affiliateProspectingFetch("/api/claims?summary=1", {
      ...affiliateProspectorIdentity(access),
    });
    return noStore(payload, response.status);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível carregar o resumo da prospecção." }, 503);
  }
}
