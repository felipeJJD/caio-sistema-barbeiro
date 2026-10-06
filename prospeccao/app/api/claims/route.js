import {discoverInstagramContacts} from '../../../lib/instagram-discovery.js';
import {listInstagramContacts,updateInstagramContact,enqueueInstagramContacts} from "../../../lib/instagram-contacts.js";
import { getContact, listContacts, saveContact } from "../../../lib/affiliate-contacts.js";
import { markDoNotContact } from "../../../lib/prospecting-queue.js";
import { listClaims, markClaimContacted, recordClaimInbound, reserveClaimLeads } from "../../../lib/affiliate-claims.js";
import { enrichClaimQualifications, listInterestedClaims, markClaimInterested } from "../../../lib/affiliate-qualification.js";
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
    if (url.searchParams.get("instagram") === "1" && url.searchParams.get("discover") === "1") return Response.json(await discoverInstagramContacts({...actor,city:url.searchParams.get("city"),uf:url.searchParams.get("uf"),name:url.searchParams.get("name"),offset:url.searchParams.get("offset")}), {headers:{"cache-control":"no-store"}});
    if (url.searchParams.get("instagram") === "1") return Response.json(await listInstagramContacts({...actor,view:url.searchParams.get("view"),query:url.searchParams.get("query"),offset:url.searchParams.get("offset")}), {headers:{"cache-control":"no-store"}});
    if (url.searchParams.get("detail")) return Response.json(await getContact({...actor,key:url.searchParams.get("detail")}), {headers:{"cache-control":"no-store"}});
    if (url.searchParams.get("crm") === "1") return Response.json(await listContacts({...actor,view:url.searchParams.get("view"),view:url.searchParams.get("view"),query:url.searchParams.get("query"),offset:url.searchParams.get("offset")}), {headers:{"cache-control":"no-store"}});
    if (url.searchParams.get("summary") === "1") {
      return Response.json(await getClaimSummary(actor.prospectorKey), { headers: { "cache-control": "no-store" } });
    }
    const view = url.searchParams.get("view") || "contacted";
    const input = {
      ...actor,
      view,
      limit: url.searchParams.get("limit") || "50",
      offset: url.searchParams.get("offset") || "0",
    };
    const result = view === "interested"
      ? await listInterestedClaims(input)
      : await enrichClaimQualifications(await listClaims(input));
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
    if (action === "instagram_enqueue") return Response.json(await enqueueInstagramContacts({...body,...actor}), {headers:{"cache-control":"no-store"}});
    if (["save_instagram","instagram_contacted","instagram_block","instagram_unqueue"].includes(action)) return Response.json(await updateInstagramContact({...body,...actor}), {headers:{"cache-control":"no-store"}});
    if (action === "save_contact") return Response.json(await saveContact({...body,...actor}), {headers:{"cache-control":"no-store"}});
    if (action === "reserve") {
      const result = await reserveClaimLeads(body?.leads, { ...actor, city: body?.city || "" });
      return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
    }
    if (action === "do_not_contact") return Response.json(await markDoNotContact(actor.prospectorKey,body.key),{headers:{"cache-control":"no-store"}});
    if (action === "interested") {
      const item = await markClaimInterested(body?.key, actor);
      return Response.json({ item }, { headers: { "cache-control": "no-store" } });
    }
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
