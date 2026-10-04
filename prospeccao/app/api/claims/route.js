import { markDoNotContact } from "../../../lib/prospecting-queue.js";
import { listClaims, markClaimContacted, recordClaimInbound, reserveClaimLeads } from "../../../lib/affiliate-claims.js";
import { getClaimSummary } from "../../../lib/affiliate-summary.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function identity(request) {
  return {
    prospectorKey: request.headers.get("x-ca-prospector-key") || "",
    prospectorName: request.headers.get("x-ca-prospector-name") || "",
  };
}

function jsonError(error) {
  const status = Number(error?.status) || 500;
  const message = error instanceof Error ? error.message : "Não foi possível atualizar a prospecção.";
  console.error("[C.A. Prospecção] reservas", { status, message });
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

async function bodyOf(request) {
  try {
    return await request.json();
  } catch {
    const error = new Error("Dados inválidos.");
    error.status = 400;
    throw error;
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const actor = identity(request);
    if (url.searchParams.get("summary") === "1") {
      return Response.json(await getClaimSummary(actor.prospectorKey), { headers: { "cache-control": "no-store" } });
    }
    const result = await listClaims({
      ...actor,
      view: url.searchParams.get("view") || "contacted",
      limit: url.searchParams.get("limit") || "50",
      offset: url.searchParams.get("offset") || "0",
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const body = await bodyOf(request);
    const action = String(body?.action || "reserve");
    const actor = identity(request);
    if (action === "reserve") {
      const result = await reserveClaimLeads(body?.leads, { ...actor, city: body?.city || "" });
      return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
    }
    if (action === "do_not_contact") return Response.json(await markDoNotContact(actor.prospectorKey,body.key),{headers:{"cache-control":"no-store"}});
    if (action === "contacted") {
      const item = await markClaimContacted(body?.key, {
        ...actor,
        message: body?.message || "",
        providerMessageId: body?.providerMessageId || "",
      });
      return Response.json({ item }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "inbound") {
      const result = await recordClaimInbound({
        instance: body?.instance || "",
        phoneE164: body?.phoneE164 || "",
        message: body?.message || "Mensagem recebida",
        providerMessageId: body?.providerMessageId || "",
      });
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: "Ação inválida." }, { status: 400, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
