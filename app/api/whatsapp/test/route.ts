import { getSessionAccess } from "../../../../db/auth";
import { isOrganizationAccessExpired } from "../../../../db/access";
import { simulateCaAtende, type CaAtendeTestState } from "../../../../db/ca-atende";
import { enforceRateLimit, RateLimitError } from "../../../../db/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode testar o C.A. Atende." }, { status: 403 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "O período da barbearia terminou. Renove o plano para testar o C.A. Atende." }, { status: 402 });

    if (Number(request.headers.get("content-length") || 0) > 12000) {
      return Response.json({ error: "A mensagem de teste ficou muito grande." }, { status: 413 });
    }

    const body = await request.json() as {
      message?: unknown;
      state?: Partial<CaAtendeTestState>;
    };
    const message = typeof body.message === "string" ? body.message.trim().slice(0,1200) : "";
    if (!message) return Response.json({ error: "Escreva uma mensagem para testar." }, { status: 400 });

    await enforceRateLimit({
      scope: "ca-atende-test",
      identifier: `${access.organizationId}:${access.teamMemberId}`,
      limit: 40,
      windowMs: 60_000,
      message: "Você enviou muitos testes seguidos. Aguarde um minuto e tente novamente.",
    });

    const result = await simulateCaAtende({
      organizationId: access.organizationId,
      message,
      state: body.state,
    });

    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: 429 });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível testar o C.A. Atende." }, { status: 400 });
  }
}
