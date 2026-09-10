import { syncMercadoPagoPayment, validateMercadoPagoWebhookSignature } from "../../../../../db/billing";

type MercadoPagoNotification = {
  type?: string;
  action?: string;
  data?: { id?: string | number };
};

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const payload = await request.json().catch(() => ({})) as MercadoPagoNotification;
    const dataId = String(url.searchParams.get("data.id") ?? url.searchParams.get("data_id") ?? payload.data?.id ?? "");
    const notificationType = url.searchParams.get("type") ?? payload.type ?? "";
    if (!dataId || (notificationType && notificationType !== "payment")) return Response.json({ ok: true });
    if (!await validateMercadoPagoWebhookSignature(request, dataId)) {
      return Response.json({ error: "Assinatura inválida." }, { status: 401 });
    }
    await syncMercadoPagoPayment(dataId);
    return Response.json({ ok: true });
  } catch {
    // O Mercado Pago repetirá a notificação quando houver uma falha temporária.
    return Response.json({ error: "Não foi possível processar a notificação." }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, service: "mercado-pago-webhook" });
}
