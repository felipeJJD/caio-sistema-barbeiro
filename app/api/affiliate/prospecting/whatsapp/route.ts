import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { affiliateProspectingFetch, affiliateProspectorIdentity } from "../../../../../lib/affiliate-prospecting-bridge";
import {
  beginProspectingWhatsappPairing,
  getProspectingWhatsappState,
  sendProspectingWhatsappText,
} from "../../../../../lib/affiliate-prospecting-whatsapp";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function errorStatus(error: unknown) {
  const status = Number((error as { status?: number } | null)?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 503;
}

export async function GET() {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access?.active) return noStore({ error: "Entre como afiliado para usar a prospecção." }, 401);
    return noStore({ ...(await getProspectingWhatsappState()), canConnect: Boolean(access.isAdmin) });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível consultar o WhatsApp de prospecção." }, errorStatus(error));
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access?.active) return noStore({ error: "Entre como afiliado para usar a prospecção." }, 401);
    const body = await request.json().catch(() => null) as {
      action?: string;
      phone?: string;
      message?: string;
      lead?: { id?: string; name?: string; phone?: string; phoneE164?: string; address?: string };
      city?: string;
    } | null;
    const action = String(body?.action ?? "");

    if (action === "connect") {
      if (!access.isAdmin) return noStore({ error: "Somente o ADM pode conectar o número automático de prospecção." }, 403);
      return noStore(await beginProspectingWhatsappPairing(String(body?.phone ?? "")));
    }

    if (action !== "send") return noStore({ error: "Ação inválida." }, 400);
    const lead = body?.lead ?? {};
    const phoneE164 = String(lead.phoneE164 ?? "").replace(/\D/g, "");
    const message = String(body?.message ?? "").trim();
    if (!/^55\d{11}$/.test(phoneE164)) return noStore({ error: "Celular inválido para envio automático." }, 400);
    if (!message || message.length > 1200) return noStore({ error: "A mensagem precisa ter entre 1 e 1200 caracteres." }, 400);

    const identity = affiliateProspectorIdentity(access);
    const reserve = await affiliateProspectingFetch("/api/claims", {
      method: "POST",
      body: {
        action: "reserve",
        leads: [{
          id: String(lead.id ?? "").slice(0, 180),
          name: String(lead.name ?? "Barbearia").slice(0, 240),
          phone: String(lead.phone ?? "").slice(0, 40),
          phoneE164,
          address: String(lead.address ?? "").slice(0, 600),
        }],
        city: String(body?.city ?? "").slice(0, 180),
      },
      ...identity,
    });
    const reservePayload = reserve.payload as { reserved?: Array<{ phoneE164?: string }>; blocked?: Array<{ reason?: string }>; error?: string };
    if (!reserve.response.ok) return noStore(reservePayload, reserve.response.status);
    const reserved = Array.isArray(reservePayload.reserved) && reservePayload.reserved.some((item) => item.phoneE164 === phoneE164);
    if (!reserved) {
      const reason = reservePayload.blocked?.[0]?.reason || "Essa barbearia não está mais disponível para envio.";
      return noStore({ error: reason }, 409);
    }

    const sent = await sendProspectingWhatsappText(phoneE164, message);
    const contacted = await affiliateProspectingFetch("/api/claims", {
      method: "POST",
      body: {
        action: "contacted",
        key: `phone:${phoneE164}`,
        message,
        providerMessageId: sent.providerMessageId,
      },
      ...identity,
    });

    if (!contacted.response.ok) {
      console.error("[C.A. Prospecção] mensagem enviada, mas contato não foi finalizado", {
        phoneE164,
        status: contacted.response.status,
      });
      return noStore({ sent: true, ...sent, warning: "Mensagem enviada, mas o registro do contato precisa ser conferido." }, 200);
    }

    return noStore({ sent: true, ...sent });
  } catch (error) {
    console.error("[C.A. Prospecção] WhatsApp automático", {
      message: error instanceof Error ? error.message : String(error),
    });
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível enviar automaticamente." }, errorStatus(error));
  }
}
