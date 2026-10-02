import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { affiliateProspectingFetch } from "../../../../../lib/affiliate-prospecting-bridge";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access?.active) return noStore({ error: "Entre como afiliado para usar a prospecção." }, 401);
    const url = new URL(request.url);
    const city = String(url.searchParams.get("city") ?? "").trim().slice(0, 90);
    const rawOffset = Number.parseInt(String(url.searchParams.get("offset") ?? "0"), 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.min(rawOffset, 100000)) : 0;
    if (city.length < 2) return noStore({ error: "Escolha uma cidade para pesquisar." }, 400);
    const { response, payload } = await affiliateProspectingFetch(`/api/leads/search?city=${encodeURIComponent(city)}&offset=${offset}`);
    return noStore(payload, response.status);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível pesquisar agora." }, 503);
  }
}
