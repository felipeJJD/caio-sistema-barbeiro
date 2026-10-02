import { markClaimContacted, reserveClaimLeads } from "../../../lib/affiliate-claims.js";

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

export async function POST(request) {
  try {
    const body = await bodyOf(request);
    const action = String(body?.action || "reserve");
    const actor = identity(request);
    if (action === "reserve") {
      const result = await reserveClaimLeads(body?.leads, { ...actor, city: body?.city || "" });
      return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
    }
    if (action === "contacted") {
      const item = await markClaimContacted(body?.key, actor);
      return Response.json({ item }, { headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: "Ação inválida." }, { status: 400, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
