import { getSessionAccess } from "../../../../db/auth";
import { getMercadoPagoIntegrationStatus, getMercadoPagoMarketplaceStatus, saveMercadoPagoCredentials, saveMercadoPagoMarketplaceCredentials } from "../../../../db/platform-secrets";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    return noStore({ status: await getMercadoPagoIntegrationStatus(access), marketplaceStatus: await getMercadoPagoMarketplaceStatus(access) });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível consultar a integração." }, 403);
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    const data = await request.json() as { action?: string; accessToken?: string; webhookSecret?: string; clientId?: string; clientSecret?: string };
    if (data.action === "save-marketplace") {
      await saveMercadoPagoMarketplaceCredentials(access, { clientId: String(data.clientId ?? ""), clientSecret: String(data.clientSecret ?? "") });
      return noStore({ ok: true, marketplaceStatus: await getMercadoPagoMarketplaceStatus(access) });
    }
    const account = await saveMercadoPagoCredentials(access, {
      accessToken: String(data.accessToken ?? ""),
      webhookSecret: String(data.webhookSecret ?? ""),
    });
    return noStore({
      ok: true,
      account,
      status: await getMercadoPagoIntegrationStatus(access),
      marketplaceStatus: await getMercadoPagoMarketplaceStatus(access),
    });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível conectar o Mercado Pago." }, 400);
  }
}
