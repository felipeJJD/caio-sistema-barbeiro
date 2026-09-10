import { getSessionAccess } from "../../../db/auth";
import { getBookingPaymentSettings, saveBookingPaymentSettings } from "../../../db/booking-payments";

export async function GET() {
  const access = await getSessionAccess();
  if (!access || !access.isOwner) return Response.json({ error: "Acesso não autorizado." }, { status: 401 });
  return Response.json({ settings: await getBookingPaymentSettings(access.organizationId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access || !access.isOwner) return Response.json({ error: "Acesso não autorizado." }, { status: 401 });
    const data = await request.json() as Record<string, unknown>;
    await saveBookingPaymentSettings(access, { pixEnabled: Boolean(data.pixEnabled), pixKey: String(data.pixKey ?? ""), cashEnabled: Boolean(data.cashEnabled), debitEnabled: Boolean(data.debitEnabled), creditEnabled: Boolean(data.creditEnabled) });
    return Response.json({ ok: true, settings: await getBookingPaymentSettings(access.organizationId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: 400 });
  }
}
