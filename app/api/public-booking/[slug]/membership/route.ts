import { findPublicMembership, searchPublicMembershipNames } from "../../../../../db/public-booking";
import { enforceRateLimit, RateLimitError } from "../../../../../db/rate-limit";

export const dynamic = "force-dynamic";

function requesterKey(request: Request, slug: string) {
  const forwardedIp = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "";
  return forwardedIp ? `${forwardedIp}:${slug.trim().toLowerCase()}` : undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const query = String(url.searchParams.get("q") ?? "").trim();
    if (query.length < 3) return Response.json({ candidates: [] }, { headers: { "Cache-Control": "no-store" } });
    await enforceRateLimit({
      scope: "public-membership-search",
      identifier: requesterKey(request, slug),
      limit: 80,
      windowMs: 60 * 60 * 1000,
      message: "Muitas buscas de mensalista. Aguarde um pouco e tente novamente.",
    });
    const candidates = await searchPublicMembershipNames(slug, query);
    return Response.json({ candidates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível procurar o mensalista." },
      { status: error instanceof RateLimitError ? 429 : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 6_000) return Response.json({ error: "Solicitação muito grande." }, { status: 413 });
    const data = await request.json() as Record<string, unknown>;
    await enforceRateLimit({
      scope: "public-membership-lookup",
      identifier: requesterKey(request, slug),
      limit: 30,
      windowMs: 60 * 60 * 1000,
      message: "Muitas tentativas de identificação. Aguarde um pouco e tente novamente.",
    });
    const membership = await findPublicMembership(
      slug,
      String(data.name ?? ""),
      String(data.phone ?? ""),
      Number(data.clientId ?? 0),
    );
    return Response.json({ membership }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível identificar o mensalista." },
      { status: error instanceof RateLimitError ? 429 : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
