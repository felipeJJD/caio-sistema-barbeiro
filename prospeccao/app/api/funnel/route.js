import {
  addFunnelContacts,
  archiveFunnelContact,
  databaseHealth,
  listFunnel,
  updateFunnelStatus,
} from "../../../lib/prospecting-db.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error) {
  const status = Number(error?.status) || 500;
  const message = error instanceof Error ? error.message : "Não foi possível atualizar o funil.";
  console.error("[C.A. Prospecção] funil", { status, message });
  return Response.json({ error: message }, { status });
}

async function readBody(request) {
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
    if (url.searchParams.get("health") === "1") {
      return Response.json(await databaseHealth());
    }
    return Response.json({ funnel: await listFunnel() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    const leads = Array.isArray(body?.leads) ? body.leads : [];
    if (!leads.length) return Response.json({ error: "Selecione pelo menos um contato." }, { status: 400 });
    if (leads.length > 100) return Response.json({ error: "Envie no máximo 100 contatos por vez." }, { status: 400 });
    const result = await addFunnelContacts(leads, body?.city || "");
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request) {
  try {
    const body = await readBody(request);
    if (!body?.key || !body?.status) return Response.json({ error: "Contato e status são obrigatórios." }, { status: 400 });
    return Response.json({ item: await updateFunnelStatus(body.key, body.status) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request) {
  try {
    const body = await readBody(request);
    if (!body?.key) return Response.json({ error: "Contato é obrigatório." }, { status: 400 });
    return Response.json(await archiveFunnelContact(body.key));
  } catch (error) {
    return jsonError(error);
  }
}
