import { findPublicMembership } from "../../../../../db/public-booking";
import { enforceRateLimit, RateLimitError } from "../../../../../db/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 6_000) return Response.json({ error: "Solicitação muito grande." }, { status: 413 });
    const data = await request.json() as Record<string, unknown>;
    const forwardedIp = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "";
    await enforceRateLimit({
      scope: "public-membership-lookup",
      identifier: forwardedIp ? `${forwardedIp}:${slug.trim().toLowerCase()}` : undefined,
      limit: 20,
      windowMs: 60 * 60 * 1000,
      message: "Muitas tentativas de identificação. Aguarde um pouco e tente novamente.",
    });
    const membership = await findPublicMembership(slug, String(data.name ?? ""), String(data.phone ?? ""));
    return Response.json({ membership }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível identificar o mensalista." },
      { status: error instanceof RateLimitError ? 429 : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
