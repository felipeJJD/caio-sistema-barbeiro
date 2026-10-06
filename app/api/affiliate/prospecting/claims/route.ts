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
    const view = requestedView === "responded" || requestedView === "interested" || requestedView === "returns" ? requestedView : "contacted";
    const identity = affiliateProspectorIdentity(access);
    const params = new URLSearchParams({ view, limit: "50", offset: String(Math.max(0, Math.min(100000, Number(url.searchParams.get("offset")) || 0))) });
    if (url.searchParams.get("crm") === "1") params.set("crm", "1");
    if (url.searchParams.get("detail")) params.set("detail", String(url.searchParams.get("detail")).slice(0,220));
    params.set("query", String(url.searchParams.get("query") || "").slice(0,120));
    const { response, payload } = await affiliateProspectingFetch(`/api/claims?${params}`, {
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
      providerMessageId?: string; contactName?: string; notes?: string; nextStep?: string; stage?: string; followupAt?: string | null; completeReturn?: boolean;
    } | null;
    const action = String(body?.action ?? "");
    if (action !== "reserve" && action !== "contacted" && action !== "do_not_contact" && action !== "interested" && action !== "save_contact") return noStore({ error: "Ação inválida." }, 400);
    const identity = affiliateProspectorIdentity(access);
    const { response, payload } = await affiliateProspectingFetch("/api/claims", {
      method: "POST",
      body: action === "reserve"
        ? { action, leads: Array.isArray(body?.leads) ? body.leads : [], city: String(body?.city ?? "").slice(0, 180) }
        : action === "save_contact" ? { action, key: String(body?.key || "").slice(0,220),
            contactName: String(body?.contactName || "").slice(0,120), notes: String(body?.notes || "").slice(0,5000),
            nextStep: String(body?.nextStep || "").slice(0,500), stage: String(body?.stage || ""),
            followupAt: body?.followupAt ? String(body.followupAt).slice(0,40) : null, completeReturn: Boolean(body?.completeReturn) }
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
