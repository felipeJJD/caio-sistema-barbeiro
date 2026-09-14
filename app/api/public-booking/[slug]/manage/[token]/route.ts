import { cancelPublicBooking, getPublicBookingManagement, reschedulePublicBooking } from "@/db/public-booking";
import { enforceRateLimit, RateLimitError } from "@/db/rate-limit";

export const dynamic = "force-dynamic";

async function limited(request: Request, slug: string) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await enforceRateLimit({ scope: "public-booking-manage", identifier: `${ip}:${slug}`, limit: 20, windowMs: 60 * 60 * 1000, message: "Muitas tentativas. Aguarde um pouco e tente novamente." });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  try {
    const { slug, token } = await params;
    await limited(request, slug);
    const booking = await getPublicBookingManagement(slug, token);
    if (!booking) return Response.json({ error: "Este link não é válido ou já expirou." }, { status: 404 });
    return Response.json({ booking }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o horário." }, { status: error instanceof RateLimitError ? 429 : 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  try {
    const { slug, token } = await params;
    await limited(request, slug);
    const body = await request.json() as Record<string, unknown>;
    const booking = body.action === "cancel"
      ? await cancelPublicBooking(slug, token)
      : body.action === "reschedule"
        ? await reschedulePublicBooking(slug, token, String(body.date ?? ""), String(body.time ?? ""))
        : null;
    if (!booking) throw new Error("Escolha uma ação válida.");
    return Response.json({ ok: true, booking }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar o horário." }, { status: error instanceof RateLimitError ? 429 : 400 });
  }
}
