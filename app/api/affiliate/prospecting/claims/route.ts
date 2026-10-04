import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { affiliateProspectingFetch, affiliateProspectorIdentity } from "../../../../../lib/affiliate-prospecting-bridge";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access?.active) return noStore({ error: "Entre como afiliado para usar a prospecção." }, 401);
    const url = new URL(request.url);
    const requestedView = url.searchParams.get("view");
    const view = requestedView === "responded" || requestedView === "interested" ? requestedView : "contacted";
    const identity = affiliateProspectorIdentity(access);
    const { response, payload } = await affiliateProspectingFetch(`/api/claims?view=${view}&limit=50&offset=${Math.max(0, Math.min(100000, Number(url.searchParams.get("offset")) || 0))}`, {
      ...identity,
    });
    return noStore(payload, response.status);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível carregar a prospecção." }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access?.active) return noStore({ error: "Entre como afiliado para usar a prospecção." }, 401);
    const body = await request.json().catch(() => null) as {
      action?: string;
      leads?: unknown[];
      city?: string;
      key?: string;
      message?: string;
      providerMessageId?: string;
    } | null;
    const action = String(body?.action ?? "");
    if (action !== "reserve" && action !== "contacted" && action !== "do_not_contact" && action !== "interested") return noStore({ error: "Ação inválida." }, 400);
    const identity = affiliateProspectorIdentity(access);
    const { response, payload } = await affiliateProspectingFetch("/api/claims", {
      method: "POST",
      body: action === "reserve"
        ? { action, leads: Array.isArray(body?.leads) ? body.leads : [], city: String(body?.city ?? "").slice(0, 180) }
        : {
            action,
            key: String(body?.key ?? "").slice(0, 220),
            message: String(body?.message ?? "").slice(0, 1200),
            providerMessageId: "",
          },
      ...identity,
    });
    return noStore(payload, response.status);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível atualizar a prospecção." }, 503);
  }
}
