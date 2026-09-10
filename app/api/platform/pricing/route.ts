import { getSessionAccess } from "../../../../db/auth";
import { getPlatformBillingOffer, savePlatformBillingOffer } from "../../../../db/platform-billing";
import { requirePlatformAdmin } from "../../../../db/access";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    requirePlatformAdmin(access);
    return noStore({ offer: await getPlatformBillingOffer() });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível consultar o preço." }, 403);
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    const data = await request.json() as {
      pixPriceCents?: number;
      quarterlyDiscountBps?: number;
      semiannualDiscountBps?: number;
      annualDiscountBps?: number;
    };
    const offer = await savePlatformBillingOffer(access, {
      pixPriceCents: Number(data.pixPriceCents),
      quarterlyDiscountBps: Number(data.quarterlyDiscountBps),
      semiannualDiscountBps: Number(data.semiannualDiscountBps),
      annualDiscountBps: Number(data.annualDiscountBps),
    });
    return noStore({ ok: true, offer });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível salvar o preço." }, 400);
  }
}
