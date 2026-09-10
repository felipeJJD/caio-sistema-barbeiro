import { createPublicBooking, getPublicBookingPaymentOptions, getPublicBookingSlots, reportPublicBookingPix } from "../../../../db/public-booking";
import { enforceRateLimit, RateLimitError } from "../../../../db/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    if (url.searchParams.get("payments") === "1") {
      const payments = await getPublicBookingPaymentOptions(slug);
      if (!payments) return Response.json({ error: "Barbearia não encontrada." }, { status: 404, headers: { "Cache-Control": "no-store" } });
      return Response.json({ payments }, { headers: { "Cache-Control": "no-store" } });
    }
    const slots = await getPublicBookingSlots(
      slug,
      url.searchParams.get("date") ?? "",
      Number(url.searchParams.get("serviceId") ?? 0),
      Number(url.searchParams.get("barberId") ?? 0),
    );
    return Response.json({ slots }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar os horários." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 12_000) return Response.json({ error: "Solicitação muito grande." }, { status: 413 });
    const { slug } = await params;
    const data = await request.json() as Record<string, unknown>;
    if (String(data.website ?? "")) return Response.json({ ok: true });
    const forwardedIp = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "";
    await enforceRateLimit({
      scope: "public-booking",
      identifier: forwardedIp ? `${forwardedIp}:${slug.trim().toLowerCase()}` : undefined,
      limit: 10,
      windowMs: 60 * 60 * 1000,
      message: "Muitas tentativas de agendamento. Aguarde um pouco e tente novamente.",
    });
    const booking = await createPublicBooking(slug, {
      date: String(data.date ?? ""),
      time: String(data.time ?? ""),
      serviceId: Number(data.serviceId ?? 0),
      barberId: Number(data.barberId ?? 0),
      clientName: String(data.clientName ?? ""),
      phone: String(data.phone ?? ""),
      paymentChoice: String(data.paymentChoice ?? ""),
      isMembership: Boolean(data.isMembership),
    });
    return Response.json({ ok: true, booking }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir o agendamento." }, { status: error instanceof RateLimitError ? 429 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const data = await request.json() as Record<string, unknown>;
    return Response.json(await reportPublicBookingPix(slug, Number(data.appointmentId), String(data.paymentToken ?? "")), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível informar o pagamento." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
