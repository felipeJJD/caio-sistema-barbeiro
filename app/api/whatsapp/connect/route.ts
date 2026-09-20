import { getSessionAccess } from "../../../../db/auth";
import { isOrganizationAccessExpired } from "../../../../db/access";
import {
  completeWhatsappEmbeddedSignup,
  getWhatsappAutomationStatus,
  getWhatsappEmbeddedSignupClientConfig,
} from "../../../../db/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode conectar o WhatsApp." }, { status: 403 });
    return Response.json(
      { config: getWhatsappEmbeddedSignupClientConfig(), whatsapp: await getWhatsappAutomationStatus(access) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível preparar a conexão com a Meta." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode conectar o WhatsApp." }, { status: 403 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "O período da barbearia terminou. Renove o plano antes de conectar o WhatsApp." }, { status: 402 });

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 12_000) return Response.json({ error: "Solicitação muito grande." }, { status: 413 });
    const data = await request.json() as Record<string, unknown>;
    const mode = String(data.mode ?? "cloud") === "coexistence" ? "coexistence" : "cloud";
    const whatsapp = await completeWhatsappEmbeddedSignup(access, {
      code: String(data.code ?? ""),
      wabaId: String(data.wabaId ?? ""),
      phoneNumberId: String(data.phoneNumberId ?? ""),
      mode,
    });
    return Response.json({ ok: true, whatsapp }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível concluir a conexão com a Meta." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
