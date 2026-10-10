import { publicErrorMessage } from "../../../../../lib/api-error";
import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { affiliateProspectingFetch } from "../../../../../lib/affiliate-prospecting-bridge";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access?.active) return noStore({ error: "Entre como afiliado para usar a prospecção." }, 401);
    const uf = new URL(request.url).searchParams.get("uf")?.trim().toUpperCase() ?? "";
    if (!/^[A-Z]{2}$/.test(uf)) return noStore({ error: "Estado inválido." }, 400);
    const { response, payload } = await affiliateProspectingFetch(`/api/locations/cities?uf=${encodeURIComponent(uf)}`);
    return noStore(payload, response.status);
  } catch (error) {
    return noStore({ error: publicErrorMessage(error, "Não foi possível carregar as cidades.") }, 503);
  }
}
